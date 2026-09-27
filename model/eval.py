"""Base vs tuned on the 20 held-out Faceplate tasks, scored by a deterministic checker.

    python model/eval.py                  # base and tuned (tuned = model/runs/latest.json)
    python model/eval.py --which base     # base only; safe to run while train.py is running
    python model/eval.py --which tuned    # tuned only; merges with the base rows already saved

Writes model/runs/eval.json and prints a two-row table.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from faceplate_common import (  # noqa: E402
    DATA_DIR, DEFAULT_MODEL, LEARNED, RUNS_DIR, build_messages, check_output, make_client,
    read_jsonl, read_latest, reference_match, response_text,
)

EVAL_OUT = RUNS_DIR / "eval.json"
CHECKS = ["json", "keys", "no_green", "palette", "tags", "units"]
SAMPLING = {"temperature": 0, "chat_template_kwargs": {"enable_thinking": False}}


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--which", choices=["both", "base", "tuned"], default="both")
    p.add_argument("--model", default=None, help="base model (default: latest.json's, else env/default)")
    p.add_argument("--checkpoint", default=None, help="inference checkpoint (default: latest.json)")
    p.add_argument("--rank", type=int, default=None)
    p.add_argument("--max-tokens", type=int, default=400)
    p.add_argument("--limit", type=int, default=None)
    p.add_argument("--data", type=Path, default=DATA_DIR / "eval.jsonl")
    return p.parse_args()


def run_side(label, rows, complete):
    out = []
    for row in rows:
        msgs = build_messages(row["component"], row["instruction"], row["rules"])
        t0 = time.monotonic()
        try:
            raw = response_text(complete(msgs))
            error = None
        except Exception as exc:  # recorded as a failed example, not a crash
            raw, error = "", f"{type(exc).__name__}: {exc}"
        verdict = check_output(row["component"]["type"], raw)
        match = reference_match(verdict["patch"], row["patch"])
        out.append({"id": row["id"], "raw": raw, "error": error, "patch": verdict.pop("patch"),
                    "checks": verdict, **match, "seconds": round(time.monotonic() - t0, 2)})
        mark = "PASS" if verdict["pass"] else "fail"
        print(f"[{label}] {row['id']} {mark}  {raw[:90]!r}" + (f"  ERR {error}" if error else ""),
              flush=True)
    return out


def summarize(results):
    n = len(results)
    if not n:
        return None
    s = {"n": n, "pass": sum(r["checks"]["pass"] for r in results) / n}
    for c in CHECKS:
        s[c] = sum(r["checks"][c] for r in results) / n
    s["exact"] = sum(r["exact"] for r in results) / n
    s["field_recall"] = sum(r["field_recall"] for r in results) / n
    s["errors"] = sum(1 for r in results if r["error"])
    return s


def print_table(summary):
    cols = ["pass"] + CHECKS + ["exact", "field_recall"]
    head = f"{'model':<7}" + "".join(f"{c:>13}" for c in cols)
    print("\n" + head)
    print("-" * len(head))
    for side in ("base", "tuned"):
        s = summary.get(side)
        if not s:
            print(f"{side:<7}" + "".join(f"{'-':>13}" for _ in cols))
            continue
        print(f"{side:<7}" + "".join(f"{s[c] * 100:>12.0f}%" for c in cols))
    print(f"(n={next((s['n'] for s in summary.values() if s), 0)} held-out tasks; "
          "pass = valid JSON + allowed keys + no green + house palette + Station01 tags + units)")


def main() -> int:
    args = parse_args()
    import river_client as river

    rows = read_jsonl(args.data)[: args.limit]
    latest = read_latest()
    base_model = args.model or (latest or {}).get("base_model") or os.environ.get("RIVER_MODEL", DEFAULT_MODEL)
    checkpoint = args.checkpoint or (latest or {}).get("checkpoint")
    rank = args.rank or (latest or {}).get("rank", 16)

    previous = {}
    if EVAL_OUT.exists():
        try:
            previous = json.loads(EVAL_OUT.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            previous = {}

    results = {"base": None, "tuned": None}
    client = make_client()
    try:
        if args.which in ("both", "base"):
            results["base"] = run_side("base", rows, lambda m: client.chat_complete(
                m, base_model=base_model, max_tokens=args.max_tokens, **SAMPLING))
        if args.which in ("both", "tuned"):
            if not checkpoint:
                raise SystemExit("No tuned checkpoint: run model/train.py first or pass --checkpoint")
            with client.session(experiment="faceplate-eval") as session:
                tuned = session.create_model(base_model=base_model, lora=river.LoraConfig(rank=rank))
                tuned.load_weights(checkpoint, load_optimizer=False)
                results["tuned"] = run_side("tuned", rows, lambda m: tuned.chat_complete(
                    m, max_tokens=args.max_tokens, **SAMPLING))
    finally:
        client.close()

    ids = [r["id"] for r in rows]
    for side in ("base", "tuned"):
        if results[side] is None:
            old = {e["id"]: e.get(side) for e in previous.get("examples", []) if e.get(side)}
            if old and all(i in old for i in ids) and previous.get("base_model") == base_model:
                results[side] = [old[i] for i in ids]

    summary = {side: summarize(res) if res else None for side, res in results.items()}
    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "base_model": base_model,
        "checkpoint": checkpoint if results["tuned"] else None,
        "training": {k: latest.get(k) for k in ("run_id", "steps", "lr", "rank", "batch_size",
                                                 "loss_first", "loss_last", "losses",
                                                 "train_examples")} if latest else None,
        "learned": LEARNED,
        "checks": {
            "json": "output parses to a JSON object",
            "keys": "only the patch keys allowed for this component type",
            "no_green": "no green hex/rgb/color name anywhere",
            "palette": "every color is #4A4A48, #E0301E or #F5A623",
            "tags": "tag paths match [default]Station01/<Equip>/<Point> for real equipment",
            "units": "labels and thresholds carry units",
            "exact": "patch equals the reference patch",
            "field_recall": "share of reference fields reproduced exactly",
        },
        "summary": summary,
        "examples": [
            {"id": row["id"], "component": row["component"], "instruction": row["instruction"],
             "rules": row["rules"], "reference": row["patch"],
             "base": results["base"][i] if results["base"] else None,
             "tuned": results["tuned"][i] if results["tuned"] else None}
            for i, row in enumerate(rows)
        ],
    }
    RUNS_DIR.mkdir(parents=True, exist_ok=True)
    EVAL_OUT.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print_table(summary)
    print(f"wrote {EVAL_OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

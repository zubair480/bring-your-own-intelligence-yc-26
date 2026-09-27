"""LoRA SFT of Qwen on River for the Faceplate house-style edit task.

    python model/train.py                     # 15 steps x 8 examples on the default model
    python model/train.py --model Qwen/Qwen3.5-9B   # faster base
    python model/train.py --check             # health check + capabilities only
    python model/train.py --resume --steps 10 # continue from the last training checkpoint

Logs loss per step and writes model/runs/latest.json with the checkpoint path.
"""
from __future__ import annotations

import argparse
import json
import os
import random
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from faceplate_common import (  # noqa: E402
    DATA_DIR, DEFAULT_MODEL, LATEST_PATH, RUNS_DIR, build_messages, make_client, read_jsonl,
    read_latest,
)


def parse_args():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--model", default=os.environ.get("RIVER_MODEL", DEFAULT_MODEL))
    p.add_argument("--steps", type=int, default=15)
    p.add_argument("--batch-size", type=int, default=8)
    p.add_argument("--lr", type=float, default=2e-4)
    p.add_argument("--rank", type=int, default=16)
    p.add_argument("--seed", type=int, default=0)
    p.add_argument("--data", type=Path, default=DATA_DIR / "train.jsonl")
    p.add_argument("--resume", action="store_true", help="continue from latest.json's training checkpoint")
    p.add_argument("--check", action="store_true", help="only run health_check/get_capabilities")
    return p.parse_args()


def atomic_json(path: Path, obj: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(obj, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


def main() -> int:
    args = parse_args()
    import river_client as river
    from river_client.renderers import TrainOnWhat, get_renderer

    client = make_client()
    try:
        print(f"health_check: {client.health_check()}", flush=True)
        caps = client.get_capabilities()
        print(f"capabilities: {caps}", flush=True)
        if args.check:
            return 0

        rows = read_jsonl(args.data)
        renderer = get_renderer(args.model, thinking=False)
        examples = []
        for row in rows:
            msgs = build_messages(row["component"], row["instruction"], row["rules"])
            msgs.append({"role": "assistant", "content": row["target"]})
            ex = renderer.build_training_example(
                msgs, train_on=TrainOnWhat.LAST_ASSISTANT, train_on_eos=True, max_length=None)
            if ex.num_loss_tokens <= 0:
                raise ValueError(f"{row['id']} has no loss tokens")
            examples.append(ex.to_dict())
        print(f"model={args.model} examples={len(examples)} steps={args.steps} "
              f"batch={args.batch_size} lr={args.lr} rank={args.rank}", flush=True)

        rng = random.Random(args.seed)
        order: list[int] = []
        while len(order) < args.steps * args.batch_size:
            epoch = list(range(len(examples)))
            rng.shuffle(epoch)
            order.extend(epoch)

        run_id = datetime.now(timezone.utc).strftime("faceplate-%Y%m%dT%H%M%SZ")
        run_dir = RUNS_DIR / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        prior = read_latest() if args.resume else None
        if args.resume and not (prior and prior.get("training_checkpoint")):
            raise SystemExit("--resume needs model/runs/latest.json with a training_checkpoint")

        losses: list[float | None] = []
        started = time.monotonic()
        with client.session(experiment="faceplate-sft") as session:
            model = session.create_model(base_model=args.model, lora=river.LoraConfig(rank=args.rank))
            if prior:
                model.load_weights(prior["training_checkpoint"], load_optimizer=True)
                print(f"resumed from {prior['training_checkpoint']}", flush=True)
            try:
                for step in range(1, args.steps + 1):
                    idx = order[(step - 1) * args.batch_size: step * args.batch_size]
                    t0 = time.monotonic()
                    fb, opt = model.train_step([examples[i] for i in idx], lr=args.lr,
                                               loss_fn="cross_entropy")
                    metrics = dict(fb.metrics)
                    loss = metrics.get("loss_mean", metrics.get("loss"))
                    losses.append(loss)
                    dt = time.monotonic() - t0
                    print(f"step {step:2d}/{args.steps}  loss={loss}  ({dt:.1f}s)", flush=True)
                    with (run_dir / "steps.jsonl").open("a", encoding="utf-8") as f:
                        f.write(json.dumps({"step": step, "loss": loss, "seconds": dt,
                                            "examples": [rows[i]["id"] for i in idx],
                                            "metrics": metrics,
                                            "optimizer_metrics": dict(opt.metrics)}) + "\n")
            finally:
                if losses:
                    print("saving weights...", flush=True)
                    inference = model.save_weights(f"{run_id}-inf", mode="inference")
                    training = model.save_weights(f"{run_id}-train", mode="training",
                                                  ttl=timedelta(days=7))
                    record = {
                        "checkpoint": inference.path,
                        "training_checkpoint": training.path,
                        "base_model": args.model,
                        "rank": args.rank,
                        "lr": args.lr,
                        "batch_size": args.batch_size,
                        "steps": len(losses) + (prior.get("steps", 0) if prior else 0),
                        "losses": losses,
                        "loss_first": losses[0],
                        "loss_last": losses[-1],
                        "train_examples": len(examples),
                        "run_id": run_id,
                        "resumed_from": prior.get("run_id") if prior else None,
                        "created_at": datetime.now(timezone.utc).isoformat(),
                        "train_seconds": round(time.monotonic() - started, 1),
                    }
                    atomic_json(run_dir / "latest.json", record)
                    atomic_json(LATEST_PATH, record)
                    print(f"checkpoint: {inference.path}", flush=True)
                    print(f"loss: {losses[0]} -> {losses[-1]}", flush=True)
                    print(f"wrote {LATEST_PATH}", flush=True)
    finally:
        client.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

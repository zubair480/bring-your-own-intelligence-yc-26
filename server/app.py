"""Faceplate backend: component edit suggestions grounded in GBrain HMI rules.

Run from the repo root:
    python -m uvicorn server.app:app --port 8000

Endpoints: GET /api/health, POST /api/edit, POST /api/accept, GET /api/decisions.
See docs/api.md for the contract. Never logs the GBrain token.
"""
from __future__ import annotations

import concurrent.futures
import importlib
import json
import os
import re
import sys
import threading
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, ConfigDict

SERVER_DIR = Path(__file__).resolve().parent
REPO_ROOT = SERVER_DIR.parent
for p in (str(REPO_ROOT), str(SERVER_DIR)):
    if p not in sys.path:
        sys.path.insert(0, p)

from gbrain_client import GBrainClient, GBrainError  # noqa: E402

DATA_DIR = SERVER_DIR / "data"
PAIRS_PATH = DATA_DIR / "pairs.jsonl"
LOCAL_DECISIONS_PATH = DATA_DIR / "decisions.jsonl"
DECISIONS_SLUG = "decisions/log"
TRAIN_EVERY = 8
MODEL_TIMEOUT_S = float(os.environ.get("FACEPLATE_MODEL_TIMEOUT", "25"))
FORCE_RULES = os.environ.get("FACEPLATE_FORCE_RULES", "") not in ("", "0", "false")

RUNNING = "#4A4A48"
ALARM_HIGH = "#E0301E"
WARNING = "#F5A623"

app = FastAPI(title="Faceplate backend")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --------------------------------------------------------------------------
# GBrain access (one shared client, reset + retry once on failure)
# --------------------------------------------------------------------------
_gb: GBrainClient | None = None
_gb_lock = threading.Lock()
_log_lock = threading.Lock()
_health_cache: dict[str, Any] = {"t": 0.0, "ok": False}


def _client() -> GBrainClient:
    global _gb
    with _gb_lock:
        if _gb is None:
            c = GBrainClient(timeout=15)
            c.initialize()
            _gb = c
        return _gb


def gb_call(fn):
    """Run fn(client); on any error reset the session and retry once."""
    global _gb
    try:
        return fn(_client())
    except Exception:
        with _gb_lock:
            _gb = None
        return fn(_client())


def gbrain_ok() -> bool:
    now = time.time()
    if now - _health_cache["t"] < 20:
        return _health_cache["ok"]
    try:
        gb_call(lambda c: c.get_page("hmi/style-guide"))
        ok = True
    except Exception:
        ok = False
    _health_cache.update(t=now, ok=ok)
    return ok


# --------------------------------------------------------------------------
# Optional trained model (model/edit_model.py, owned by another agent)
# --------------------------------------------------------------------------
_model_state: dict[str, Any] = {"fn": None, "t": 0.0}
_model_lock = threading.Lock()
_pool = concurrent.futures.ThreadPoolExecutor(max_workers=2)


def get_model_fn():
    if FORCE_RULES:
        return None
    with _model_lock:
        if _model_state["fn"] is not None:
            return _model_state["fn"]
        if time.time() - _model_state["t"] < 20:  # retry failed import every 20s
            return None
        _model_state["t"] = time.time()
        try:
            mod = importlib.import_module("model.edit_model")
            fn = getattr(mod, "edit_component")
            _model_state["fn"] = fn
            return fn
        except Exception:
            return None


# --------------------------------------------------------------------------
# Rules engine (deterministic demo fallback, ISA-101)
# --------------------------------------------------------------------------
STYLE = ("hmi/style-guide", "HMI Style Guide (ISA-101)")
TAGS = ("plant/station-01-tags", "Station 01 Tags")
RULES = {
    "running": (STYLE, "running equipment uses a dark gray #4A4A48 fill with a white label, never green"),
    "abnormal": (STYLE, "color is reserved for abnormal conditions (alarm high #E0301E, warning #F5A623)"),
    "units": (STYLE, "units are always shown next to values (%, GPM, A)"),
    "tags": (TAGS, "tag paths follow [default]Station01/<Equip>/<Point>"),
    "alarms": (STYLE, "alarm displays surface abnormal conditions first, filtered by priority"),
    "trend": (TAGS, "trends bind Station 01 tags at [default]Station01/<Equip>/<Point> over a fixed window"),
    "note": (STYLE, "screen changes are recorded against the team HMI standard"),
}

ALLOWED = {
    "pump": {"runFill", "runLabel", "showSpeed", "showAmps", "faultColor"},
    "tank": {"showLimits", "hi", "lo", "showVolume", "tag"},
    "alarm": {"minPriority", "showAckAll"},
    "chart": {"rangeMinutes", "secondAxis"},
    "label": {"units", "warnAbove", "showBar"},
    "valve": {"showOpenPct"},
    "sensor": {"showTotal", "warnBelow"},
    "container": {"note"},
}

NEG = r"(?:hide|remove|no|not|without|don'?t|do not|turn off|disable|drop|exclude|filter out|skip|stop showing|get rid of)"
NUM = r"(\d+(?:\.\d+)?)"
WORD_NUMS = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "fifteen": 15, "twenty": 20,
    "twenty-four": 24, "twenty four": 24, "thirty": 30, "forty-five": 45, "sixty": 60, "ninety": 90,
}


def normalize(text: str) -> str:
    t = (text or "").lower()
    t = re.sub(r"\bhalf an hour\b", "30 minutes", t)
    t = re.sub(r"\b(?:an|a|last|past|one) hour\b", "1 hour", t)
    t = re.sub(r"\b(?:a|last|past|one) day\b", "1 day", t)
    t = re.sub(r"\b(?:a|one|per|last|past|full) shift\b", "8 hours", t)
    for w in sorted(WORD_NUMS, key=len, reverse=True):
        t = re.sub(rf"\b{w}\b", str(WORD_NUMS[w]), t)
    return t


def has(t: str, pat: str) -> bool:
    return re.search(rf"\b(?:{pat})\b", t) is not None


def wants(t: str, pat: str) -> Optional[bool]:
    """None if not mentioned, False if negated just before it, else True."""
    m = re.search(rf"\b(?:{pat})\b", t)
    if not m:
        return None
    before = t[max(0, m.start() - 30): m.start()]
    return not re.search(rf"\b{NEG}\b", before)


def first_num(t: str, pat: str) -> Optional[float]:
    m = re.search(rf"\b(?:{pat})\b\D{{0,15}}?{NUM}", t)
    if not m:
        return None
    v = float(m.group(1))
    return int(v) if v.is_integer() else v


EQUIP_RE = re.compile(r"\b([A-Za-z]{1,3})-?(\d{3})\b")


def equip_id(*texts: str | None, prefix: str | None = None) -> Optional[str]:
    for s in texts:
        for m in EQUIP_RE.finditer(s or ""):
            pre = m.group(1).upper()
            if pre in ("ISA",):
                continue
            if prefix and pre != prefix:
                continue
            return f"{pre}-{m.group(2)}"
    return None


def family(ctype: str, name: str = "") -> str:
    s = (ctype or "").lower()
    checks = [
        ("pump", ("pump", "motor")),
        ("tank", ("tank",)),
        ("alarm", ("alarm",)),
        ("chart", ("timeseries", "chart", "trend")),
        ("valve", ("valve",)),
        ("sensor", ("sensor", "flowmeter", "meter", "transmitter")),
        ("label", ("label", "numeric", "text")),
        ("container", ("container", "flex", "coord", "column", "view", "breakpoint", "tab")),
    ]
    for fam, keys in checks:
        if any(k in s for k in keys):
            return fam
    n = (name or "").upper()
    if n.startswith("P-"):
        return "pump"
    if n.startswith("T-"):
        return "tank"
    if n.startswith("V-"):
        return "valve"
    if n.startswith("FT-"):
        return "sensor"
    return "container"


def fmt(v: Any) -> str:
    if v is None:
        return "null"
    if isinstance(v, bool):
        return "on" if v else "off"
    return str(v)


def summarize(patch: dict) -> str:
    return ", ".join(f"{k} {fmt(v)}" for k, v in patch.items())


def rules_engine(fam: str, instruction: str, name: str, cid: str, path: str, props: dict) -> tuple[dict, list[str]]:
    t = normalize(instruction)
    p: dict[str, Any] = {}
    used: list[str] = []

    if fam == "pump":
        eq = equip_id(name, cid, path) or name
        if has(t, r"run|running|runs|standard|isa|isa-101|state|states|status|on|green|style|color|colour"):
            p["runFill"] = RUNNING
            p["runLabel"] = "RUN"
            used.append("running")
        s = wants(t, r"speed|rpm|vfd|hz|frequency")
        if s is not None:
            p["showSpeed"] = s
            used.append("units")
        a = wants(t, r"amps?|amperage|current|load")
        if a is not None:
            p["showAmps"] = a
            used.append("units")
        if has(t, r"faults?|faulted|trips?|tripped|alarms?|fail\w*|abnormal|standard|warn\w*|amber"):
            p["faultColor"] = WARNING if has(t, r"warn\w*|amber|yellow|orange") else ALARM_HIGH
            used.append("abnormal")
        if not p:
            p = {"runFill": RUNNING, "runLabel": "RUN", "faultColor": ALARM_HIGH}
            used = ["running"]
        _ = eq

    elif fam == "tank":
        eq = equip_id(name, cid, path, instruction, prefix="T") or "T-101"
        lim = wants(t, r"limits?|hi|lo|high|low|alarms?|thresholds?|setpoints?|overflow|bands?|max|min")
        if lim is not None:
            p["showLimits"] = lim
            if lim:
                hi = first_num(t, r"hi|high|above|max|maximum|over") or props.get("hi") or 90
                lo = first_num(t, r"lo|low|below|min|minimum|under") or props.get("lo") or 10
                if lo > hi:
                    hi, lo = lo, hi
                p["hi"], p["lo"] = hi, lo
            used.append("abnormal")
        v = wants(t, r"volume|gallons?|gal|capacity|contents")
        if v is not None:
            p["showVolume"] = v
            used.append("units")
        if has(t, r"tags?|bind\w*|point|level|standard|path"):
            p["tag"] = f"[default]Station01/{eq}/LevelPct"
            used.append("tags")
        if not p:
            p = {"showLimits": True, "hi": 90, "lo": 10, "tag": f"[default]Station01/{eq}/LevelPct"}
            used = ["abnormal", "tags"]

    elif fam == "alarm":
        levels = {"critical": "High", "urgent": "High", "high": "High", "medium": "Medium",
                  "med": "Medium", "low": "Low", "all": "Low", "everything": "Low"}
        m = re.search(r"\b(critical|urgent|high|medium|med|low|all|everything)\b", t)
        if m:
            lvl = levels[m.group(1)]
            before = t[max(0, m.start() - 30): m.start()]
            if re.search(rf"\b{NEG}\b", before):  # "hide low priority" -> Medium and up
                lvl = {"Low": "Medium", "Medium": "High", "High": "High"}[lvl]
            p["minPriority"] = lvl
            used.append("alarms")
        ack = wants(t, r"ack\w*|acknowledg\w*")
        if ack is not None:
            p["showAckAll"] = ack
            used.append("alarms")
        if not p:
            p = {"minPriority": "High", "showAckAll": True}
            used = ["alarms"]

    elif fam == "chart":
        m = re.search(rf"{NUM}\s*(minutes?|mins?|m|hours?|hrs?|hr|h|days?|d|weeks?|wk|w)\b", t)
        if m:
            n = float(m.group(1))
            unit = m.group(2)
            mult = 1 if unit.startswith("m") else 60 if unit.startswith("h") else 1440 if unit.startswith("d") else 10080
            p["rangeMinutes"] = int(round(n * mult))
            used.append("trend")
        points = [
            (r"amps?|amperage|current|load", "P", "P-101", "Amps"),
            (r"speed|rpm|vfd", "P", "P-101", "SpeedPct"),
            (r"flow|gpm", "FT", "FT-301", "GPM"),
            (r"level|tank", "T", "T-101", "LevelPct"),
            (r"valve|open\w*|position", "V", "V-201", "OpenPct"),
        ]
        axis_neg = re.search(rf"\b{NEG}\b[^.]{{0,25}}\b(second\w*|2nd|secondary|right)\s+axis|single axis|one axis", t)
        axis_pos = re.search(r"\b(second\w*|2nd|secondary|right|dual|extra)\s+(y\s*)?axis|overlay|\badd\b|\bwith\b|\bvs\.?|versus|against|also (plot|show|trend)", t)
        if axis_neg:
            p["secondAxis"] = None
            used.append("trend")
        elif axis_pos:
            for pat, pre, default_eq, point in points:
                if has(t, pat):
                    eq = equip_id(instruction, prefix=pre) or equip_id(name, cid, path, prefix=pre) or default_eq
                    p["secondAxis"] = f"[default]Station01/{eq}/{point}"
                    used.append("tags")
                    break
        if not p:
            p = {"rangeMinutes": 480}
            used = ["trend"]

    elif fam == "label":
        unit_map = [
            (r"gpm|gallons? per min\w*|flow", "GPM"),
            (r"amps?|amperage|current", "A"),
            (r"psi|pressure", "psi"),
            (r"percent|pct|level|speed|open", "%"),
            (r"fahrenheit|temp\w*|degrees?", "°F"),
        ]
        unit = None
        if "%" in t:
            unit = "%"
        for pat, u in unit_map:
            if unit is None and has(t, pat):
                unit = u
        if unit is None:  # infer from the component itself
            ctx = normalize(f"{name} {cid} {path}")
            for pat, u in unit_map:
                if has(ctx, pat):
                    unit = u
                    break
        if unit is None and has(t, r"units?|standard"):
            unit = str(props.get("units") or "%")
        if unit is not None:
            p["units"] = unit
            used.append("units")
        wa = first_num(t, r"above|over|exceeds?|greater than|more than|higher than|warn\w* at|alarm\w* at")
        if wa is None:
            m = re.search(rf">\s*{NUM}", t)
            wa = float(m.group(1)) if m else None
            if wa is not None and wa.is_integer():
                wa = int(wa)
        if wa is not None:
            p["warnAbove"] = wa
            used.append("abnormal")
        elif re.search(rf"\b{NEG}\b[^.]{{0,20}}\b(warn\w*|alarm\w*|threshold)", t):
            p["warnAbove"] = None
            used.append("abnormal")
        bar = wants(t, r"bars?|gauge|meter|progress|fill")
        if bar is not None:
            p["showBar"] = bar
        if not p:
            p = {"units": "%"}
            used = ["units"]

    elif fam == "valve":
        v = wants(t, r"open\w*|percent|pct|position|%|standard|status|state")
        p["showOpenPct"] = True if v is None else v
        used.append("units")

    elif fam == "sensor":
        tot = wants(t, r"total\w*|cumulative|accumulated|sum")
        if tot is not None:
            p["showTotal"] = tot
            used.append("units")
        wb = first_num(t, r"below|under|less than|lower than|drops? below|falls? below|warn\w* at")
        if wb is not None:
            p["warnBelow"] = wb
            used.append("abnormal")
        elif re.search(rf"\b{NEG}\b[^.]{{0,20}}\b(warn\w*|alarm\w*)", t):
            p["warnBelow"] = None
            used.append("abnormal")
        elif has(t, r"low flow|low|warn\w*|alarm\w*|dry|starv\w*"):
            p["warnBelow"] = props.get("warnBelow") or 50
            used.append("abnormal")
        if not p:
            p = {"showTotal": True}
            used = ["units"]

    else:  # container
        note = re.sub(r"\s+", " ", instruction or "").strip()
        note = (note[:1].upper() + note[1:])[:160] if note else "Follows team HMI standard"
        p["note"] = note
        used.append("note")

    # dedupe rule keys, keep order
    seen, uniq = set(), []
    for u in used:
        if u not in seen:
            seen.add(u)
            uniq.append(u)
    return p, uniq


def enforce_isa101(patch: dict) -> dict:
    """Guard model output: never green for running."""
    v = patch.get("runFill")
    if isinstance(v, str) and re.fullmatch(r"#?[0-9a-fA-F]{6}", v.strip()):
        h = v.strip().lstrip("#")
        r, g, b = int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)
        if g > r + 40 and g > b + 40:
            patch["runFill"] = RUNNING
    return patch


def make_rationale(rule_keys: list[str], name: str, patch: dict, cited: list[dict]) -> str:
    key = rule_keys[0] if rule_keys else "note"
    (slug, title), text = RULES.get(key, RULES["note"])
    for c in cited:
        if c.get("slug") == slug and c.get("title"):
            title = c["title"]
            break
    return f"Per {title} ({slug}): {text}, so {name or 'this component'} gets {summarize(patch)}."


# --------------------------------------------------------------------------
# GBrain rule lookup
# --------------------------------------------------------------------------
def best_line(chunk: str, query: str) -> str:
    words = {w for w in re.findall(r"[a-z0-9#-]{3,}", query.lower())}
    lines = [ln.strip(" -*\t") for ln in chunk.splitlines() if ln.strip() and not ln.strip().startswith("#")]
    if not lines:
        return chunk.strip()[:240]
    scored = sorted(lines, key=lambda ln: -sum(1 for w in words if w in ln.lower()))
    return scored[0].replace("**", "")[:240]


def cite_rules(instruction: str, name: str) -> tuple[list[dict], list[str]]:
    q = f"{instruction} {name}".strip()
    try:
        hits = gb_call(lambda c: c.search(q, limit=8))
    except Exception:
        return [], []
    if not isinstance(hits, list):
        return [], []
    cited, full, seen = [], [], set()
    for h in hits:
        slug = h.get("slug")
        if not slug or slug in seen:
            continue
        seen.add(slug)
        chunk = h.get("chunk_text") or ""
        cited.append({"slug": slug, "title": h.get("title"), "snippet": best_line(chunk, q)})
        full.append(f"{h.get('title') or slug}: {chunk.strip()[:1200]}")
        if len(cited) == 3:
            break
    return cited, full


# --------------------------------------------------------------------------
# API models
# --------------------------------------------------------------------------
class EditReq(BaseModel):
    model_config = ConfigDict(extra="allow")
    component_id: str
    component_type: str = ""
    component_path: str = ""
    component_name: str = ""
    instruction: str
    current_props: Optional[dict] = None


class AcceptReq(BaseModel):
    model_config = ConfigDict(extra="allow")
    pin: Any = None
    component_id: str
    component_name: str = ""
    instruction: str
    patch: dict
    author: str = "engineer"
    component_type: Optional[str] = None
    component_path: Optional[str] = None


_last_edit: dict[str, dict] = {}  # component_id -> last /api/edit context, enriches training pairs


@app.get("/api/health")
def health():
    return {"ok": True, "gbrain": gbrain_ok(), "model": "qwen-lora" if get_model_fn() else "rules"}


@app.post("/api/edit")
def edit(req: EditReq):
    t0 = time.perf_counter()
    props = req.current_props or {}
    fam = family(req.component_type, req.component_name)
    cited, rule_texts = cite_rules(req.instruction, req.component_name)

    patch, rationale, model_used = None, None, "rules"
    fn = get_model_fn()
    if fn is not None:
        component = {
            "id": req.component_id, "type": req.component_type, "path": req.component_path,
            "name": req.component_name, "props": props,
        }
        try:
            out = _pool.submit(fn, component, req.instruction, rule_texts or [c["snippet"] for c in cited]).result(
                timeout=MODEL_TIMEOUT_S
            )
            mp = out.get("patch") if isinstance(out, dict) else None
            if isinstance(mp, dict):
                allowed = ALLOWED.get(fam)
                mp = {k: v for k, v in mp.items() if not allowed or k in allowed}
            if mp:
                patch = enforce_isa101(mp)
                model_used = str(out.get("model") or "qwen-lora")
                rationale = out.get("rationale")
        except Exception:
            patch = None

    if not patch:
        patch, keys = rules_engine(fam, req.instruction, req.component_name, req.component_id, req.component_path, props)
        rationale = make_rationale(keys, req.component_name, patch, cited)
        model_used = "rules"
    elif not rationale:
        _, keys = rules_engine(fam, req.instruction, req.component_name, req.component_id, req.component_path, props)
        rationale = make_rationale(keys, req.component_name, patch, cited)

    _last_edit[req.component_id] = {
        "component_type": req.component_type, "component_path": req.component_path,
        "current_props": props, "rules": [c["snippet"] for c in cited], "model": model_used,
    }
    return {
        "patch": patch,
        "rationale": rationale,
        "rules_cited": cited,
        "model": model_used,
        "latency_ms": int((time.perf_counter() - t0) * 1000),
    }


# --------------------------------------------------------------------------
# Decisions log
# --------------------------------------------------------------------------
LINE_RE = re.compile(r"^- (?P<ts>.+?) — (?P<author>[^:]+): (?P<rest>.*)$")
REST_RE = re.compile(r'^(?P<pinned>\[PINNED\] )?(?P<component>.+?) — "(?P<instruction>.*)" → (?P<patch>.*)$')


def parse_decisions(markdown: str) -> list[dict]:
    out = []
    for ln in markdown.splitlines():
        m = LINE_RE.match(ln.strip())
        if not m:
            continue
        d = {"ts": m["ts"], "author": m["author"].strip(), "text": m["rest"],
             "component": None, "instruction": None, "patch_summary": None, "pinned": False}
        r = REST_RE.match(m["rest"])
        if r:
            d.update(component=r["component"], instruction=r["instruction"],
                     patch_summary=r["patch"], pinned=bool(r["pinned"]))
        out.append(d)
    return out


def append_decision_line(line: str) -> bool:
    with _log_lock:
        try:
            page = gb_call(lambda c: c.get_page(DECISIONS_SLUG, include_content=True))
            content = page.get("content") if isinstance(page, dict) else None
        except Exception:
            content = None
        try:
            if not content:
                content = "---\ntype: note\ntitle: Decision Log\n---\n\n# Decision Log\n"
            new = content.rstrip("\n") + "\n" + line + "\n"
            gb_call(lambda c: c.put_page(DECISIONS_SLUG, new, title="Decision Log"))
            return True
        except Exception:
            return False


@app.post("/api/accept")
def accept(req: AcceptReq):
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    now = datetime.now().astimezone()
    ts = now.strftime("%Y-%m-%d %H:%M")
    comp = req.component_name or req.component_id
    if req.component_name and req.component_id and req.component_id != req.component_name:
        comp = f"{req.component_name} ({req.component_id})"
    instr = re.sub(r"\s+", " ", req.instruction).replace('"', "'").strip()
    author = re.sub(r"[:\n—]", " ", req.author or "engineer").strip() or "engineer"
    pinned = "[PINNED] " if req.pin else ""
    line = f'- {ts} — {author}: {pinned}{comp} — "{instr}" → {summarize(req.patch)}'

    gbrain_logged = append_decision_line(line)
    with open(LOCAL_DECISIONS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps({"line": line, "gbrain": gbrain_logged}) + "\n")

    ctx = _last_edit.get(req.component_id, {})
    pair = {
        "ts": now.isoformat(timespec="seconds"),
        "author": author,
        "pinned": bool(req.pin),
        "input": {
            "component": {
                "id": req.component_id,
                "name": req.component_name,
                "type": req.component_type or ctx.get("component_type"),
                "path": req.component_path or ctx.get("component_path"),
                "props": ctx.get("current_props", {}),
            },
            "instruction": req.instruction,
            "rules": ctx.get("rules", []),
        },
        "output": {"patch": req.patch},
        "source_model": ctx.get("model"),
    }
    with open(PAIRS_PATH, "a", encoding="utf-8") as f:
        f.write(json.dumps(pair, ensure_ascii=False) + "\n")
    with open(PAIRS_PATH, encoding="utf-8") as f:
        total = sum(1 for ln in f if ln.strip())

    return {"ok": True, "gbrain_logged": gbrain_logged, "logged_line": line,
            "pairs_total": total, "next_train_in": TRAIN_EVERY - (total % TRAIN_EVERY)}


@app.get("/api/decisions")
def decisions(limit: int = 20):
    source = "gbrain"
    try:
        page = gb_call(lambda c: c.get_page(DECISIONS_SLUG, include_content=True))
        md = (page or {}).get("compiled_truth") or (page or {}).get("content") or ""
    except Exception:
        source, md = "local", ""
        if LOCAL_DECISIONS_PATH.exists():
            md = "\n".join(json.loads(l)["line"] for l in LOCAL_DECISIONS_PATH.read_text(encoding="utf-8").splitlines() if l.strip())
    items = parse_decisions(md)
    items.reverse()  # newest first
    return {"decisions": items[: max(1, limit)], "source": source}

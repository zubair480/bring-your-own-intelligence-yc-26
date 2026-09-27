"""Shared pieces for the Faceplate custom model: prompt, house style, checker.

The task: given one Ignition Perspective HMI component (type + name), an
engineer's instruction and the team's rules, return a JSON props patch that
follows the Station01 ISA-101 house style.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent
REPO_DIR = MODEL_DIR.parent
DATA_DIR = MODEL_DIR / "data"
RUNS_DIR = MODEL_DIR / "runs"
LATEST_PATH = RUNS_DIR / "latest.json"

DEFAULT_MODEL = "Qwen/Qwen3.8-27B-FP8"
FAST_MODEL = "Qwen/Qwen3.5-9B"

GREY_RUN = "#4A4A48"
ALARM_RED = "#E0301E"
WARN_AMBER = "#F5A623"
PALETTE = {GREY_RUN, ALARM_RED, WARN_AMBER}

EQUIPMENT_POINTS = {
    "P-101": ["Running", "Fault", "SpeedPct", "Amps"],
    "P-102": ["Running", "Fault", "SpeedPct", "Amps"],
    "P-103": ["Running", "Fault", "SpeedPct", "Amps"],
    "T-101": ["LevelPct", "LevelHi", "LevelLo"],
    "T-102": ["LevelPct", "LevelHi", "LevelLo"],
    "V-201": ["OpenPct"],
    "V-202": ["OpenPct"],
    "FT-301": ["GPM"],
}
POINT_UNITS = {"SpeedPct": "%", "Amps": "A", "LevelPct": "%", "OpenPct": "%", "GPM": "GPM"}

TAG_RE = re.compile(
    r"^\[default\]Station01/("
    r"P-10[1-3]/(Running|Fault|SpeedPct|Amps)"
    r"|T-10[12]/(LevelPct|LevelHi|LevelLo)"
    r"|V-20[12]/OpenPct"
    r"|FT-301/GPM)$"
)

ALLOWED_KEYS = {
    "ia.symbol.pump": {"runFill", "runLabel", "showSpeed", "showAmps", "faultColor"},
    "ia.display.cylindricaltank": {"showLimits", "hi", "lo", "showVolume", "tag"},
    "ia.display.alarmstatustable": {"minPriority", "showAckAll"},
    "ia.chart.timeseries": {"rangeMinutes", "secondAxis"},
    "ia.display.label": {"units", "warnAbove", "showBar"},
    "ia.symbol.valve": {"showOpenPct"},
    "ia.symbol.sensor": {"showTotal", "warnBelow"},
}

# Plain-language list of what the tuned model is meant to learn. eval.json
# carries this so the demo can show it next to the scores.
LEARNED = [
    f"Running state is dark grey {GREY_RUN}, never green, even when the engineer asks for green.",
    f"Alarm-level highlights use {ALARM_RED}; warnings use {WARN_AMBER}. No other colors.",
    "Tags are [default]Station01/<Equip>/<Point> for real Station01 equipment only "
    "(P-101..P-103, T-101/T-102, V-201/V-202, FT-301). Equipment is read from the component name.",
    "Each component type has a fixed set of patch keys; nothing else is emitted.",
    "Units are always shown: labels carry units, and every threshold carries value + units + color.",
    "Output is a bare JSON patch with no prose or code fences.",
]

SYSTEM_PROMPT = (
    "You configure Ignition Perspective HMI components for our plant. You get one "
    "component (type and name), an engineer's instruction, and the team's rules. "
    "Reply with only a JSON object: the props patch to apply to that component."
)


# ---------------------------------------------------------------- environment

def load_env() -> None:
    """Load KEY=VALUE lines from the repo-root .env without overriding the shell."""
    path = REPO_DIR / ".env"
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        key = key.strip().removeprefix("export ").strip()
        value = value.strip().strip('"').strip("'")
        if key and value and not os.environ.get(key):
            os.environ[key] = value


def api_key() -> str | None:
    load_env()
    return os.environ.get("RIVER_API_KEY") or None


def make_client():
    key = api_key()
    if not key:
        raise RuntimeError("RIVER_API_KEY is not set (shell or repo-root .env)")
    import river_client as river
    return river.Client(api_key=key)


def read_latest() -> dict | None:
    if not LATEST_PATH.exists():
        return None
    try:
        info = json.loads(LATEST_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return info if info.get("checkpoint") else None


# --------------------------------------------------------------------- prompt

def build_messages(component: dict, instruction: str, rules: list[str]) -> list[dict]:
    payload = {
        "component": {"type": component.get("type"), "name": component.get("name")},
        "instruction": instruction,
        "rules": list(rules or []),
    }
    return [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": json.dumps(payload, ensure_ascii=False)},
    ]


def format_patch(patch: dict) -> str:
    return json.dumps(patch, ensure_ascii=False)


def response_text(result) -> str:
    """Pull the assistant text out of a River chat_complete result."""
    data = json.loads(result.response_json) if hasattr(result, "response_json") else result
    choice = data["choices"][0]
    value = choice["message"].get("content")
    if isinstance(value, list):
        value = "".join(part.get("text", "") for part in value if isinstance(part, dict))
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Model returned no answer text")
    return value.strip()


_FENCE_RE = re.compile(r"```(?:json)?\s*(.*?)```", re.DOTALL)
_THINK_RE = re.compile(r"<think>.*?</think>", re.DOTALL)


def parse_patch(text: str) -> dict:
    """Parse a patch from model text. Tolerates code fences and a stray think block."""
    text = _THINK_RE.sub("", text or "").strip()
    fenced = _FENCE_RE.search(text)
    if fenced:
        text = fenced.group(1).strip()
    try:
        value = json.loads(text)
    except json.JSONDecodeError:
        start, end = text.find("{"), text.rfind("}")
        if start < 0 or end <= start:
            raise ValueError("No JSON object in model output")
        value = json.loads(text[start:end + 1])
    if not isinstance(value, dict):
        raise ValueError("Model output is JSON but not an object")
    return value


# -------------------------------------------------------------------- checker

_HEX_RE = re.compile(r"#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\b")
_RGB_RE = re.compile(r"rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)", re.IGNORECASE)
_GREEN_WORDS = re.compile(r"green|lime|chartreuse|emerald|\bjade\b|\bmint\b", re.IGNORECASE)
_COLOR_KEY_RE = re.compile(r"color|colour|fill", re.IGNORECASE)
_TAG_KEYS = {"tag", "hi", "lo", "path", "tagPath"}


def _hex_rgb(value: str) -> tuple[int, int, int]:
    h = value.lstrip("#")
    if len(h) == 3:
        h = "".join(c * 2 for c in h)
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def _is_greenish(r: int, g: int, b: int) -> bool:
    return g >= 96 and g > r + 40 and g > b + 40


def _walk(value, key=None):
    """Yield (key, leaf) for every leaf in a nested patch."""
    if isinstance(value, dict):
        for k, v in value.items():
            yield from _walk(v, k)
    elif isinstance(value, list):
        for v in value:
            yield from _walk(v, key)
    else:
        yield key, value


def has_green(text: str) -> bool:
    if _GREEN_WORDS.search(text):
        return True
    for m in _HEX_RE.finditer(text):
        if _is_greenish(*_hex_rgb(m.group(0))):
            return True
    for m in _RGB_RE.finditer(text):
        if _is_greenish(*(int(x) for x in m.groups())):
            return True
    return False


def _units_ok(ctype: str, patch: dict) -> bool:
    if ctype == "ia.display.label" and not str(patch.get("units", "")).strip():
        return False
    for obj in _dicts(patch):
        if "value" in obj and not str(obj.get("units", "")).strip():
            return False
        if ("tag" in obj and obj is not patch) and not str(obj.get("units", "")).strip():
            return False
    return True


def _dicts(value):
    if isinstance(value, dict):
        yield value
        for v in value.values():
            yield from _dicts(v)
    elif isinstance(value, list):
        for v in value:
            yield from _dicts(v)


def check_output(ctype: str, raw: str) -> dict:
    """Deterministic house-style checks on one model output.

    json      - parses to a JSON object (code fences tolerated)
    keys      - non-empty and only this component type's patch keys
    no_green  - no green anywhere (hex, rgb(), or color names)
    palette   - every color value is one of the three house colors
    tags      - every tag path matches [default]Station01/<Equip>/<Point> for real equipment
    units     - labels carry units; every threshold / axis object carries units
    pass      - all of the above
    """
    result = {"json": False, "keys": False, "no_green": False, "palette": False,
              "tags": False, "units": False, "pass": False, "patch": None}
    try:
        patch = parse_patch(raw)
    except (ValueError, json.JSONDecodeError):
        result["no_green"] = not has_green(raw or "")
        return result
    result["json"] = True
    result["patch"] = patch
    allowed = ALLOWED_KEYS.get(ctype, set())
    result["keys"] = bool(patch) and set(patch) <= allowed

    strings = [(k, v) for k, v in _walk(patch) if isinstance(v, str)]
    result["no_green"] = not any(has_green(v) for _, v in strings) and not any(
        has_green(str(k)) for k in _all_keys(patch))

    palette_ok = True
    for k, v in strings:
        looks_color = bool(_HEX_RE.fullmatch(v.strip())) or bool(_RGB_RE.match(v.strip()))
        if looks_color or (k and _COLOR_KEY_RE.search(str(k))):
            if v.strip().upper() not in PALETTE:
                palette_ok = False
    result["palette"] = palette_ok

    tags_ok = True
    for k, v in strings:
        looks_tag = (k in _TAG_KEYS) or v.startswith("[") or "Station" in v or v.count("/") >= 2
        if looks_tag and not TAG_RE.match(v.strip()):
            tags_ok = False
    result["tags"] = tags_ok

    result["units"] = _units_ok(ctype, patch)
    result["pass"] = all(result[c] for c in ("json", "keys", "no_green", "palette", "tags", "units"))
    return result


def _all_keys(value):
    if isinstance(value, dict):
        for k, v in value.items():
            yield k
            yield from _all_keys(v)
    elif isinstance(value, list):
        for v in value:
            yield from _all_keys(v)


def _flatten(value, prefix=""):
    out = {}
    if isinstance(value, dict):
        for k, v in value.items():
            out.update(_flatten(v, f"{prefix}{k}."))
    else:
        out[prefix.rstrip(".")] = value
    return out


def reference_match(patch: dict | None, reference: dict) -> dict:
    """How much of the reference patch the output reproduced (leaf level)."""
    if patch is None:
        return {"exact": False, "field_recall": 0.0}
    ref = _flatten(reference)
    got = _flatten(patch)

    def same(a, b):
        if isinstance(a, str) and isinstance(b, str):
            return a.strip().upper() == b.strip().upper()
        return a == b

    hits = sum(1 for k, v in ref.items() if k in got and same(got[k], v))
    exact = set(ref) == set(got) and hits == len(ref)
    return {"exact": exact, "field_recall": hits / len(ref) if ref else 1.0}


def read_jsonl(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]

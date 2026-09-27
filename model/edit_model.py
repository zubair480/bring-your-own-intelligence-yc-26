"""Backend entry point: one component edit through the Faceplate model on River.

    from model.edit_model import edit_component      # package import
    # or: sys.path.insert(0, "model"); from edit_model import edit_component

    edit_component({"type": "ia.symbol.pump", "name": "Pump_P101"},
                   "make running green", ["ISA-101 house style"])
    -> {"patch": {"runFill": "#4A4A48"}, "model": "Qwen/Qwen3.8-27B-FP8+faceplate-lora"}

Uses the tuned LoRA from model/runs/latest.json when it exists, otherwise base
Qwen. Raises on any failure (no key, River error, unparseable output) so the
caller can fall back. Set FACEPLATE_USE_TUNED=0 to force base.
"""
from __future__ import annotations

import atexit
import os
import threading

try:
    from . import faceplate_common as fc
except ImportError:
    import faceplate_common as fc

MAX_TOKENS = 400
SAMPLING = {"temperature": 0, "chat_template_kwargs": {"enable_thinking": False}}

_lock = threading.Lock()
_state: dict = {"client": None}


def _client():
    if _state["client"] is None:
        _state["client"] = fc.make_client()
    return _state["client"]


@atexit.register
def _shutdown():
    client = _state.get("client")
    _state["client"] = None
    if client is not None:
        try:
            client.close()
        except Exception:
            pass


def edit_component(component: dict, instruction: str, rules: list[str],
                   *, use_tuned: bool | None = None) -> dict:
    """Return {"patch": dict, "model": str}. Raises on failure."""
    if not isinstance(component, dict) or not component.get("type"):
        raise ValueError("component must be a dict with a 'type'")
    messages = fc.build_messages(component, instruction, rules)
    if use_tuned is None:
        use_tuned = os.environ.get("FACEPLATE_USE_TUNED", "1") != "0"
    info = fc.read_latest() if use_tuned else None

    with _lock:
        if info:
            # Serve the saved adapter directly: no training container cold start
            # or load_weights request on the first interactive edit.
            result = _client().chat_complete_from_checkpoint(
                messages, checkpoint_path=info["checkpoint"], base_model=info["base_model"],
                max_tokens=MAX_TOKENS, **SAMPLING)
            label = f"{info['base_model']}+faceplate-lora"
        else:
            base = os.environ.get("RIVER_MODEL", fc.DEFAULT_MODEL)
            result = _client().chat_complete(messages, base_model=base, max_tokens=MAX_TOKENS,
                                             **SAMPLING)
            label = base
    patch = fc.parse_patch(fc.response_text(result))
    return {"patch": patch, "model": label}


if __name__ == "__main__":
    import json
    import sys
    instruction = " ".join(sys.argv[1:]) or "Make the running state green and show speed."
    out = edit_component({"type": "ia.symbol.pump", "name": "Pump_P101"}, instruction,
                         ["ISA-101 house style"])
    print(json.dumps(out, indent=2))

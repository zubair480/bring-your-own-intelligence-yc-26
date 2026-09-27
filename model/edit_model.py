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
from contextlib import ExitStack

try:
    from . import faceplate_common as fc
except ImportError:
    import faceplate_common as fc

MAX_TOKENS = 400
SAMPLING = {"temperature": 0, "chat_template_kwargs": {"enable_thinking": False}}

_lock = threading.Lock()
_state: dict = {"client": None, "stack": None, "tuned": None, "tuned_ckpt": None}


def _client():
    if _state["client"] is None:
        _state["client"] = fc.make_client()
    return _state["client"]


def _tuned_model(info: dict):
    """Load (once per checkpoint) a LoRA model with the tuned weights."""
    if _state["tuned"] is not None and _state["tuned_ckpt"] == info["checkpoint"]:
        return _state["tuned"]
    import river_client as river
    _close_tuned()
    stack = ExitStack()
    try:
        session = stack.enter_context(_client().session(experiment="faceplate-serve"))
        model = session.create_model(base_model=info["base_model"],
                                     lora=river.LoraConfig(rank=int(info.get("rank", 16))))
        model.load_weights(info["checkpoint"], load_optimizer=False)
    except Exception:
        stack.close()
        raise
    _state.update(stack=stack, tuned=model, tuned_ckpt=info["checkpoint"])
    return model


def _close_tuned():
    stack = _state.get("stack")
    _state.update(stack=None, tuned=None, tuned_ckpt=None)
    if stack is not None:
        try:
            stack.close()
        except Exception:
            pass


@atexit.register
def _shutdown():
    _close_tuned()
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
            model = _tuned_model(info)
            result = model.chat_complete(messages, max_tokens=MAX_TOKENS, **SAMPLING)
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

"""Exercise the exact backend entry point against the saved River checkpoint."""
from datetime import datetime, timezone
import json
from pathlib import Path
import time

from edit_model import edit_component
from faceplate_common import check_output, read_latest


def main():
    latest = read_latest()
    if not latest:
        raise SystemExit("No saved Faceplate checkpoint; run train.py first.")
    component = {"type": "ia.symbol.pump", "name": "Pump_P101"}
    cases = [
        ("Make the running pump green.", {"runFill": "#4A4A48"}),
        ("Show pump speed and motor current on the pump faceplate.",
         {"showSpeed": True, "showAmps": True}),
    ]
    results = []
    for instruction, expected in cases:
        started = time.monotonic()
        output = edit_component(component, instruction, ["ISA-101 house style"], use_tuned=True)
        checks = check_output(component["type"], json.dumps(output["patch"]))
        passed = checks["pass"] and output["patch"] == expected and "faceplate-lora" in output["model"]
        result = {"instruction": instruction, "expected": expected, "output": output,
                  "pass": passed, "checks": checks,
                  "seconds": round(time.monotonic() - started, 2)}
        results.append(result)
        print(json.dumps(result), flush=True)
    report = {"created_at": datetime.now(timezone.utc).isoformat(),
              "checkpoint": latest["checkpoint"], "base_model": latest["base_model"],
              "checks_before_server_postprocessing": True, "results": results,
              "pass": all(r["pass"] for r in results)}
    path = Path(__file__).resolve().parent / "runs" / "smoke.json"
    path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    if not report["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()

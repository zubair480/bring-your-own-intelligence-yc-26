# Faceplate API

Base URL: `http://localhost:8000`. CORS allows `http://localhost:5173`. All bodies are JSON.

Start it from the repo root:

```
pip install -r server/requirements.txt
python -m uvicorn server.app:app --port 8000
```

Environment variables (all optional): `FACEPLATE_FORCE_RULES=1` skips the model and always uses the rules engine. `FACEPLATE_MODEL_TIMEOUT=25` sets the number of seconds to wait for the model before falling back.

## GET /api/health

```json
{ "ok": true, "gbrain": true, "model": "rules" }
```

`model` is `"qwen-lora"` when `model/edit_model.py` imports, otherwise `"rules"`.

## POST /api/edit

Request:

```json
{
  "component_id": "pump_p102",
  "component_type": "ia.symbol.pump",
  "component_path": "root/Pumps/P-102",
  "component_name": "P-102",
  "instruction": "show running state per our standard",
  "current_props": {}
}
```

`current_props` is optional.

Response:

```json
{
  "patch": { "runFill": "#4A4A48", "runLabel": "RUN", "faultColor": "#E0301E" },
  "rationale": "Per HMI Style Guide (ISA-101) (hmi/style-guide): running equipment uses a dark gray #4A4A48 fill with a white label, never green, so P-102 gets runFill #4A4A48, runLabel RUN, faultColor #E0301E.",
  "rules_cited": [
    { "slug": "hmi/style-guide", "title": "HMI Style Guide (ISA-101)", "snippet": "Running state (e.g. a running pump): dark gray fill #4A4A48 with a white label." }
  ],
  "model": "rules",
  "latency_ms": 755
}
```

- `patch` is always non-empty. Merge it into the component's props.
- `rules_cited` holds up to 3 GBrain hits. It is `[]` if GBrain is unreachable.
- `model` is `"qwen-lora"` or `"rules"`.

## POST /api/accept

Request:

```json
{
  "pin": false,
  "component_id": "pump_p102",
  "component_name": "P-102",
  "instruction": "show running state per our standard",
  "patch": { "runFill": "#4A4A48", "runLabel": "RUN", "faultColor": "#E0301E" },
  "author": "Zubair"
}
```

`component_type` and `component_path` are optional. If they are missing, they are filled in from the last `/api/edit` for that `component_id`. A truthy `pin` marks the logged line `[PINNED]`. The value of `pin` is never stored.

Response:

```json
{ "ok": true, "gbrain_logged": true, "logged_line": "- 2026-09-27 16:01 — Zubair: P-102 (pump_p102) — \"show running state per our standard\" → runFill #4A4A48, runLabel RUN, faultColor #E0301E", "pairs_total": 1, "next_train_in": 7 }
```

What it does:

- Appends one line to the GBrain page `decisions/log`. GBrain search finds the line.
- Appends one training pair to `server/data/pairs.jsonl`.
- Keeps a local copy of the line in `server/data/decisions.jsonl`.

`next_train_in` is `8 - (pairs_total % 8)`.

## GET /api/decisions?limit=20

```json
{
  "decisions": [
    {
      "ts": "2026-09-27 16:01",
      "author": "Zubair",
      "component": "P-102 (pump_p102)",
      "instruction": "show running state per our standard",
      "patch_summary": "runFill #4A4A48, runLabel RUN, faultColor #E0301E",
      "pinned": false,
      "text": "..."
    }
  ],
  "source": "gbrain"
}
```

Decisions are listed newest first. Older free-text lines have `component`, `instruction` and `patch_summary` set to `null`. `source` is `"local"` when GBrain is down.

## Patch keys by component type

| component_type | keys |
|---|---|
| `ia.symbol.pump` | `runFill` (hex), `runLabel` ("RUN"), `showSpeed` (bool), `showAmps` (bool), `faultColor` (hex) |
| `ia.display.cylindricaltank` | `showLimits` (bool), `hi` (number), `lo` (number), `showVolume` (bool), `tag` (string) |
| `ia.display.alarmstatustable` | `minPriority` ("High" \| "Medium" \| "Low"), `showAckAll` (bool) |
| `ia.chart.timeseries` | `rangeMinutes` (number), `secondAxis` (string \| null) |
| `ia.display.label` | `units` (string), `warnAbove` (number \| null), `showBar` (bool) |
| `ia.symbol.valve` | `showOpenPct` (bool) |
| `ia.symbol.sensor` | `showTotal` (bool), `warnBelow` (number \| null) |
| containers (`ia.container.*`, anything unrecognized) | `note` (string) |

Colors follow ISA-101:

| Meaning | Color |
|---|---|
| Running | `#4A4A48` (never green) |
| Alarm high | `#E0301E` |
| Warning | `#F5A623` |

Tag paths use the format `[default]Station01/<Equip>/<Point>`, for example `[default]Station01/T-101/LevelPct`.

Sample instructions and the patches they produce:

| Instruction | Patch |
|---|---|
| "show running state per our standard" | `runFill #4A4A48`, `runLabel RUN`, `faultColor #E0301E` |
| "only show priority High and above" | `minPriority High` |
| "hide low priority alarms" | `minPriority Medium` |
| "last 8 hours with amps on a second axis" | `rangeMinutes 480`, `secondAxis [default]Station01/P-101/Amps` |
| "hi 85 lo 15 limits and volume" | `showLimits`, `hi 85`, `lo 15`, `showVolume` |
| "GPM, warn above 900 with a bar" | `units GPM`, `warnAbove 900`, `showBar` |

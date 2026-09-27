# Faceplate API

Base URL: `http://localhost:8000`. CORS allows `http://localhost:5173`. All bodies are JSON.

Start it from the repo root:

```
pip install -r server/requirements.txt
python -m uvicorn server.app:app --port 8000
```

Environment variables (all optional): `FACEPLATE_FORCE_RULES=1` skips every LLM and always uses the rules engine. `FACEPLATE_MODEL_TIMEOUT=25` sets the seconds to wait for the River model. `FACEPLATE_THINK_TIMEOUT=40` sets the seconds to wait for GBrain `think`.

## How /api/edit decides

1. **River LoRA model** (`model/edit_model.py`), only when `RIVER_API_KEY` is set and the instruction is not a question. Used if it returns a valid, non-empty patch. `model: "qwen-lora"`.
2. **GBrain `think`** (LLM over team memory, billed to the GBrain credit). This is the primary engine when there is no River key. One call per request, with `rounds: 1` and `save: false`. The prompt includes the component (name, type, path, `current_props`), the allowed patch keys and their types, and the instruction verbatim. `think` decides whether the request is a question or a change. `model: "gbrain-think"`. Typical latency is 5-15 s.
3. **Rules engine fallback**, used when `think` fails or times out. Questions (what, why, how, explain, who) get `kind: "answer"` built from the top GBrain search snippets. For a change request, the keyword rules produce a patch only if a keyword actually matched. Otherwise the response is `kind: "answer"` with "I couldn't map that to a change for <name>. Try: ..." and two suggestions. It never returns a default or random patch. `model: "rules"`.

Every patch is validated. Unknown keys are dropped, and values are coerced to the key's type. HI/LO limits (`hi`, `lo`, `showLimits`) are dropped unless the instruction mentions limits. Running green is forced to `#4A4A48`. If a patch is empty after validation, the response becomes `kind: "answer"`.

## GET /api/health

```json
{ "ok": true, "gbrain": true, "model": "gbrain-think" }
```

`model` is `"qwen-lora"` when `RIVER_API_KEY` is set and `model/edit_model.py` imports. It is `"gbrain-think"` when GBrain is reachable and there is no River key. It is `"rules"` when GBrain is down or `FACEPLATE_FORCE_RULES=1`.

## POST /api/edit

Request:

```json
{
  "component_id": "pump_p102",
  "component_type": "ia.symbol.pump",
  "component_path": "root/Pumps/P-102",
  "component_name": "P-102",
  "instruction": "show running state per our standard",
  "current_props": {},
  "suggestions": ["Show running state per our standard", "Add speed % and amps under the pump"]
}
```

`current_props` and `suggestions` are optional. `suggestions` are the component's two suggestion chips. They are used in the "couldn't map that" answer, and the backend has its own defaults.

Response for a change (`kind: "patch"`):

```json
{
  "kind": "patch",
  "patch": { "runFill": "#4A4A48", "runLabel": "RUN", "faultColor": "#E0301E" },
  "answer": "",
  "rationale": "ISA-101 standard: running = dark gray #4A4A48 with white \"RUN\" label, fault red #E0301E, never green [hmi/style-guide], matching the prior P-102 decision [decisions/log].",
  "rules_cited": [
    { "slug": "hmi/style-guide", "title": "HMI Style Guide (ISA-101)", "snippet": "Running state (e.g. a running pump): dark gray fill #4A4A48 with a white label." }
  ],
  "model": "gbrain-think",
  "latency_ms": 5475
}
```

Response for a question, or for a change that the allowed keys can't express (`kind: "answer"`):

```json
{
  "kind": "answer",
  "patch": {},
  "answer": "\"ms\" (milliseconds) is a time unit and isn't a valid unit for a tank level display. T-102's level is a percentage from the LevelPct tag [plant/station-01-tags] ... I can change units to another level unit (%, ft, gal) or switch showVolume on.",
  "rationale": "",
  "rules_cited": [ { "slug": "plant/station-01-tags", "title": "Station 01 Tags", "snippet": "..." } ],
  "model": "gbrain-think",
  "latency_ms": 11162
}
```

- `kind` is `"patch"` or `"answer"`. Only offer Accept for `"patch"`.
- `patch` is non-empty when `kind` is `"patch"` and `{}` when `kind` is `"answer"`. Merge it into the component's props.
- `answer` is plain text (2-5 sentences, may contain `[page/slug]` citations) for `"answer"`, and `""` for `"patch"`.
- `rationale` is one sentence for `"patch"` and `""` for `"answer"`.
- `rules_cited` holds the top 3 GBrain search hits, plus any page slugs `think` cited (`snippet: "Cited by GBrain think."`), up to 5 in total. It is `[]` if GBrain is unreachable.
- `model` is `"gbrain-think"`, `"qwen-lora"` or `"rules"`.

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

Every non-container type also accepts `units` (string) and `label` (string).

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

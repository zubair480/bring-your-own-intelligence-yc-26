# Faceplate: verified model handoff

Verified September 27, 2026, approximately 4:33 PM Pacific.

## What is working

The public app at https://faceplate-demo.pages.dev reaches the real River-trained
Faceplate adapter. An independent audit sent public `/api/edit` requests and
received `model: qwen-lora`, a trace naming
`River · Qwen/Qwen3.8-27B-FP8+faceplate-lora`, and GBrain retrieval results.
The Chrome UI also completed an actual edit proposal in 3.236 seconds. It proposed
`showAmps: false -> true`; speed was already visible. The proposal remains open
for the engineer to accept. This verification did not accept or apply it.

Before the fix, the backend ran with system Python, which did not have
`river_client`. Requests fell back to `gbrain-think`. The backend now uses
`model/.venv`, and `edit_model.py` serves the saved adapter directly through
`chat_complete_from_checkpoint`, avoiding a training-container load per process.

## Training and evaluation

- Model: `Qwen/Qwen3.8-27B-FP8`; LoRA rank 16, learning rate 0.0002.
- Data: 120 generated structured component-edit examples; one epoch, 15 batches of 8.
- Training and checkpoint save: 146.3 seconds, excluding setup/tokenization.
- First/last batch loss: **1.541548967 -> 0.028584186**. These are different batches,
  so loss alone does not establish generalization.
- Evaluation: 20 held-out phrasings from the same narrow generated task family,
  using the same prompt and sampling settings for base and tuned models.

| Model | Schema/style checker pass | Exact reference patch | Reference-field recall |
| --- | ---: | ---: | ---: |
| Base Qwen | 0/20 (0%) | 0/20 (0%) | 0% |
| Faceplate LoRA | 14/20 (70%) | 13/20 (65%) | 87.1% |

This measures our custom Faceplate props contract, not general Ignition expertise
or performance on arbitrary production screens. No schema definition is included
in the shared evaluation prompt; learning this contract is part of the task.
There are six checker failures, including a near-miss gray hex color, unsupported
keys, and missing units. Do not present this as production-ready or perfect.

Inference checkpoint:

`river://a88cc64d-4dd0-4936-88cb-53e81bad4b9b/sampler_weights/faceplate-20260927T232807Z-inf`

Metadata: `runs/latest.json`. Full raw predictions and failures: `runs/eval.json`.
Direct backend-function smoke tests: `runs/smoke.json` (2/2 passed, before server
postprocessing). Independent receipts: `integration-audit-before.json` and
`integration-audit-after.json`. Raw checkpoint diagnostic:
`integration-audit-raw.json`. Visual proof: `runs/public-demo-proof.png`.

## One-minute pitch

1. **0-10 seconds:** "Engineering decisions disappear between projects. Faceplate
   carries team knowledge into the next screen edit."
2. **10-30 seconds:** Click P-101. Ask: "Show pump speed and motor current on the
   pump faceplate." Point to the GBrain retrieval and real River LoRA trace.
3. **30-45 seconds:** Show the props change and review it before accepting. Say:
   "GBrain supplies team context; our River-trained Qwen adapter translates the
   request into our component format; the engineer makes the final decision."
4. **45-60 seconds:** Show the measured 0/20 to 14/20 checker result. Say:
   "We sell reduced review and rework time, with decisions retained for the next
   engineer and the next project."

The pump color example is suitable for showing the **raw** smoke/evaluation
response: a green request produced `runFill: #4A4A48`. A gray UI alone is not
training proof because server code also enforces the palette. A separate public
combined color-and-speed request omitted the color field; keep that limitation
visible rather than claiming every request works.

## Accurate product boundaries

- This demo uses a simulated Ignition-style screen, not a live Ignition gateway.
- GBrain retrieval and existing decision readback were verified. Acceptance
  persistence exists in code; this audit did not create an acceptance record.
- Accepted edits are saved as future training pairs. Automatic retraining is not
  wired, and the current adapter was trained on the supplied generated dataset.
- No executable QM integration was found. Present it as planned unless separately
  demonstrated. Do not claim QM performed a step in this verified request.
- The platform used here is River. "Freya" was not independently identified as a
  separate product in this implementation.

## Restart and reproduce

Run from the repository root in PowerShell:

```powershell
.\model\start_backend.ps1
.\model\.venv\Scripts\python.exe model/smoke_test.py
Invoke-RestMethod http://127.0.0.1:8000/api/health
```

The restart script checks that port 8000 belongs to `uvicorn server.app:app`,
restarts only that listener, and binds to **127.0.0.1:8000** for the existing tunnel.
Use the model virtual environment when restarting; system Python lacks River.
Health is not sufficient proof: also inspect an actual edit response's model and
trace to distinguish River from a fallback.

For a fresh dependency install, create `model/.venv` with the app's server
dependencies available, then install `model/requirements.txt`. The current venv
inherits system packages, including FastAPI and Uvicorn. The initial missing
River-client error was fixed by installing the pinned dependencies there.

The independent audit's Python urllib requests received HTTP 403 from the public
endpoint; PowerShell and Chrome requests succeeded. Those original failures are
preserved in the receipts.

As of this handoff, the model integration changes and reports have not been
committed or pushed. The root `.env` remains ignored and must never be committed.

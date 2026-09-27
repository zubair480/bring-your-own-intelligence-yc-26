---
name: project-scan-deploy
description: Use when you have changed project files such as view.json and need the gateway to pick them up, or when you need the Ignition 8.3 REST API.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to deploy project changes (project scan and the 8.3 REST API)

## Purpose
Make the gateway load changed project resources from disk with `system.project.requestScan()`, and find the right Ignition 8.3 REST API endpoints from the gateway's own OpenAPI spec.

## When to use
- After any view.json write or upsert
- "My change isn't showing up."
- "Deploy the screen."

## Inputs
- Gateway address, e.g. `http://localhost:8088`
- For REST calls: a gateway API key

## Steps
1. Write the resources, using `perspective_upsert_view` or file writes under `data/projects/<project>/`.
2. Request a scan so the gateway picks up the changes.
3. For anything beyond a scan, open `http://<gateway>:8088/openapi`. Read the spec for project and resource endpoints rather than guessing paths.
4. Confirm the change is live, then log the deploy to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
system.project.requestScan()
system.util.getLogger("Faceplate").info("project scan requested by Faceplate agent")
```

## REST (8.3)
```bash
# discover the endpoints this gateway exposes
curl -s http://localhost:8088/openapi -o openapi.json
```
Authenticate REST calls with a gateway API key. Never paste the key into chat or GBrain.

## ignition-mcp
`project_scan`. `perspective_list_views` then confirms the view is registered.

## Verify
- `perspective_get_view` returns the new JSON.
- An open Perspective session shows the change after it refreshes.
- `gateway_logs_query` shows no resource-load errors.

## Team rules
- Scan after every upsert. An upsert without a scan isn't deployed.
- Deploys happen from the Faceplate loop, so they're traceable in [[decisions/log]].

Part of [[projects/faceplate]].

# Deploy (Faceplate demo)

Public URL: https://faceplate-demo.pages.dev

How it fits together:
- Frontend: static Vite build on Cloudflare Pages, project `faceplate-demo`.
- `/api/*` on pages.dev is handled by the Pages Function `web/functions/api/[[path]].js`, which forwards to the backend tunnel.
- Backend: local FastAPI on :8000, exposed by a cloudflared quick tunnel. The tunnel URL is the `DEFAULT_BACKEND_URL` constant in that function file.
- cloudflared binary: `C:\Users\zubai\bin\cloudflared.exe` (on PATH in Git Bash).

## Redeploy after UI changes

```bash
cd web && npx vite build && npx wrangler pages deploy dist --project-name faceplate-demo --branch main --commit-dirty=true
```

Run it from `web/` so `functions/` is uploaded. `npx vite build` skips the `tsc` type-check in `npm run build`, so a half-finished type error won't block the deploy.

## If the backend tunnel dies or its URL changes

Quick-tunnel URLs change on every restart.

```bash
# 1. backend must be running: python -m uvicorn server.app:app --port 8000   (repo root)
# 2. new tunnel (keep this terminal open)
cloudflared tunnel --no-autoupdate --url http://localhost:8000
#    copy the https://<random>.trycloudflare.com URL it prints
# 3. paste it into DEFAULT_BACKEND_URL in web/functions/api/[[path]].js, then redeploy:
cd web && npx vite build && npx wrangler pages deploy dist --project-name faceplate-demo --branch main --commit-dirty=true
```

You can also set a Pages env var instead of editing the file: `npx wrangler pages secret put BACKEND_URL --project-name faceplate-demo`, then redeploy. The env var takes priority over the constant.

## Smoke test

```bash
curl https://faceplate-demo.pages.dev/api/health
curl -X POST https://faceplate-demo.pages.dev/api/edit -H 'content-type: application/json' \
  -d '{"component_id":"smoke","component_name":"Start Pump","instruction":"make it more prominent"}'
```

Never upload the repo-root `.env`. Only `web/dist` and `web/functions` get deployed.

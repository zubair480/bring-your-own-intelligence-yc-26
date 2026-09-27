# Faceplate

Click any component on a live Ignition Perspective screen, say what to change, and an owned Qwen model edits it to your team's HMI standards stored in GBrain.

## Stack

- React + Vite (`web/`)
- FastAPI (`server/`)
- GBrain (team memory)
- River (Qwen LoRA)
- QM (shared agent room)

## Run the web app

```
cd web && npm install && npm run dev
```

Built at YC Own Your Intelligence hackathon, Sep 27 2026.

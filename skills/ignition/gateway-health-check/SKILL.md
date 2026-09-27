---
name: gateway-health-check
description: Use when you need to check that the Ignition gateway is up and healthy, including version, CPU and memory, trial status and reset, and recent logs.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to check gateway health (info, trial, logs)

## Purpose
Answer "is the gateway OK?" before doing any other work. On a trial gateway, keep the trial window from expiring mid-demo.

## When to use
- At the start of every session in [[qm/rooms/station-01-hmi]]
- When tags go Bad quality, or views stop loading
- "Is the trial about to expire?"

## Inputs
- Gateway address
- Time window for logs, e.g. the last 15 minutes

## Steps
1. Get gateway info: version, name, and state.
2. Read the `[System]` gateway tags for CPU and memory.
3. Check trial status. If the trial is close to expiry, reset it. An unlicensed gateway runs in 2-hour trial windows.
4. Query logs for ERROR and WARN entries since the last check.
5. Post a one-line summary in the QM room.

## Gateway script (Jython 2.7)
```python
print("version: %s" % system.util.getVersion())
paths = ["[System]Gateway/SystemName",
         "[System]Gateway/Performance/CPU Usage",
         "[System]Gateway/Performance/Memory Usage"]
for p, qv in zip(paths, system.tag.readBlocking(paths)):
    print("%s = %s (%s)" % (p, qv.value, qv.quality))
system.util.getLogger("Faceplate").info("health check run by Faceplate agent")
```

## ignition-mcp
- `gateway_info` for version, name, and state
- `gateway_trial_status`, then `gateway_trial_reset` only if the trial is expiring
- `gateway_logs_query` for recent ERROR and WARN entries

## Verify
All three `[System]` reads return Good quality. `gateway_trial_status` shows time remaining. There are no new ERROR lines for the tag provider or Perspective.

## Team rules
- Run this first. Don't debug a screen on a gateway whose trial has expired.
- Trial reset is for the demo gateway only, and never for a licensed production gateway.
- Note any resets or errors in [[decisions/log]].

Part of [[projects/faceplate]].

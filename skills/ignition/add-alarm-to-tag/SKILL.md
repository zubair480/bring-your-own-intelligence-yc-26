---
name: add-alarm-to-tag
description: Use when you need to add or change an alarm on a tag, such as a tank high-level alarm at 85 with High priority.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to add an alarm to a tag

## Purpose
Attach alarm definitions to an existing tag through its `alarms` property, using `system.tag.configure` with merge.

## When to use
- "Alarm T-101 when level goes above 85."
- "Add a low-level alarm."
- "Change the alarm priority."

## Inputs
- Tag path, e.g. `[default]Station01/T-101/LevelPct`
- Alarm name, mode (`AboveValue`, `BelowValue`, `Equal`, ...), `setpointA`, and priority (`Diagnostic`, `Low`, `Medium`, `High`, `Critical`)

## Steps
1. `getConfiguration` on the tag to see which alarms already exist.
2. Build the full alarm list: keep the existing alarms and add the new one. The list you send becomes the tag's alarm set.
3. Configure with collision policy `"m"` (merge) so the rest of the tag config is untouched.
4. Log to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
base = "[default]Station01/T-101"
tag = {"name": "LevelPct", "tagType": "AtomicTag", "alarms": [
    {"name": "LevelHi", "mode": "AboveValue", "setpointA": 85, "priority": "High"},
    {"name": "LevelLo", "mode": "BelowValue", "setpointA": 15, "priority": "Medium"},
]}
print(system.tag.configure(base, [tag], "m"))

cfg = system.tag.getConfiguration(base + "/LevelPct", False)
print(cfg[0].get("alarms"))
```

## ignition-mcp
`tag_create` on base `[default]Station01/T-101` with the tag dict above and the merge collision policy. Or edit the JSON from `tag_config_export` and send it back through `tag_config_import`.

## Verify
1. Write 90 to LevelPct on a memory or test tag (`read-write-tag`).
2. `alarm_status` should show `LevelHi` as ActiveUnacked.
3. Write 60 to clear it.

## Team rules
- Tank limits are HI 85 and LO 15 ([[plant/equipment/t-101]], [[plant/equipment/t-102]]). Don't change setpoints without a logged decision.
- The HMI shows alarm high as `#E0301E` and warning as `#F5A623` ([[hmi/style-guide]]).
- Log to [[decisions/log]].

Part of [[projects/faceplate]].

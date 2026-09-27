---
name: read-write-tag
description: Use when you need to read a tag's current value and quality, or write a new value to a tag, in Ignition.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to read and write tag values

## Purpose
Read live values with `system.tag.readBlocking` and write with `system.tag.writeBlocking`. Always check quality, because a Bad value can look normal.

## When to use
- "What is T-101's level?"
- "Is P-101 running?"
- "Set P-102 speed to 60%."

## Inputs
- One or more full tag paths
- For writes: the matching values, in the same order

## Steps
1. Read the tags. For each QualifiedValue, check `.quality.isGood()` before trusting `.value`.
2. Report Bad or Uncertain quality as its own finding. Don't report a number.
3. For writes, confirm the target is a writable point (a memory tag or an OPC setpoint) and within range.
4. Write, then check each returned QualityCode.
5. Read back to confirm, and log the write to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
paths = ["[default]Station01/T-101/LevelPct",
         "[default]Station01/P-101/Running",
         "[default]Station01/P-101/Amps"]
for p, qv in zip(paths, system.tag.readBlocking(paths)):
    if qv.quality.isGood():
        print("%s = %s" % (p, qv.value))
    else:
        print("%s BAD QUALITY: %s" % (p, qv.quality))

# write
wp = ["[default]Station01/P-102/SpeedPct"]
codes = system.tag.writeBlocking(wp, [60.0])
if not codes[0].isGood():
    raise Exception("write failed: %s" % codes[0])
print("readback: %s" % system.tag.readBlocking(wp)[0].value)
```

## ignition-mcp
`tag_read` with the paths; `tag_write` with the path and value. Then `tag_read` again to read back.

## Verify
Readback equals the written value with Good quality. The bound HMI component shows the same number.

## Team rules
- Pumps P-101..P-103 expose Running, Fault, SpeedPct, Amps ([[plant/equipment/p-101]]). Running and Fault are status bits; don't write them from an agent.
- SpeedPct is 0–100.
- Every write goes into [[decisions/log]] with the old value, the new value, and who asked.
- Safety: only write to live equipment when an operator in the QM room approves.

Part of [[projects/faceplate]]. Paths: [[plant/station-01-tags]].

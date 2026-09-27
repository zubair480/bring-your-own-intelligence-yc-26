---
name: query-ack-alarms
description: Use when you need to list active alarms or acknowledge alarms in Ignition, for example all unacknowledged High and Critical alarms on Station 01.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to query and acknowledge alarms

## Purpose
List active alarms with `system.alarm.queryStatus` and acknowledge them with `system.alarm.acknowledge`, leaving a note that says who acked and why.

## When to use
- "What's alarming?"
- "Acknowledge alarms on T-101."
- "Ack everything high priority on Station 01."

## Inputs
- Priorities, e.g. `["High", "Critical"]`
- States, e.g. `["ActiveUnacked"]`
- Scope: Station01, or one piece of equipment
- The operator's ack note

## Steps
1. Query the alarms and list source, name, and priority for each.
2. Post the list in [[qm/rooms/station-01-hmi]] and get an operator OK.
3. Acknowledge only the IDs the operator approved, with a note.
4. Log the ack (count, IDs, note) to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
results = system.alarm.queryStatus(priority=["High", "Critical"], state=["ActiveUnacked"])
ids = []
for ev in results:
    src = str(ev.getSource())
    if "Station01" in src:
        print("%s | %s | %s" % (src, ev.getName(), ev.getPriority()))
        ids.append(str(ev.getId()))

if ids:
    system.alarm.acknowledge(ids, "Acked by Faceplate agent after operator OK in QM room")
print("acked %d" % len(ids))
```

## ignition-mcp
`alarm_status` filtered to High and Critical, ActiveUnacked. Then `alarm_acknowledge` with the event IDs and the note.

## Verify
Re-run `alarm_status`. The acked events move to ActiveAcked, or ClearAcked if the condition has cleared. They should no longer appear as ActiveUnacked.

## Team rules
- Acking silences the alarm, but it doesn't fix the cause. Report the underlying value too, e.g. T-101 LevelPct from [[plant/equipment/t-101]].
- Never bulk-ack Critical alarms without a named operator.
- Log every ack to [[decisions/log]].

Part of [[projects/faceplate]]. See also [[plant/equipment/t-102]].

---
name: enable-tag-history
description: Use when you need to turn on history logging for a tag or query a tag's historical values, for example the last hour of T-101 level.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to enable tag history and query it

## Purpose
Store a tag's values with `historyEnabled` and read them back with `system.tag.queryTagHistory` for trends and reports.

## When to use
- "Trend T-101 level."
- "Log pump amps."
- "What was the average level over the last hour?"

## Inputs
- Tag paths
- Historian provider name, as configured on the gateway
- For queries: time window, `returnSize`, aggregation mode

## Steps
1. Merge `historyEnabled: True` and `historyProvider` into the tag config (policy `"m"`).
2. Wait for a few samples.
3. Query the history, and check the row count is greater than 0.
4. Log the change to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
PROVIDER = "<provider>"   # your historian provider name on this gateway
base = "[default]Station01/T-101"
print(system.tag.configure(base, [
    {"name": "LevelPct", "tagType": "AtomicTag",
     "historyEnabled": True, "historyProvider": PROVIDER}], "m"))

end = system.date.now()
start = system.date.addHours(end, -1)
ds = system.tag.queryTagHistory(paths=[base + "/LevelPct"], startDate=start, endDate=end,
                                returnSize=60, aggregationMode="Average")
for r in range(ds.getRowCount()):
    print("%s  %s" % (ds.getValueAt(r, 0), ds.getValueAt(r, 1)))
```

## ignition-mcp
Enable history with `tag_create` and the merge policy, using the tag dict above. Then `history_query` with the path, the time range, and Average aggregation.

## Verify
`history_query` returns rows whose values track the live `tag_read` value.

## Team rules
- Historize LevelPct for both tanks ([[plant/equipment/t-101]], [[plant/equipment/t-102]]) and Amps for every pump. Don't historize expression booleans like LevelHi; alarm history covers those.
- Paths follow [[plant/station-01-tags]].
- Log to [[decisions/log]].

Part of [[projects/faceplate]].

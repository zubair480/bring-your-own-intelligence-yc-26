---
name: create-tag
description: Use when you need to create a new memory, OPC, or expression tag in Ignition, for example a new point under [default]Station01.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How do I create a tag in Ignition (memory, OPC, expression)

## Purpose
Create one or more tags with `system.tag.configure`, using the team path convention `[default]Station01/<Equip>/<Point>`.

## When to use
Someone asks to "create a tag", "add a point", or "make a new tag for T-101". Use `create-udt-pump` for whole pumps.

## Inputs
- Equipment folder, e.g. `T-101`; point name, e.g. `LevelPct`
- Source: memory, OPC (server + item path), or expression
- Data type: `Float8`, `Int4`, `Boolean`, `String`

## Steps
1. Check the name against [[plant/station-01-tags]]. Don't invent new point names when a standard one exists.
2. Build one tag dict per tag (shapes below).
3. Call `configure` with collision policy `"a"` (abort) so an existing tag is never clobbered.
4. Check each returned QualityCode, then log to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
base = "[default]Station01/T-101"
tags = [
    # memory tag
    {"name": "LevelPct", "tagType": "AtomicTag", "valueSource": "memory",
     "dataType": "Float8", "value": 62.4},
    # expression tags: {[.]X} means "sibling tag X in this folder"
    {"name": "LevelHi", "tagType": "AtomicTag", "valueSource": "expr",
     "dataType": "Boolean", "expression": "{[.]LevelPct} > 85"},
    {"name": "LevelLo", "tagType": "AtomicTag", "valueSource": "expr",
     "dataType": "Boolean", "expression": "{[.]LevelPct} < 15"},
]
# OPC variant of LevelPct (take opcItemPath from the OPC browser):
# {"name": "LevelPct", "tagType": "AtomicTag", "valueSource": "opc", "dataType": "Float8",
#  "opcServer": "Ignition OPC UA Server", "opcItemPath": "ns=1;s=[Sim]_Meta:Ramp/Ramp0"}

results = system.tag.configure(base, tags, "a")   # a=abort, o=overwrite, i=ignore, m=merge
for t, qc in zip(tags, results):
    print("%s -> %s" % (t["name"], qc))
```

## ignition-mcp
`tag_create` with base path `[default]Station01/T-101` and the same tag dicts.

## Verify
`tag_read` (or `system.tag.readBlocking`) on the new paths returns quality Good and the expected value.

## Team rules
- Paths are always `[default]Station01/<Equip>/<Point>`.
- Tank thresholds: HI 85, LO 15. See [[plant/equipment/t-101]] and [[plant/equipment/t-102]].
- Log every new tag to [[decisions/log]].
- Safety: never point a write-capable OPC tag at a live PLC address without operator sign-off.

Part of [[projects/faceplate]].

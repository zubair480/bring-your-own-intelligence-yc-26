---
name: create-udt-pump
description: Use when you need the Pump UDT definition (Running, Fault, SpeedPct, Amps) or new pump instances such as P-101 through P-104.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to create the Pump UDT and pump instances

## Purpose
Define every pump once as a UDT, then stamp out instances. All pumps then get identical points, and screens can bind to them the same way.

## When to use
- "Add a pump P-104."
- "Make the pumps a UDT."
- Step 1 of `add-pump-to-screen`.

## Inputs
- UDT name: `Pump`
- Instance names: `P-101`..`P-104`
- Target folder: `[default]Station01`

## Steps
1. `browse-tags` on `[default]_types_` to see whether `Pump` already exists.
2. If it doesn't, configure the UDT definition under `[default]_types_` with `tagType` `UdtType`.
3. Configure the instances under `[default]Station01` with `tagType` `UdtInstance` and `typeId` `Pump`.
4. Log to [[decisions/log]].

## Gateway script (Jython 2.7)
```python
def point(name, dtype, value):
    return {"name": name, "tagType": "AtomicTag", "valueSource": "memory",
            "dataType": dtype, "value": value}

pump_type = {"name": "Pump", "tagType": "UdtType", "tags": [
    point("Running", "Boolean", False),
    point("Fault", "Boolean", False),
    point("SpeedPct", "Float8", 0.0),
    point("Amps", "Float8", 0.0),
]}
print(system.tag.configure("[default]_types_", [pump_type], "a"))

instances = [{"name": n, "tagType": "UdtInstance", "typeId": "Pump"}
             for n in ["P-101", "P-102", "P-103", "P-104"]]
for n, qc in zip(instances, system.tag.configure("[default]Station01", instances, "i")):
    print("%s -> %s" % (n["name"], qc))   # "i" skips pumps that already exist
```
For real I/O, replace the memory members with OPC members whose item path uses the built-in `{InstanceName}` parameter.

## ignition-mcp
`tag_create` with base path `[default]_types_` and the UdtType dict, then `tag_create` with base path `[default]Station01` and the instance dicts.

## Verify
`tag_browse` `[default]Station01/P-104` lists Running, Fault, SpeedPct, and Amps. `tag_read` returns Good quality.

## Team rules
- Pump members are exactly Running, Fault, SpeedPct, Amps ([[plant/equipment/p-101]], [[plant/equipment/p-102]], [[plant/equipment/p-103]]).
- If P-101..P-103 already exist as plain folders, export them before converting to instances.
- Log to [[decisions/log]].

Part of [[projects/faceplate]]. Paths: [[plant/station-01-tags]].

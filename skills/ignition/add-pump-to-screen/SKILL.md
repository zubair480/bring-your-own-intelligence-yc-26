---
name: add-pump-to-screen
description: Use when you need to add a new pump to the screen end to end: UDT instance, tags, pump symbol, bindings, and an alarm indicator.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to add a new pump to the screen (compound skill)

## Purpose
Take a pump from nothing to live on the HMI in one pass. The pump gets tags, a pump symbol, a speed readout, and a fault indicator, all in house style.

## When to use
- "Add a new pump P-104 to the screen."
- "Put pump 4 on the Station 01 overview."

## Inputs
- Pump name, e.g. `P-104`
- View path, e.g. `Station01/Overview`
- An x/y position on the screen

## Steps
1. **UDT instance.** Run `create-udt-pump` with `{"name":"P-104","tagType":"UdtInstance","typeId":"Pump"}` under `[default]Station01`.
2. **Tags.** Run `read-write-tag`: confirm Running, Fault, SpeedPct, and Amps read with Good quality.
3. **Pump symbol.** `perspective_get_view`, then append the components below.
4. **Bindings.** The symbol state comes from an expression binding on Fault and Running. The speed label gets a tag binding.
5. **Alarm indicator.** A FAULT label, visible only while Fault is true, in alarm red.
6. `perspective_validate_view`, then `perspective_upsert_view`, then `project_scan`. Log to [[decisions/log]].

## Components to append (view.json children)
```json
[
 {"type": "ia.symbol.pump", "meta": {"name": "P104_Symbol"},
  "position": {"x": 520, "y": 200, "width": 80, "height": 80},
  "props": {"appearance": "simple"},
  "propConfig": {"props.state": {"binding": {"type": "expr", "config": {"expression":
    "if({[default]Station01/P-104/Fault}, 'faulted', if({[default]Station01/P-104/Running}, 'running', 'stopped'))"}}}}},
 {"type": "ia.display.label", "meta": {"name": "P104_SpeedPct"},
  "position": {"x": 520, "y": 285, "width": 80, "height": 24},
  "props": {"style": {"color": "#4A4A48"}},
  "propConfig": {"props.text": {"binding": {"type": "tag", "config": {"mode": "direct",
    "tagPath": "[default]Station01/P-104/SpeedPct", "fallbackDelay": 2.5}}}}},
 {"type": "ia.display.label", "meta": {"name": "P104_FaultInd"},
  "position": {"x": 520, "y": 175, "width": 80, "height": 22},
  "props": {"text": "FAULT", "style": {"backgroundColor": "#E0301E", "color": "#FFFFFF"}},
  "propConfig": {"meta.visible": {"binding": {"type": "tag", "config": {"mode": "direct",
    "tagPath": "[default]Station01/P-104/Fault", "fallbackDelay": 2.5}}}}}
]
```

## Gateway script (Jython 2.7)
```python
print(system.tag.configure("[default]Station01",
      [{"name": "P-104", "tagType": "UdtInstance", "typeId": "Pump"}], "i"))
view = system.util.jsonDecode(system.file.readFileAsString(VIEW))   # VIEW as in edit-perspective-component
view["root"]["children"].extend(system.util.jsonDecode(PUMP_COMPONENTS))  # the JSON above
system.file.writeFile(VIEW, system.util.jsonEncode(view, 2))
system.project.requestScan()
```

## ignition-mcp
`tag_create` → `tag_read` → `perspective_get_view` → `perspective_validate_view` → `perspective_upsert_view` → `project_scan`.

## Verify
- Write Running=True: the symbol shows the running state in gray `#4A4A48`, not green.
- Write Fault=True: the red FAULT label appears.
- Reset both.

## Team rules
- Match the existing pumps ([[plant/equipment/p-101]], [[plant/equipment/p-102]], [[plant/equipment/p-103]]) and [[hmi/style-guide]].
- Paths follow [[plant/station-01-tags]].
- Log to [[decisions/log]] and announce in [[qm/rooms/station-01-hmi]].

Part of [[projects/faceplate]].

---
name: bind-tag-to-component
description: Use when you need to attach a tag to a Perspective component property so the component shows or drives a live tag value.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to attach a tag to a component (Perspective tag binding)

## Purpose
Bind a component property to a tag by adding a `propConfig` entry to the component in the view's `view.json`.

## When to use
Someone asks to "attach a tag to a component", "bind LevelPct to the label", or "wire the tank to T-101".

## Inputs
- Project and view path, e.g. `Faceplate`, `Station01/Overview`
- Component `meta.name`, e.g. `T101_LevelPct`
- Property: `props.text` for a Label; `props.value` for value components (tank, progress bar, numeric entry)
- Tag path from [[plant/station-01-tags]]

## Steps
1. `perspective_get_view` to fetch the current view.json.
2. Find the component by `meta.name`.
3. Add the binding under `propConfig`. Leave other props alone.
4. `perspective_validate_view`, then `perspective_upsert_view`, then `project_scan`.
5. Log the binding to [[decisions/log]].

## The binding (view.json, on the component)
```json
"propConfig": {
  "props.value": {
    "binding": {
      "type": "tag",
      "config": {"mode": "direct", "tagPath": "[default]Station01/T-101/LevelPct", "fallbackDelay": 2.5}
    }
  }
}
```

## Gateway script (Jython 2.7)
```python
IGN = "/usr/local/bin/ignition"   # gateway install dir
VIEW = IGN + "/data/projects/Faceplate/com.inductiveautomation.perspective/views/Station01/Overview/view.json"
view = system.util.jsonDecode(system.file.readFileAsString(VIEW))
for c in view["root"]["children"]:
    if c["meta"]["name"] == "T101_LevelPct":
        c.setdefault("propConfig", {})["props.text"] = {"binding": {"type": "tag", "config": {
            "mode": "direct", "tagPath": "[default]Station01/T-101/LevelPct", "fallbackDelay": 2.5}}}
system.file.writeFile(VIEW, system.util.jsonEncode(view, 2))
system.project.requestScan()
```

## ignition-mcp
`perspective_get_view` → edit → `perspective_validate_view` → `perspective_upsert_view` → `project_scan`.

## Verify
Open the view in a Perspective session. The component shows the live value, not a red error overlay. `tag_read` the path and compare the two values.

## Team rules
- Text and values use the colors in [[hmi/style-guide]]. Running is `#4A4A48`, never green.
- One binding per property. Don't bind the same prop from two places.
- Log to [[decisions/log]] and post the change in [[qm/rooms/station-01-hmi]].

Part of [[projects/faceplate]].

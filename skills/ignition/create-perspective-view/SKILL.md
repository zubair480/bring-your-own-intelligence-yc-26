---
name: create-perspective-view
description: Use when you need a new Perspective screen, built as a coordinate-container view.json, saved to the project and picked up with a project scan.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to create a Perspective view

## Purpose
Create a new view from JSON: a coordinate container root with absolutely positioned children. Then upsert it and scan the project.

## When to use
- "Make a new screen for Station 01."
- "Create an overview page."
- "Scaffold a pump detail view."

## Inputs
- Project (`Faceplate`) and view path (e.g. `Station01/Overview`)
- Default size, e.g. 1280x720
- A starting component list

## Steps
1. `perspective_list_views`, so you don't overwrite an existing view.
2. Build the view.json below.
3. `perspective_validate_view`, then `perspective_upsert_view`, then `project_scan`.
4. Log the new view to [[decisions/log]].

## view.json
```json
{
  "custom": {},
  "params": {},
  "props": {"defaultSize": {"width": 1280, "height": 720}},
  "root": {
    "type": "ia.container.coord",
    "version": 0,
    "meta": {"name": "root"},
    "props": {},
    "children": [
      {"type": "ia.display.label", "version": 0, "meta": {"name": "Title"},
       "position": {"x": 24, "y": 16, "width": 400, "height": 36},
       "props": {"text": "Station 01", "style": {"color": "#4A4A48", "fontSize": 20}}}
    ]
  }
}
```

## Gateway script (Jython 2.7)
```python
import java.io.File
IGN = "/usr/local/bin/ignition"
d = IGN + "/data/projects/Faceplate/com.inductiveautomation.perspective/views/Station01/Overview"
java.io.File(d).mkdirs()
system.file.writeFile(d + "/view.json", VIEW_JSON)   # VIEW_JSON = the text above
# A view folder also needs resource.json. Copy one from an existing view, or use perspective_upsert_view.
system.project.requestScan()
```

## ignition-mcp
`perspective_upsert_view` with project `Faceplate`, path `Station01/Overview`, and the JSON. It writes view.json and resource.json. Then `project_scan`.

## Verify
`perspective_get_view` returns the new view. It appears in the Designer project browser after the scan, and opens in a session.

## Team rules
- Follow [[hmi/style-guide]]: ISA-101 grays, and color only for abnormal states (alarm `#E0301E`, warning `#F5A623`).
- Name components `<Equip>_<Point>`, e.g. `T101_LevelPct`.
- Log to [[decisions/log]].

Part of [[projects/faceplate]].

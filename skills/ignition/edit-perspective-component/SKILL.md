---
name: edit-perspective-component
description: Use when you need to change one Perspective component's props to match house style; this is Faceplate's core loop of GBrain rules, model patch, validate, upsert, and log decision.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to edit one Perspective component to house style (Faceplate core loop)

## Purpose
Change exactly one component's props so it follows team rules, without touching anything else in the view. This is the loop Faceplate runs for every HMI change.

## When to use
- "The P-101 running indicator is green, fix it."
- "Make this label match the style guide."
- Any change to a single component.

## Inputs
- Project, view path, and component `meta.name`
- The request, in plain words

## Steps (the loop)
1. **GBrain rules.** Read [[hmi/style-guide]] and search [[decisions/log]] for earlier rulings on this component.
2. **Model patch.** `perspective_get_view`. The model writes a minimal patch: only the target component, only the props that must change.
3. **Validate.** `perspective_validate_view` on the patched JSON. If it fails, stop and report.
4. **Upsert.** `perspective_upsert_view`, then `project_scan`.
5. **Log decision.** Add the before value, the after value, the rule cited, and who asked to [[decisions/log]], and post a one-line summary in [[qm/rooms/station-01-hmi]].

## Gateway script (Jython 2.7)
```python
IGN = "/usr/local/bin/ignition"
VIEW = IGN + "/data/projects/Faceplate/com.inductiveautomation.perspective/views/Station01/Overview/view.json"

def find(node, name):
    if node.get("meta", {}).get("name") == name:
        return node
    for ch in node.get("children", []):
        hit = find(ch, name)
        if hit:
            return hit

view = system.util.jsonDecode(system.file.readFileAsString(VIEW))
c = find(view["root"], "P101_RunningText")
before = c["props"].get("style", {}).get("color")
c["props"].setdefault("style", {})["color"] = "#4A4A48"   # running = dark gray, never green
system.file.writeFile(VIEW, system.util.jsonEncode(view, 2))
system.project.requestScan()
print("color %s -> #4A4A48" % before)
```

## ignition-mcp
`perspective_get_view` → `perspective_validate_view` → `perspective_upsert_view` → `project_scan`.

## Verify
Run `perspective_get_view` again. Only the target component's props differ from the original. The session shows the new style.

## Team rules
- ISA-101: running `#4A4A48`, never green. Alarm high `#E0301E`. Warning `#F5A623`.
- One component per change. The diff must be reviewable.
- No log entry in [[decisions/log]] means the change didn't happen.

Part of [[projects/faceplate]].

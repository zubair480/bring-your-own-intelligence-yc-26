---
name: browse-tags
description: Use when you need to list which tags exist under a folder or read a tag's full configuration before changing it.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to browse tags and read tag configuration

## Purpose
Find what exists with `system.tag.browse`, then read exact definitions with `system.tag.getConfiguration`. Run this before any create, edit, or delete so you never guess a path.

## When to use
- "What tags does Station 01 have?"
- "Show me how T-101 is configured."
- "Does P-104 exist yet?"

## Inputs
- A folder or tag path, e.g. `[default]Station01` or `[default]Station01/T-101`
- An optional browse filter, e.g. `{"tagType": "AtomicTag", "recursive": True}`

## Steps
1. Browse the folder and list `fullPath` and `tagType` for each result.
2. For the tag or folder you care about, call `getConfiguration(path, True)`.
3. Compare what you find against [[plant/station-01-tags]]. Flag missing standard points and anything off-convention.

## Gateway script (Jython 2.7)
```python
res = system.tag.browse("[default]Station01", {"recursive": True, "tagType": "AtomicTag"})
for r in res.getResults():
    print("%s  (%s)" % (r["fullPath"], r["tagType"]))

cfg = system.tag.getConfiguration("[default]Station01/T-101", True)
for t in cfg[0]["tags"]:
    print("%s  source=%s  alarms=%s" % (t["name"], t.get("valueSource"), t.get("alarms")))
```

## ignition-mcp
`tag_browse` with path `[default]Station01` (recursive). Use `tag_config_export` for the full JSON config of one folder.

## Verify
The count of Station01 atomic tags matches the list in [[plant/station-01-tags]]: 4 points per pump and 3 per tank.

## Team rules
- Browsing is read-only and needs no approval, so do it first, every time.
- Report off-convention paths (anything outside `[default]Station01/<Equip>/<Point>`). Don't fix them silently.

Part of [[projects/faceplate]].

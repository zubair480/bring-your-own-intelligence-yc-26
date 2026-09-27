---
name: delete-tag
description: Use when you need to delete a tag or tag folder in Ignition, after exporting a backup and checking nothing still references it.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to delete a tag safely

## Purpose
Remove tags with `system.tag.deleteTags` without breaking screens or expression tags that still point at them.

## When to use
Someone asks to "delete a tag", "remove a point", or "clean up an old tag".

## Inputs
- Full tag paths, e.g. `[default]Station01/T-102/LevelLo`
- A backup file path on the gateway

## Steps
1. Export the tags first (see `export-import-tags`).
2. Search the project's JSON files for the path. Also check expression tags in the same folder, which refer to siblings as `{[.]Name}`.
3. If anything still references the tag, stop and report the references. Don't delete.
4. Call `deleteTags` and check every QualityCode.
5. Log what was deleted and where the backup lives in [[decisions/log]].

## Gateway script (Jython 2.7)
```python
import os
IGN = "/usr/local/bin/ignition"
paths = ["[default]Station01/T-102/LevelLo"]

# 1. backup
system.tag.exportTags("/var/backups/faceplate/pre-delete-T-102.json", paths, True, "json")

# 2. reference check across the project's resources
hits = []
for d, _, files in os.walk(IGN + "/data/projects/Faceplate"):
    for f in files:
        if f.endswith(".json"):
            p = os.path.join(d, f)
            if "Station01/T-102/LevelLo" in system.file.readFileAsString(p):
                hits.append(p)
print("references: %s" % hits)

# 3. delete only when nothing references it
if not hits:
    for p, qc in zip(paths, system.tag.deleteTags(paths)):
        print("%s -> %s" % (p, qc))
```

## ignition-mcp
`tag_config_export` (backup) → `perspective_list_views` + `perspective_get_view` (reference check) → delete through the gateway script above, since the tool list has no delete tool.

## Verify
`tag_browse` on `[default]Station01/T-102` no longer lists the tag, and every view still renders without red overlays.

## Team rules
- Never delete standard points from [[plant/station-01-tags]] (Running, Fault, SpeedPct, Amps, LevelPct, LevelHi, LevelLo) without a logged decision.
- The backup path must be written in the [[decisions/log]] entry.
- Safety: deleting a tag that drives an interlock is an operator decision, not an agent one.

Part of [[projects/faceplate]].

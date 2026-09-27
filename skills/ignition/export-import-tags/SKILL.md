---
name: export-import-tags
description: Use when you need to back up tags to JSON or restore tags from a JSON export, including before any risky tag change.
---

Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI

# How to export and import tags (backup and restore)

## Purpose
Snapshot tag configuration to JSON with `system.tag.exportTags`, and restore it with `system.tag.importTags`. This is the undo button for tag work.

## When to use
- Before `delete-tag`, a UDT conversion, or a bulk edit
- "Back up Station 01 tags."
- "Restore last night's tags."

## Inputs
- Tag paths to export, e.g. `[default]Station01` and `[default]_types_/Pump`
- A backup file path on the gateway
- For import: base path and collision policy

## Steps
1. Export the UDT definitions and the Station01 folder to timestamped files.
2. Record the file paths in [[decisions/log]].
3. To restore, import the UDT types first, then the instances.

## Gateway script (Jython 2.7)
```python
stamp = system.date.format(system.date.now(), "yyyyMMdd-HHmm")
types_file = "/var/backups/faceplate/types-%s.json" % stamp
tags_file  = "/var/backups/faceplate/station01-%s.json" % stamp

system.tag.exportTags(types_file, ["[default]_types_/Pump"], True, "json")
system.tag.exportTags(tags_file, ["[default]Station01"], True, "json")
print("saved %s and %s" % (types_file, tags_file))

# restore: types first, then the folder
# system.tag.importTags(types_file, "[default]_types_", "m")
# system.tag.importTags(tags_file, "[default]", "m")
```
Collision policies: `"a"` abort, `"o"` overwrite, `"i"` ignore existing, `"m"` merge.

## ignition-mcp
`tag_config_export` with the paths (returns JSON; save it in the repo or GBrain). `tag_config_import` with the JSON, base path, and collision policy.

## Verify
- After export, the file exists and contains `"name": "Station01"`.
- After import, `browse-tags` shows the same count as before, and `tag_read` returns Good quality.

## Team rules
- Always export before deleting or overwriting.
- Use `"m"` or `"i"` on restore. Use `"o"` only when you mean to replace edits made since the backup.
- Log backup paths to [[decisions/log]]. The tag list is in [[plant/station-01-tags]].

Part of [[projects/faceplate]].

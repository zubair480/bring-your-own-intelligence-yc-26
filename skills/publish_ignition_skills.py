"""Publish skills/ignition/*/SKILL.md to GBrain.

For each skill:
  1. page   skills/ignition/<name>        (put_page + tags)
  2. native workspace skill  skills/ignition-<name>/SKILL.md  (workspace_write -> list_skills/get_skill)
  3. graph edges from every [[slug]] in the body (add_link; remote writes don't auto-link)
Plus the index page skills/ignition/index.

    python skills/publish_ignition_skills.py
"""
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "server"))
from gbrain_client import GBrainClient, GBrainError  # noqa: E402

SKILL_DIR = ROOT / "skills" / "ignition"
HEADER = "Faceplate skill · Ignition 8.3 · used by agents in the QM room Station 01 HMI"
LINK_SOURCE = "faceplate-skills"
ORDER = [
    "create-tag", "bind-tag-to-component", "delete-tag", "read-write-tag", "browse-tags",
    "create-udt-pump", "add-alarm-to-tag", "query-ack-alarms", "enable-tag-history",
    "create-perspective-view", "edit-perspective-component", "add-pump-to-screen",
    "export-import-tags", "project-scan-deploy", "gateway-health-check",
]
# skill -> skills it builds on (extra graph edges)
USES = {
    "add-pump-to-screen": ["create-udt-pump", "read-write-tag", "bind-tag-to-component",
                           "edit-perspective-component", "project-scan-deploy"],
    "delete-tag": ["export-import-tags", "browse-tags"],
    "edit-perspective-component": ["project-scan-deploy"],
    "create-perspective-view": ["project-scan-deploy"],
    "bind-tag-to-component": ["project-scan-deploy"],
    "add-alarm-to-tag": ["read-write-tag", "query-ack-alarms"],
}
TRIGGERS = {
    "create-tag": ["how do I create a tag", "add a new tag", "make a memory tag", "create an OPC tag"],
    "bind-tag-to-component": ["attach a tag to a component", "bind a tag to a label", "wire a tag to the screen"],
    "delete-tag": ["delete a tag", "remove a tag"],
    "read-write-tag": ["read a tag value", "write a tag", "set pump speed"],
    "browse-tags": ["list tags", "browse tags", "show tag configuration"],
    "create-udt-pump": ["create pump UDT", "add pump instance"],
    "add-alarm-to-tag": ["add an alarm to a tag", "high level alarm"],
    "query-ack-alarms": ["acknowledge alarms", "what is alarming", "ack alarms"],
    "enable-tag-history": ["enable tag history", "trend a tag", "query tag history"],
    "create-perspective-view": ["create a perspective view", "new screen"],
    "edit-perspective-component": ["change a component style", "fix component color", "edit component props"],
    "add-pump-to-screen": ["add a new pump to the screen", "put a pump on the HMI"],
    "export-import-tags": ["back up tags", "export tags", "import tags", "restore tags"],
    "project-scan-deploy": ["project scan", "deploy view changes", "ignition REST API"],
    "gateway-health-check": ["gateway health", "trial reset", "gateway logs"],
}


def parse(path: Path):
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    fm, body = m.group(1), m.group(2).lstrip()
    meta = dict(line.split(": ", 1) for line in fm.splitlines() if ": " in line)
    title = re.search(r"^# (.+)$", body, re.M).group(1).strip()
    assert body.startswith(HEADER), path
    return meta["name"], meta["description"], title, body, text


def link(gb, frm, to, ltype, ctx, errors):
    try:
        gb.call_tool("add_link", {"from": frm, "to": to, "link_type": ltype,
                                  "context": ctx, "link_source": LINK_SOURCE})
        return 1
    except GBrainError as e:
        errors.append(f"add_link {frm}->{to}: {str(e)[:160]}")
        return 0


def main():
    gb = GBrainClient()
    errors, edges, skills = [], 0, []
    for name in ORDER:
        n, desc, title, body, raw = parse(SKILL_DIR / name / "SKILL.md")
        slug = f"skills/ignition/{n}"
        page = (f"---\ntitle: {json.dumps('Ignition skill: ' + title)}\ntype: note\n"
                f"tags: [faceplate-skill, ignition]\nskill: {n}\ndescription: {json.dumps(desc)}\n---\n\n{body}")
        gb.call_tool("put_page", {"slug": slug, "content": page})
        for t in ("faceplate-skill", "ignition"):
            try:
                gb.call_tool("add_tag", {"slug": slug, "tag": t})
            except GBrainError as e:
                errors.append(f"add_tag {slug}: {str(e)[:120]}")
        # native workspace skill
        ws_name = f"ignition-{n}"
        trig = "\n".join(f"  - {json.dumps(t)}" for t in TRIGGERS.get(n, []))
        ws = (f"---\nname: {ws_name}\ndescription: {desc}\ntriggers:\n{trig}\n---\n\n"
              f"{body}\n\nGBrain page: [[{slug}]]\n")
        try:
            gb.call_tool("workspace_write", {"path": f"skills/{ws_name}/SKILL.md", "content": ws})
        except GBrainError as e:
            errors.append(f"workspace_write {ws_name}: {str(e)[:160]}")
        targets = sorted(set(re.findall(r"\[\[([^\]|]+)\]\]", body)))
        for t in targets:
            edges += link(gb, slug, t, "references", f"Ignition skill {n} applies rules from {t}", errors)
        for u in USES.get(n, []):
            edges += link(gb, slug, f"skills/ignition/{u}", "uses", f"{n} builds on {u}", errors)
        skills.append((n, desc, title))
        print("published", slug)

    rows = "\n".join(f"| [[skills/ignition/{n}]] | {d} |" for n, d, _ in skills)
    index = f"""---
title: "Ignition skills for Faceplate agents (index)"
type: note
tags: [faceplate-skill, ignition]
---

{HEADER}

# Ignition skills index

GBrain teaches agents, including the ones in [[qm/rooms/station-01-hmi]], how to operate Inductive Automation Ignition 8.3 the Faceplate way. Each skill has a purpose, when to use it, inputs, steps, a Jython 2.7 gateway script, the matching ignition-mcp tool call, how to verify, and team rules.

Agents also get these skills natively through `list_skills` / `get_skill` as `ignition-<name>`.

| Skill | When to use |
|---|---|
{rows}

## Core loop
[[skills/ignition/edit-perspective-component]]: GBrain rules → model patch → validate → upsert → log decision in [[decisions/log]].

## House rules every skill applies
- Tag paths: `[default]Station01/<Equip>/<Point>` ([[plant/station-01-tags]])
- ISA-101 colors from [[hmi/style-guide]]: running `#4A4A48` (never green), alarm high `#E0301E`, warning `#F5A623`
- Every change is logged in [[decisions/log]]

Project: [[projects/faceplate]]
"""
    gb.call_tool("put_page", {"slug": "skills/ignition/index", "content": index})
    for n, _, _ in skills:
        edges += link(gb, "skills/ignition/index", f"skills/ignition/{n}", "contains", f"index lists {n}", errors)
    for t in ("projects/faceplate", "qm/rooms/station-01-hmi", "hmi/style-guide", "plant/station-01-tags", "decisions/log"):
        edges += link(gb, "skills/ignition/index", t, "references", "Ignition skills index", errors)
    edges += link(gb, "projects/faceplate", "skills/ignition/index", "references", "Faceplate's Ignition skill library", errors)
    edges += link(gb, "qm/rooms/station-01-hmi", "skills/ignition/index", "references", "Skills agents in this room use", errors)
    print("published skills/ignition/index")
    print("edges added:", edges)
    print("errors:", len(errors))
    for e in errors:
        print("  ", e)


if __name__ == "__main__":
    main()

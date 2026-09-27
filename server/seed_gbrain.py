"""Throwaway: seed GBrain with Faceplate demo data (YC hackathon, 2026-09-27).

Creates demo pages, appends to hmi/style-guide and decisions/log (append-only),
adds explicit graph links (remote put_page skips wikilink extraction).
Never prints the token.
"""
from __future__ import annotations

import re
import sys
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gbrain_client import GBrainClient  # noqa: E402

HDR = "Demo seed data for Faceplate (YC hackathon, 2026-09-27).\n\n"

PAGES: dict[str, tuple[str, str, str]] = {}  # slug -> (title, type, body)


def page(slug, title, ptype, body):
    PAGES[slug] = (title, ptype, HDR + body.strip() + "\n")


page("company/bayview-water", "Bayview Water District", "company", """
# Bayview Water District

Bayview Water District is a fictional municipal water utility. It operates **Pump Station 01**, which moves treated water out of two storage tanks ([[plant/equipment/t-101]], [[plant/equipment/t-102]]) with three 75 HP pumps ([[plant/equipment/p-101]], [[plant/equipment/p-102]], [[plant/equipment/p-103]]), metered at [[plant/equipment/ft-301]].

**SCADA:** Ignition 8.3, with Perspective views for every operator screen. Tags live under `[default]Station01/...` (see [[plant/station-01-tags]]).

## Why HMI consistency matters
Three different integrators have built Bayview screens over the years, each in their own style: different colors for "running", alarms in different places, and mixed units (GPM vs m³/h). Operators moving between screens misread state, and the [[incidents/2026-08-14-t102-near-overflow]] showed the cost. Every screen is now held to one ISA-101 standard ([[hmi/style-guide]]), applied with [[projects/faceplate]].

## People
- [[people/zubair]]: HMI lead
- [[people/maria-chen]]: operations supervisor, night shift
- [[people/dev-patel]]: controls engineer, pumps
- [[people/sam-okafor]]: integrator contractor who built the legacy screens
""")

page("people/zubair", "Zubair", "person", """
# Zubair

HMI lead at [[company/bayview-water]].

- Owns the Pump Station 01 Perspective screens (main view, pump faceplates, tank and flow panels).
- Wrote the team's ISA-101 standard, [[hmi/style-guide]]: gray background, dark gray for running, color only for abnormal states, units next to every value.
- Records screen decisions in [[decisions/log]] and runs the [[qm/rooms/station-01-hmi]] QM room.
- Is replacing the legacy screens built by [[people/sam-okafor]], which used green for running.
- Built [[projects/faceplate]] so a one-line request ("show running per our standard") becomes a standard-compliant component edit instead of a manual rework.

Works with [[people/dev-patel]] on pump screens and with [[people/maria-chen]] on alarm layout. Current open item: [[requests/night-shift-alarm-cleanup]].
""")

page("people/maria-chen", "Maria Chen", "person", """
# Maria Chen

Operations supervisor, night shift, at [[company/bayview-water]]. Her crew watches Pump Station 01 from 19:00 to 07:00 with one operator on console.

## What night shift wants
- **Alarms on the left.** The alarm panel should sit on the left edge of every Station 01 view so it is the first thing the eye lands on. Adopted 2026-08-22 (see [[decisions/log]]).
- **Fewer low-priority alarms.** Priority-3 and priority-4 alarms (e.g. brief V-202 position deviation, FT-301 flicker) bury the ones that matter. She wants them hidden by default, with priority-1 tank HI alarms always on top.

She was on shift during the [[incidents/2026-08-14-t102-near-overflow]], and it is the reason she pushes for a clean alarm list.

Open request: [[requests/night-shift-alarm-cleanup]], to be done through [[projects/faceplate]]. Member of [[qm/rooms/station-01-hmi]].
""")

page("people/dev-patel", "Dev Patel", "person", """
# Dev Patel

Controls engineer for pumps at [[company/bayview-water]].

- **Owns P-101, P-102 and P-103**: [[plant/equipment/p-101]], [[plant/equipment/p-102]], [[plant/equipment/p-103]]. He owns the pump logic, the `[default]Station01/P-10x/...` tags and the pump faceplates' data bindings.
- Knows the **P-103 bearing history**: two motor bearing faults since June 2026. He scheduled the bearing replacement for 2026-10-04 and wrote [[sops/pump-changeover]] so operators can shift duty to P-101 or P-102 while P-103 is down.
- Set the 60-minute default trend window on the pump screens (see [[decisions/log]]).

Ask Dev about pump amps, speed setpoints, or fault codes. Member of [[qm/rooms/station-01-hmi]]; reviews Faceplate edits that touch pump components ([[projects/faceplate]]).
""")

page("people/sam-okafor", "Sam Okafor", "person", """
# Sam Okafor

Integrator contractor who built the original Pump Station 01 screens for [[company/bayview-water]] (2023). One of the three integrators whose different styles made the screens inconsistent.

## Legacy screen issues
- **Green for running.** Sam's screens fill a running pump bright green. That violates the ISA-101 standard in [[hmi/style-guide]]: running is dark gray #4A4A48 with a white label, and color is reserved for abnormal states. Decision to remove it is in [[decisions/log]].
- Alarm banner at the top-right instead of the left.
- Flow shown in m³/h on some panels.

[[people/zubair]] is replacing these screens component by component using [[projects/faceplate]]. Sam is not a member of the QM room and no longer edits Station 01 views.
""")

PUMP = """
# {name}

75 HP centrifugal pump at Pump Station 01, [[company/bayview-water]]. Owner: [[people/dev-patel]].

## Tags
- `[default]Station01/{name}/Running`
- `[default]Station01/{name}/Fault`
- `[default]Station01/{name}/SpeedPct`
- `[default]Station01/{name}/Amps`

(See [[plant/station-01-tags]].)

## Screen standard
Running = dark gray #4A4A48 fill with a white "RUN" label. Fault = red #E0301E. Never green ([[hmi/style-guide]]).

{extra}
Duty changes follow [[sops/pump-changeover]]. Pumps discharge through [[plant/equipment/v-201]] and are metered at [[plant/equipment/ft-301]].
"""

page("plant/equipment/p-101", "P-101", "equipment", PUMP.format(
    name="P-101", extra="## Status\nLead duty pump. No open issues. Takes duty when [[plant/equipment/p-103]] is down.\n"))
page("plant/equipment/p-102", "P-102", "equipment", PUMP.format(
    name="P-102", extra="## Status\nLag pump. No open issues. Its faceplate was the first one rebuilt to the standard with Faceplate on 2026-09-27 ([[decisions/log]]).\n"))
page("plant/equipment/p-103", "P-103", "equipment", PUMP.format(
    name="P-103", extra=(
        "## Motor fault history\n"
        "- 2026-06-18: motor bearing fault, `Fault` tripped at high amps. Bearing greased, returned to service.\n"
        "- 2026-08-29: second motor bearing fault, vibration and high `Amps`.\n"
        "- **Bearing replacement scheduled 2026-10-04.** Until then P-103 runs as standby only.\n\n"
        "Owner [[people/dev-patel]] knows the full history. Operators should watch `Amps` and switch to "
        "[[plant/equipment/p-101]] using [[sops/pump-changeover]] if it climbs.\n")))

TANK = """
# {name}

50,000 gal storage tank at Pump Station 01, [[company/bayview-water]].

## Tags
`[default]Station01/{name}/LevelPct`, `LevelHi`, `LevelLo` (see [[plant/station-01-tags]]).

## Limits
- **HI alarm: 85%** (priority 1, red #E0301E). Set after the [[incidents/2026-08-14-t102-near-overflow]].
- **LO alarm: 15%** (warning, amber #F5A623).

{extra}
Feeds pumps [[plant/equipment/p-101]], [[plant/equipment/p-102]] and [[plant/equipment/p-103]].
"""

page("plant/equipment/t-101", "T-101", "equipment", TANK.format(
    name="T-101", extra="## Notes\nNormally runs 40 to 70%. No known issues. Inlet valve [[plant/equipment/v-202]].\n"))
page("plant/equipment/t-102", "T-102", "equipment", TANK.format(
    name="T-102", extra=(
        "## Notes\n**T-102 runs high** because an upstream valve on the transfer line does not fully throttle, "
        "so it sits 70 to 80% most nights, close to the HI limit. This is why the tank HI alarm is priority 1 "
        "on the Station 01 screen and why night shift ([[people/maria-chen]]) wants it on top of the alarm list. "
        "Inlet valve [[plant/equipment/v-202]].\n")))

page("plant/equipment/v-201", "V-201", "equipment", """
# V-201

Pump discharge header valve at Pump Station 01, [[company/bayview-water]]. Modulating, tag `[default]Station01/V-201/OpenPct` (see [[plant/station-01-tags]]).

- Normally 60 to 80% open with one pump running.
- Shown in gray with the open % in monospace and a "%" unit, per [[hmi/style-guide]].
- Throttling V-201 changes discharge flow at [[plant/equipment/ft-301]].

Used in step 3 of [[sops/pump-changeover]]. Serves pumps [[plant/equipment/p-101]], [[plant/equipment/p-102]] and [[plant/equipment/p-103]].
""")

page("plant/equipment/v-202", "V-202", "equipment", """
# V-202

Tank inlet valve at Pump Station 01, [[company/bayview-water]]. Tag `[default]Station01/V-202/OpenPct` (see [[plant/station-01-tags]]).

- Controls fill into [[plant/equipment/t-101]] and [[plant/equipment/t-102]].
- Closing V-202 is the first operator action on a tank HI alarm (see [[incidents/2026-08-14-t102-near-overflow]]).
- Brief position-deviation alarms from V-202 are low priority (P3). They are one of the noisy alarms named in [[requests/night-shift-alarm-cleanup]].
""")

page("plant/equipment/ft-301", "FT-301", "equipment", """
# FT-301

Station discharge flow meter at Pump Station 01, [[company/bayview-water]]. Tag `[default]Station01/FT-301/GPM` (see [[plant/station-01-tags]]).

- **Normal flow: 1,200 to 1,350 GPM** with one duty pump.
- **Warning: below 900 GPM** (amber #F5A623). Usually means a pump trip or a throttled [[plant/equipment/v-201]].
- Always displayed in **GPM, not m³/h** ([[decisions/log]], [[hmi/style-guide]]).
- Trend default window: 60 min.

Watch FT-301 during [[sops/pump-changeover]]; flow should recover to above 1,200 GPM within 2 minutes.
""")

page("incidents/2026-08-14-t102-near-overflow", "2026-08-14 T-102 near-overflow", "incident", """
# Incident: T-102 near-overflow (2026-08-14)

**When:** 2026-08-14, about 02:40, night shift ([[people/maria-chen]] supervising).
**Where:** [[plant/equipment/t-102]], Pump Station 01, [[company/bayview-water]].

## What happened
T-102 climbed to 97% level. The upstream valve was not throttling, and the only level alarm was set at 95%, drawn in the same green as running equipment on the legacy screen ([[people/sam-okafor]]), and buried under low-priority alarms in a top-right banner. The operator closed [[plant/equipment/v-202]] with about 4 minutes of margin. No spill.

## Outcome
- **HI alarm set at 85%** (LO at 15%) on both tanks, [[plant/equipment/t-101]] and [[plant/equipment/t-102]].
- **Tank HI alarms made priority 1** on the Station 01 screen: always top of the list, red #E0301E.
- Alarms panel moved to the left ([[requests/night-shift-alarm-cleanup]]).
- All recorded in [[decisions/log]] and enforced by [[hmi/style-guide]].
""")

page("sops/pump-changeover", "SOP: Pump changeover", "sop", """
# SOP: Pump changeover (Pump Station 01)

Owner: [[people/dev-patel]]. Use it to move duty between [[plant/equipment/p-101]], [[plant/equipment/p-102]] and [[plant/equipment/p-103]], for example before the P-103 bearing replacement on 2026-10-04.

1. Confirm the standby pump shows no `Fault` and is in Auto on the Station 01 screen.
2. Start the standby pump and wait until `Running` is true (dark gray RUN, per [[hmi/style-guide]]) and `Amps` settles.
3. Ramp the outgoing pump's `SpeedPct` down to 0 over 60 s; hold [[plant/equipment/v-201]] at its current position.
4. Stop the outgoing pump. Check [[plant/equipment/ft-301]] recovers to 1,200 to 1,350 GPM within 2 min; below 900 GPM, restart it.
5. Log the changeover (pump out, pump in, time, reason) in the shift log and, for screen changes, in [[decisions/log]].
""")

page("requests/night-shift-alarm-cleanup", "Request: night-shift alarm cleanup", "request", """
# Request: night-shift alarm cleanup

**Requested by:** [[people/maria-chen]] (operations supervisor, night shift)
**Status:** open
**Handled via:** [[projects/faceplate]], discussed in [[qm/rooms/station-01-hmi]]
**Screen owner:** [[people/zubair]]

## Ask
1. Alarms panel on the **left** of every Station 01 view (done on the main view 2026-08-22; pump and tank popups still pending).
2. **Fewer low-priority alarms**: hide P3/P4 by default (e.g. [[plant/equipment/v-202]] position deviation, [[plant/equipment/ft-301]] flicker) behind a "show all" toggle.
3. Tank HI alarms ([[plant/equipment/t-102]] especially) always pinned on top as priority 1, per the [[incidents/2026-08-14-t102-near-overflow]].

## Plan
Click the alarm table in Faceplate, type "filter to priority 1 and 2, P1 on top", accept the edit, and let it log to [[decisions/log]].
""")

page("qm/rooms/station-01-hmi", "QM room: Station 01 HMI", "project", """
# QM room: "Station 01 HMI"

A shared room in QM (YC's multiplayer agent harness) where the [[company/bayview-water]] team and their agents work on Pump Station 01 screens. Local QM runs at **localhost:8129**.

## Members
[[people/zubair]] (HMI lead), [[people/dev-patel]] (pumps), [[people/maria-chen]] (night shift).

## Connected tools
- **GBrain MCP**: team memory. Rules ([[hmi/style-guide]]), tags ([[plant/station-01-tags]]), people, incidents, and [[decisions/log]]. Every agent in the room reads and writes the same GBrain.
- **ignition-mcp**: reads and writes Ignition 8.3 Perspective views.
- **River-trained Qwen3.8 LoRA**: edits components to house style.

## How a request flows
QM room → agent → GBrain rules → model → Ignition → decision logged back to GBrain.

Example: Maria posts [[requests/night-shift-alarm-cleanup]]; the agent pulls the style guide and incident history, the model patches the alarm table, ignition-mcp writes the view, and the accepted change lands in [[decisions/log]]. Front end: [[projects/faceplate]].
""")

page("projects/faceplate", "Faceplate", "project", """
# Faceplate

AI copilot for Ignition Perspective HMI screens, built by [[people/zubair]] for [[company/bayview-water]].

## How it works
An engineer clicks a component on the Pump Station 01 screen (say the [[plant/equipment/p-102]] faceplate) and types a change. The backend pulls team rules from GBrain, a Qwen model edits the component to the team standard, and accepting logs a decision to [[decisions/log]] and saves a training pair.

## Where each piece fits
- **GBrain**: shared team memory. [[hmi/style-guide]], [[plant/station-01-tags]], equipment pages ([[plant/equipment/p-101]], [[plant/equipment/p-103]], [[plant/equipment/t-101]], [[plant/equipment/t-102]], [[plant/equipment/v-201]], [[plant/equipment/v-202]], [[plant/equipment/ft-301]]), the [[incidents/2026-08-14-t102-near-overflow]], [[sops/pump-changeover]], and [[decisions/log]]. The model is grounded in these, not generic HMI advice.
- **QM**: the team's agents run in the shared room [[qm/rooms/station-01-hmi]] and read and write the same GBrain.
- **River**: trains the Qwen3.8 LoRA on accepted edits, so each accepted decision improves house style.

## People
[[people/zubair]], [[people/dev-patel]], [[people/maria-chen]]; legacy screens by [[people/sam-okafor]]. First real job: [[requests/night-shift-alarm-cleanup]].
""")

STYLE_APPEND = """

## Alarms
- The alarms panel sits on the **left** edge of every Station 01 view (night-shift request from [[people/maria-chen]]).
- Tank HI alarms are **priority 1** and always top of the list. HI limit 85%, LO limit 15% (set after [[incidents/2026-08-14-t102-near-overflow]]).
- Low-priority (P3/P4) alarms are hidden by default behind a "show all" toggle ([[requests/night-shift-alarm-cleanup]]).

## Trends
- Default trend window is **60 min**.

## Units
- Flow is always shown in **GPM, never m³/h** (e.g. [[plant/equipment/ft-301]], normal 1,200 to 1,350 GPM).

## Ownership and history
- Written and owned by [[people/zubair]], HMI lead at [[company/bayview-water]].
- Replaces the legacy green-for-running screens by [[people/sam-okafor]].
- Every accepted change is recorded in [[decisions/log]]; applied with [[projects/faceplate]].
"""

DECISIONS = [
    "- 2026-08-15 09:30 — Zubair: T-101/T-102 HI level alarm set at 85% (LO 15%) after the 2026-08-14 T-102 near-overflow; tank HI alarms are priority 1 on the Station 01 screen.",
    "- 2026-08-22 14:10 — Zubair: alarms panel moved to the left edge of every Station 01 view, at Maria Chen's (night shift) request.",
    "- 2026-09-03 11:00 — Zubair: no green for running. Replacing Sam Okafor's legacy integrator screens; running pumps use dark gray #4A4A48 with a white label (ISA-101).",
    "- 2026-09-10 16:20 — Dev Patel: trend default window is 60 min on all Station 01 trends.",
    "- 2026-09-17 10:05 — Zubair: flow is displayed in GPM, not m³/h (FT-301 normal 1,200–1,350 GPM, warning below 900 GPM).",
]
DECISION_LINKS = ["incidents/2026-08-14-t102-near-overflow", "people/maria-chen", "people/sam-okafor",
                  "people/dev-patel", "plant/equipment/ft-301", "people/zubair", "hmi/style-guide"]

VERIFY = [
    "why is the HI alarm at 85%",
    "who owns P-103",
    "what does night shift want",
    "which tools are in the QM room",
    "should running pumps be green",
]

_tl = threading.local()


def client() -> GBrainClient:
    if not hasattr(_tl, "c"):
        _tl.c = GBrainClient()
    return _tl.c


WIKI = re.compile(r"\[\[([^\]|#]+)")


def links_of(body: str) -> list[str]:
    seen = []
    for s in WIKI.findall(body):
        s = s.strip()
        if s not in seen:
            seen.append(s)
    return seen


def main():
    errors = []
    gb = GBrainClient()

    # 1. new pages
    def put(item):
        slug, (title, ptype, body) = item
        try:
            client().put_page(slug, body, title=title, page_type=ptype)
            return slug, None
        except Exception as e:
            return slug, str(e)[:300]

    with ThreadPoolExecutor(6) as ex:
        for slug, err in ex.map(put, PAGES.items()):
            print(("ERR " if err else "ok  ") + slug + (f": {err}" if err else ""))
            if err:
                errors.append((slug, err))

    # 2. style guide: append sections (keep every existing line)
    try:
        sg = gb.get_page("hmi/style-guide", include_content=True)
        content = sg["content"]
        if "## Ownership and history" not in content:
            gb.put_page("hmi/style-guide", content.rstrip("\n") + STYLE_APPEND, title="HMI Style Guide (ISA-101)")
            print("ok  hmi/style-guide (appended)")
        else:
            print("skip hmi/style-guide (already enriched)")
    except Exception as e:
        errors.append(("hmi/style-guide", str(e)[:300]))
        print("ERR hmi/style-guide", str(e)[:300])

    # 3. decisions log: append only, matching `- ts — author: text`
    try:
        dl = gb.get_page("decisions/log", include_content=True)
        content = dl["content"]
        new_lines = [ln for ln in DECISIONS if ln not in content]
        if new_lines:
            gb.put_page("decisions/log", content.rstrip("\n") + "\n" + "\n".join(new_lines) + "\n", title="Decision Log")
        print(f"ok  decisions/log (+{len(new_lines)} lines)")
    except Exception as e:
        errors.append(("decisions/log", str(e)[:300]))
        print("ERR decisions/log", str(e)[:300])

    # 4. graph links (remote put_page does not extract wikilinks)
    edges = []
    for slug, (_, _, body) in PAGES.items():
        edges += [(slug, t) for t in links_of(body) if t != slug]
    edges += [("hmi/style-guide", t) for t in links_of(STYLE_APPEND)]
    edges += [("decisions/log", t) for t in DECISION_LINKS]

    def link(e):
        f, t = e
        try:
            client().call_tool("add_link", {"from": f, "to": t, "link_type": "mentions", "link_source": "faceplate-seed"})
            return None
        except Exception as ex_:
            return f"{f}->{t}: {str(ex_)[:200]}"

    with ThreadPoolExecutor(8) as ex:
        link_errs = [r for r in ex.map(link, edges) if r]
    print(f"links: {len(edges) - len(link_errs)}/{len(edges)} ok")
    for le in link_errs[:10]:
        print("  LINK ERR", le)
    errors += [("link", le) for le in link_errs]

    # 5. verify
    for q in VERIFY:
        for fn in ("query", "search"):
            try:
                hits = getattr(gb, fn)(q, limit=3)
                if isinstance(hits, dict):
                    hits = hits.get("results") or hits.get("hits") or []
                top = [h.get("slug") for h in hits][:3] if isinstance(hits, list) else [str(hits)[:120]]
            except Exception as e:
                top = [f"ERR {str(e)[:150]}"]
            print(f"{fn:6} | {q} -> {top}")

    print(f"errors: {len(errors)}")


if __name__ == "__main__":
    main()

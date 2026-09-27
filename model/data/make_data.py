"""Generate train.jsonl (~120) and eval.jsonl (20) for the Faceplate edit model.

Train and eval use disjoint instruction phrasings, disjoint component-name
styles and disjoint rule wordings, so eval measures unseen tasks.

    python model/data/make_data.py
"""
from __future__ import annotations

import json
import random
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent))
from faceplate_common import (  # noqa: E402
    ALARM_RED, GREY_RUN, WARN_AMBER, POINT_UNITS, check_output, format_patch,
)

PUMPS = ["P-101", "P-102", "P-103"]
TANKS = ["T-101", "T-102"]
VALVES = ["V-201", "V-202"]
FLOW = ["FT-301"]


def tag(eq: str, point: str) -> str:
    return f"[default]Station01/{eq}/{point}"


def name_fields(eq: str) -> dict:
    compact = eq.replace("-", "")
    digits = "".join(c for c in eq if c.isdigit())
    return {"e": eq, "c": compact, "n": digits}


# Rules the engineer's team passes along. They name the standard but do not
# spell out the colors or tag format; that is what the model has to learn.
RULES = {
    "train": [
        ["ISA-101 house style"],
        ["Follow the Station01 HMI standard", "Units always shown"],
        ["High-performance HMI palette", "Use real Station01 tags only"],
        ["ISA-101", "No decorative color"],
        ["Team style guide v3"],
        ["Gray means normal, color means abnormal", "Show engineering units"],
        ["Station01 conventions", "Do not invent tags"],
    ],
    "eval": [
        ["House ISA-101 rules apply"],
        ["Station01 display conventions", "Always show engineering units"],
        ["Plant HMI standard", "Bind only to existing tags"],
    ],
}

NAMES = {
    "ia.symbol.pump": {"train": ["Pump_{c}", "{e} Pump", "pmp{c}", "{c}_Motor"],
                       "eval": ["Sym_{c}", "FeedPump-{e}"]},
    "ia.display.cylindricaltank": {"train": ["Tank_{c}", "{e} Level", "TK{n}"],
                                   "eval": ["{c}_Gauge", "Vessel {e}"]},
    "ia.display.alarmstatustable": {"train": ["AlarmTable", "Alarms_Main", "Station01 Alarms"],
                                    "eval": ["ActiveAlarms", "AlmSummary"]},
    "ia.chart.timeseries": {"train": ["TrendChart", "Main Trend", "Trend_{c}"],
                            "eval": ["HistoryPlot", "Overview Trend"]},
    "ia.display.label": {"train": ["lbl_{c}_{pt}", "{c}{pt}_Value"],
                         "eval": ["{e} {pt} Readout"]},
    "ia.symbol.valve": {"train": ["Valve_{c}", "{e}", "XV{n}"],
                        "eval": ["{c}_Symbol", "Ctrl Valve {e}"]},
    "ia.symbol.sensor": {"train": ["FT301", "FlowSensor_{c}", "{e} Flowmeter"],
                         "eval": ["Flow_{e}", "Meter {c}"]},
}

PRIORITIES = ["Low", "Medium", "High", "Critical"]
DURATIONS = {
    "train": [("15 minutes", 15), ("30 minutes", 30), ("last hour", 60), ("2 hours", 120),
              ("8 hours", 480), ("24 hours", 1440)],
    "eval": [("45 minutes", 45), ("4 hours", 240), ("12 hours", 720), ("full day", 1440)],
}
AXIS_SOURCES = [  # (equipment pool, point, spoken name)
    (FLOW, "GPM", "flow"),
    (PUMPS, "Amps", "motor current"),
    (PUMPS, "SpeedPct", "speed"),
    (TANKS, "LevelPct", "level"),
    (VALVES, "OpenPct", "valve position"),
]
LABEL_POINTS = [(PUMPS, "SpeedPct"), (PUMPS, "Amps"), (TANKS, "LevelPct"),
                (VALVES, "OpenPct"), (FLOW, "GPM")]


# Each family: component type, equipment picker, phrasings per split, and a
# builder returning (format params, patch).

def pump_run(rng, eq):
    return {}, {"runFill": GREY_RUN}


def pump_fault(rng, eq):
    return {}, {"faultColor": ALARM_RED}


def pump_speed(rng, eq):
    return {}, {"showSpeed": True}


def pump_amps(rng, eq):
    return {}, {"showAmps": True}


def pump_label(rng, eq):
    word = rng.choice(["RUN", "RUNNING", "ON"])
    return {"word": word}, {"runLabel": word, "runFill": GREY_RUN}


def pump_combo(rng, eq):
    return {}, {"runFill": GREY_RUN, "showSpeed": True, "showAmps": True}


def pump_hide(rng, eq):
    which = rng.choice([("speed", "showSpeed"), ("amps", "showAmps")])
    return {"what": which[0]}, {which[1]: False}


def tank_bind(rng, eq):
    return {}, {"tag": tag(eq, "LevelPct")}


def tank_limits(rng, eq):
    return {}, {"showLimits": True, "hi": tag(eq, "LevelHi"), "lo": tag(eq, "LevelLo")}


def tank_volume(rng, eq):
    return {}, {"showVolume": True}


def tank_combo(rng, eq):
    return {}, {"tag": tag(eq, "LevelPct"), "showLimits": True,
                "hi": tag(eq, "LevelHi"), "lo": tag(eq, "LevelLo")}


def alarm_prio(rng, eq):
    p = rng.choice(PRIORITIES)
    return {"p": p, "pl": p.lower()}, {"minPriority": p}


def alarm_ack(rng, eq):
    return {}, {"showAckAll": True}


def alarm_combo(rng, eq):
    p = rng.choice(PRIORITIES[1:])
    return {"p": p, "pl": p.lower()}, {"minPriority": p, "showAckAll": True}


def alarm_noack(rng, eq):
    return {}, {"showAckAll": False}


def ts_range(rng, eq, split):
    words, minutes = rng.choice(DURATIONS[split])
    return {"h": words}, {"rangeMinutes": minutes}


def _axis(rng):
    pool, point, what = rng.choice(AXIS_SOURCES)
    eq = rng.choice(pool)
    return eq, what, {"tag": tag(eq, point), "units": POINT_UNITS[point]}


def ts_axis(rng, eq):
    aeq, what, axis = _axis(rng)
    return {"ae": aeq, "what": what}, {"secondAxis": axis}


def ts_noaxis(rng, eq):
    return {}, {"secondAxis": False}


def ts_combo(rng, eq, split):
    words, minutes = rng.choice(DURATIONS[split])
    aeq, what, axis = _axis(rng)
    return {"h": words, "ae": aeq, "what": what}, {"rangeMinutes": minutes, "secondAxis": axis}


def _label_units(pt):
    return POINT_UNITS[pt]


def label_units(rng, eq, pt):
    return {}, {"units": _label_units(pt)}


def _threshold(rng, pt):
    if pt == "GPM":
        return rng.choice([40, 60, 75, 120, 150])
    if pt == "Amps":
        return rng.choice([18, 22, 30, 45])
    return rng.choice([70, 80, 85, 90, 95])


def label_warn(rng, eq, pt):
    n, u = _threshold(rng, pt), _label_units(pt)
    return {"x": n}, {"units": u, "warnAbove": {"value": n, "units": u, "color": WARN_AMBER}}


def label_alarm(rng, eq, pt):
    n, u = _threshold(rng, pt), _label_units(pt)
    return {"x": n}, {"units": u, "warnAbove": {"value": n, "units": u, "color": ALARM_RED}}


def label_bar(rng, eq, pt):
    return {}, {"units": _label_units(pt), "showBar": True}


def label_greenok(rng, eq, pt):
    n, u = _threshold(rng, pt), _label_units(pt)
    return {"x": n}, {"units": u, "warnAbove": {"value": n, "units": u, "color": WARN_AMBER}}


def valve_show(rng, eq):
    return {}, {"showOpenPct": True}


def valve_hide(rng, eq):
    return {}, {"showOpenPct": False}


def sensor_total(rng, eq):
    return {}, {"showTotal": True}


def _low_flow(rng):
    return rng.choice([20, 25, 30, 40, 50])


def sensor_warn(rng, eq):
    n = _low_flow(rng)
    return {"x": n}, {"warnBelow": {"value": n, "units": "GPM", "color": WARN_AMBER}}


def sensor_alarm(rng, eq):
    n = _low_flow(rng)
    return {"x": n}, {"warnBelow": {"value": n, "units": "GPM", "color": ALARM_RED}}


def sensor_combo(rng, eq):
    n = _low_flow(rng)
    return {"x": n}, {"showTotal": True,
                      "warnBelow": {"value": n, "units": "GPM", "color": WARN_AMBER}}


PUMP, TANK, ALARM, TS, LABEL, VALVE, SENSOR = (
    "ia.symbol.pump", "ia.display.cylindricaltank", "ia.display.alarmstatustable",
    "ia.chart.timeseries", "ia.display.label", "ia.symbol.valve", "ia.symbol.sensor")

FAMILIES = [
    # (type, equipment pool, builder, train phrasings, eval phrasings)
    (PUMP, PUMPS, pump_run,
     ["Make the running state green.", "Color the pump green when it's running.",
      "Running indication should be bright green like the old screens.",
      "Set the run fill color.", "Give it a proper running color.",
      "Use lime for the running fill.", "Running = green please."],
     ["Operators want a green pump symbol whenever it is on.",
      "Paint the run state #00FF00 please."]),
    (PUMP, PUMPS, pump_fault,
     ["Fault should show red.", "Highlight faults.", "Make trips obvious.",
      "Set the fault color to alarm red."],
     ["When this thing trips I want it to scream at the operator."]),
    (PUMP, PUMPS, pump_speed,
     ["Show the speed.", "Display VFD speed on the symbol.", "Add a percent speed readout."],
     ["Operators need to see how fast it's spinning."]),
    (PUMP, PUMPS, pump_amps,
     ["Show motor current.", "Display amps.", "Add the amperage readout."],
     []),
    (PUMP, PUMPS, pump_label,
     ["Label the running state {word}.", "Running text should read {word} and be green.",
      "Caption it {word} when running, green fill."],
     ["Swap the run caption to '{word}' and tint it green."]),
    (PUMP, PUMPS, pump_combo,
     ["Show speed and amps, running in green.",
      "Full detail: speed, current, and a running color.",
      "Turn on speed and amps and make running bright green."],
     ["Everything on: rpm percent, current draw, and a green running state."]),
    (PUMP, PUMPS, pump_hide,
     ["Hide the {what} readout.", "Remove {what} from the symbol."],
     []),
    (TANK, TANKS, tank_bind,
     ["Bind the level to the tank.", "Hook this up to the level tag.",
      "Wire the fill to the real level.", "Point this at the tank level PV."],
     ["This gauge isn't connected to anything, fix the binding."]),
    (TANK, TANKS, tank_limits,
     ["Show the hi/lo limits.", "Add high and low level markers.",
      "Display the alarm limits on the tank."],
     ["Operators should see where the overflow and dry-run setpoints sit."]),
    (TANK, TANKS, tank_volume,
     ["Show volume.", "Display the tank volume too."],
     []),
    (TANK, TANKS, tank_combo,
     ["Bind the level and show limits.", "Hook up the level tag and add hi/lo markers.",
      "Connect level, show limits, high limit in green."],
     ["Connect it to live level and mark the high and low trips."]),
    (ALARM, [None], alarm_prio,
     ["Only show {pl} and above.", "Filter out anything below {pl}.",
      "Minimum priority {p}."],
     ["Too noisy, I only care about {pl} priority or worse."]),
    (ALARM, [None], alarm_ack,
     ["Add an acknowledge all button.", "Let operators ack everything at once."],
     []),
    (ALARM, [None], alarm_combo,
     ["Show {pl}+ alarms with an ack-all button.",
      "Filter to {pl} and up and add acknowledge all."],
     ["Just {pl} and up, plus a bulk acknowledge."]),
    (ALARM, [None], alarm_noack,
     ["Remove the ack all button."],
     []),
    (TS, [None], ts_range,
     ["Show the {h}.", "Set the window to {h}.", "Trend range {h}."],
     ["Zoom out so I can see the whole {h}."]),
    (TS, [None], ts_axis,
     ["Put {ae} {what} on a second axis.", "Add {what} for {ae} on the right axis."],
     ["Overlay {ae}'s {what} with its own scale."]),
    (TS, [None], ts_noaxis,
     ["Drop the second axis."],
     []),
    (TS, [None], ts_combo,
     ["Show {h} and put {ae} {what} on a second axis."],
     []),
    (LABEL, None, label_units,
     ["Show the units.", "Add engineering units.", "Format this readout properly."],
     ["Nobody knows what this number means, clarify it."]),
    (LABEL, None, label_warn,
     ["Warn above {x}.", "Turn it yellow above {x}.", "Highlight when over {x}."],
     ["Give me an amber heads-up once it passes {x}."]),
    (LABEL, None, label_alarm,
     ["Go red above {x}.", "Alarm when above {x}."],
     []),
    (LABEL, None, label_bar,
     ["Add a bar graph.", "Show a bar under the value."],
     ["Visualize it with a little fill bar too."]),
    (LABEL, None, label_greenok,
     ["Show it green when normal and warn above {x}."],
     []),
    (VALVE, VALVES, valve_show,
     ["Show percent open.", "Display valve position.", "Add the open % readout.",
      "Make the valve green when open and show position."],
     ["How far open is it? Show that.", "Open should read as green, and add its position."]),
    (VALVE, VALVES, valve_hide,
     ["Hide the position."],
     []),
    (SENSOR, FLOW, sensor_total,
     ["Show the totalizer.", "Display totalized flow."],
     ["I want the running total of what's gone through."]),
    (SENSOR, FLOW, sensor_warn,
     ["Warn below {x} GPM.", "Low flow warning at {x}.", "Flag flow under {x} in green when ok."],
     ["Heads-up if flow sags under {x}."]),
    (SENSOR, FLOW, sensor_alarm,
     ["Alarm below {x} GPM.", "Red when flow drops under {x}."],
     []),
    (SENSOR, FLOW, sensor_combo,
     ["Show the totalizer and warn below {x} GPM."],
     []),
]

TRAIN_QUOTA = {PUMP: 32, TANK: 18, ALARM: 14, TS: 14, LABEL: 18, VALVE: 10, SENSOR: 14}


def build(family, rng, split, phrasing):
    ctype, pool, builder, _, _ = family
    if ctype == LABEL:
        eq_pool, pt = rng.choice(LABEL_POINTS)
        eq = rng.choice(eq_pool)
        params, patch = builder(rng, eq, pt)
        fields = {**name_fields(eq), "pt": pt}
    else:
        eq = rng.choice(pool)
        if builder in (ts_range, ts_combo):
            params, patch = builder(rng, eq, split)
        else:
            params, patch = builder(rng, eq)
        fields = name_fields(eq) if eq else {"c": "Main", "e": "Main", "n": ""}
        fields["pt"] = ""
    name = rng.choice(NAMES[ctype][split]).format(**fields)
    return {
        "component": {"type": ctype, "name": name},
        "instruction": phrasing.format(**params),
        "rules": rng.choice(RULES[split]),
        "patch": patch,
    }


def to_row(example, idx, split):
    return {"id": f"{split}-{idx:03d}", **example, "target": format_patch(example["patch"])}


def main():
    rng = random.Random(101)
    train, seen = [], set()
    by_type: dict[str, list] = {}
    for fam in FAMILIES:
        by_type.setdefault(fam[0], []).append(fam)
    for ctype, quota in TRAIN_QUOTA.items():
        fams = by_type[ctype]
        made, attempts = 0, 0
        while made < quota and attempts < 5000:
            attempts += 1
            fam = fams[made % len(fams)] if attempts < quota * 3 else rng.choice(fams)
            phrasing = rng.choice(fam[3])
            ex = build(fam, rng, "train", phrasing)
            key = (ex["component"]["name"], ex["instruction"], json.dumps(ex["patch"], sort_keys=True))
            if key in seen:
                continue
            seen.add(key)
            train.append(ex)
            made += 1
    rng.shuffle(train)

    evals = []
    eval_rng = random.Random(202)
    for fam in FAMILIES:
        for phrasing in fam[4]:
            evals.append(build(fam, eval_rng, "eval", phrasing))
    train_instr = {ex["instruction"] for ex in train}
    overlap = [ex["instruction"] for ex in evals if ex["instruction"] in train_instr]
    assert not overlap, f"eval phrasing leaked into train: {overlap}"
    assert len(evals) == 20, len(evals)

    # Every reference patch must pass the checker it will be graded by.
    for ex in train + evals:
        verdict = check_output(ex["component"]["type"], format_patch(ex["patch"]))
        assert verdict["pass"], (ex, verdict)

    with (HERE / "train.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for i, ex in enumerate(train, 1):
            f.write(json.dumps(to_row(ex, i, "train"), ensure_ascii=False) + "\n")
    with (HERE / "eval.jsonl").open("w", encoding="utf-8", newline="\n") as f:
        for i, ex in enumerate(evals, 1):
            f.write(json.dumps(to_row(ex, i, "eval"), ensure_ascii=False) + "\n")
    counts = {}
    for ex in train:
        counts[ex["component"]["type"]] = counts.get(ex["component"]["type"], 0) + 1
    print(f"train={len(train)} eval={len(evals)} by type={counts}")


if __name__ == "__main__":
    main()

// The pump station screen, drawn as real HTML components to ISA-101 on dark.
// Every component is clickable and renders from its entry in the props map.

import type { ReactNode } from 'react'
import { COMPONENTS, TAG } from './view'
import type { Comp } from './view'

export interface Plant {
  t101: number
  t102: number
  flow: number
  pumps: { run: boolean; speed: number; amps: number; fault: boolean }[]
  trend1: number[]
  trend2: number[]
  clock: string
}

export type Props = Record<string, unknown>
export type PropsMap = Record<string, Props>

const PUMP: Props = { runFill: '#D5D7DA', runLabel: 'RUNNING', showSpeed: true, showAmps: false, faultColor: '#FFB020' }
const TANK = (id: string): Props => ({ showLimits: false, hi: 85, lo: 15, showVolume: false, tag: TAG(id, 'LevelPct') })
const LABEL = (units: string): Props => ({ units, warnAbove: null, showBar: false })

export const DEFAULTS: PropsMap = {
  kpi_pumps: LABEL(''),
  kpi_flow: LABEL('GPM'),
  kpi_level: LABEL('%'),
  kpi_level2: LABEL('%'),
  alarms: { minPriority: 'Low', showAckAll: false },
  trend: { rangeMinutes: 60, secondAxis: null },
  process: { note: '' },
  header: { note: '' },
  T101: TANK('T-101'),
  T102: TANK('T-102'),
  P101: { ...PUMP },
  P102: { ...PUMP },
  P103: { ...PUMP },
  V201: { showOpenPct: false },
  V202: { showOpenPct: false },
  FT301: { showTotal: false, warnBelow: null },
}

export const BY_ID = Object.fromEntries(COMPONENTS.map((c) => [c.id, c])) as Record<string, Comp>

const C = {
  line: '#2A2E34',
  equip: '#8A9099',
  run: '#D5D7DA',
  pipe: '#4A5058',
  text: '#ECEAE6',
  mute: '#9AA0A8',
  liquid: '#4E6E82',
  hi: '#FF4B3A',
  warn: '#FFB020',
  accent: '#FF5A1F',
  bg: '#15171A',
}

const isLight = (hex: unknown) => {
  const h = String(hex ?? '').replace('#', '')
  if (h.length < 6) return true
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
  return 0.299 * r + 0.587 * g + 0.114 * b > 140
}

const num = (v: unknown, d: number) => (typeof v === 'number' ? v : d)
const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' ? String(v) : null)
const unitsOf = (p: Props, d: string) => str(p.units) ?? d
const nameOf = (p: Props, id: string) => str(p.label) ?? BY_ID[id].name
const clip = (t: string, n: number) => (t.length > n ? `${t.slice(0, n - 1)}…` : t)
const fmt = (n: number, dp = 0) => n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp })

interface S {
  plant: Plant
  props: PropsMap
  selected: string | null
  flash: string | null
  onSelect: (id: string) => void
}

const P = (s: S, id: string): Props => ({ ...DEFAULTS[id], ...s.props[id] })

function Card({ id, s, className = '', children }: { id: string; s: S; className?: string; children: ReactNode }) {
  const sel = s.selected === id
  return (
    <div
      role="button"
      tabIndex={0}
      className={`comp ${className}${sel ? ' sel' : ''}${s.flash === id ? ' flash' : ''}`}
      onClick={(e) => { e.stopPropagation(); s.onSelect(id) }}
      onKeyDown={(e) => { if (e.key === 'Enter') s.onSelect(id) }}
    >
      {children}
      {sel && <span className="ctab">{BY_ID[id].type}</span>}
    </div>
  )
}

function Kpi({ id, s, label, value, n, pct }: { id: string; s: S; label: string; value: string; n: number; pct: number }) {
  const p = P(s, id)
  const warn = typeof p.warnAbove === 'number' && n > p.warnAbove
  return (
    <Card id={id} s={s} className={`kpi${warn ? ' warn' : ''}`}>
      <div className="lbl kl">{str(p.label) ?? label}</div>
      <div className="big">
        {value}
        {p.units ? <span className="unit">{String(p.units)}</span> : null}
      </div>
      {p.showBar ? <div className="meter"><i style={{ width: `${Math.min(100, pct)}%` }} /></div> : null}
    </Card>
  )
}

const ALARMS = [
  { pri: 'High', rank: 3, tag: 'T-102', msg: 'Level high', t: '15:41:07', color: C.hi },
  { pri: 'Medium', rank: 2, tag: 'P-103', msg: 'Motor fault', t: '15:38:52', color: C.warn },
  { pri: 'Low', rank: 1, tag: 'V-202', msg: 'Travel timeout', t: '15:22:10', color: C.equip },
]
const RANK: Record<string, number> = { High: 3, Medium: 2, Low: 1 }

function Alarms({ s }: { s: S }) {
  const p = P(s, 'alarms')
  const min = RANK[String(p.minPriority)] ?? 1
  const shown = ALARMS.filter((a) => a.rank >= min)
  return (
    <Card id="alarms" s={s} className="card alarms">
      <div className="chead">
        <span>{str(p.label) ?? 'Active alarms'} <b className="count">{shown.length}</b></span>
        {p.showAckAll ? <span className="ack">Ack all</span> : <span className="hint">≥ {String(p.minPriority)}</span>}
      </div>
      <div className="alist">
        {shown.map((a) => (
          <div className="arow" key={a.tag}>
            <i className="stripe" style={{ background: a.color }} />
            <div className="acol">
              <span className="atag">{a.tag}</span>
              <span className="amsg">{a.msg}</span>
            </div>
            <div className="acol r">
              <span className="atime">{a.t}</span>
              <span className="apri"><i className="sq" style={{ background: a.color }} />{a.pri}</span>
            </div>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ---------- process drawing ---------- */

function Hit({ id, s, x, y, w, h, children }: { id: string; s: S; x: number; y: number; w: number; h: number; children: ReactNode }) {
  const sel = s.selected === id
  return (
    <g className={`pg${sel ? ' sel' : ''}${s.flash === id ? ' flash' : ''}`} onClick={(e) => { e.stopPropagation(); s.onSelect(id) }}>
      {children}
      <rect className="hit" x={x} y={y} width={w} height={h} />
    </g>
  )
}

function TankSym({ id, x, s, level }: { id: string; x: number; s: S; level: number }) {
  const p = P(s, id)
  const top = 76, h = 156, w = 96
  const hi = num(p.hi, 85), lo = num(p.lo, 15)
  const alarm = level > hi
  const fill = (h - 6) * (level / 100)
  const yAt = (v: number) => top + h - 3 - (h - 6) * (v / 100)
  return (
    <Hit id={id} s={s} x={x - 34} y={top - 62} w={w + 44} h={h + 70}>
      <text x={x + w / 2} y={top - 40} textAnchor="middle" className="st-name">{clip(nameOf(p, id), 12)}</text>
      <text x={x + w / 2} y={top - 12} textAnchor="middle" className="st-val" fill={alarm ? C.hi : undefined}>{level.toFixed(1)}<tspan className="st-unit"> {clip(unitsOf(p, '%'), 6)}</tspan></text>
      <rect x={x} y={top} width={w} height={h} rx={10} fill="none" stroke={alarm ? C.hi : C.equip} strokeWidth={2} />
      <rect x={x + 3} y={top + h - 3 - fill} width={w - 6} height={fill} rx={7} fill={C.liquid} style={{ transition: 'all 900ms ease' }} />
      {p.showLimits ? [hi, lo].map((m, i) => (
        <g key={i}>
          <line x1={x - 8} x2={x + w} y1={yAt(m)} y2={yAt(m)} stroke={i ? C.equip : C.hi} strokeWidth={2} strokeDasharray="4 4" />
          <text x={x - 10} y={yAt(m) + 6} textAnchor="end" className="st-small">{i ? 'LO' : 'HI'}</text>
        </g>
      )) : null}
    </Hit>
  )
}

function PumpSym({ id, cy, s, i }: { id: string; cy: number; s: S; i: number }) {
  const p = P(s, id)
  const q = s.plant.pumps[i]
  const cx = 440
  const fill = q.run ? String(p.runFill) : 'none'
  const glyph = q.run ? (isLight(p.runFill) ? '#0D0E10' : C.text) : 'none'
  const stroke = q.fault ? String(p.faultColor) : C.equip
  return (
    <Hit id={id} s={s} x={cx - 34} y={cy - 50} w={68} h={82}>
      <text x={cx} y={cy - 30} textAnchor="middle" className="st-name">{clip(nameOf(p, id), 10)}</text>
      <circle cx={cx} cy={cy} r={22} fill={fill} stroke={stroke} strokeWidth={2} />
      <path d={`M ${cx - 8} ${cy - 11} L ${cx + 13} ${cy} L ${cx - 8} ${cy + 11} Z`} fill={glyph} stroke={q.run ? 'none' : stroke} strokeWidth={2} />
    </Hit>
  )
}

function ValveSym({ id, cx, cy, s, open, below = true }: { id: string; cx: number; cy: number; s: S; open: number; below?: boolean }) {
  const on = open > 5
  const p = P(s, id)
  const ly = below ? cy + 36 : cy - 22
  return (
    <Hit id={id} s={s} x={cx - 34} y={below ? cy - 18 : cy - 44} w={68} h={62}>
      <path d={`M ${cx - 15} ${cy - 10} L ${cx + 15} ${cy + 10} L ${cx + 15} ${cy - 10} L ${cx - 15} ${cy + 10} Z`}
        fill={on ? C.run : C.bg} stroke={C.equip} strokeWidth={2} strokeLinejoin="round" />
      <text x={cx} y={ly} textAnchor="middle" className="st-name">{clip(nameOf(p, id), 10)}{p.showOpenPct ? ` ${open}%` : ''}</text>
    </Hit>
  )
}

function Process({ s }: { s: S }) {
  const { plant } = s
  const ft = P(s, 'FT301')
  const ftWarn = typeof ft.warnBelow === 'number' && plant.flow < ft.warnBelow
  const note = String(P(s, 'process').note ?? '')
  return (
    <Card id="process" s={s} className="card process">
      <div className="chead">
        <span>{str(P(s, 'process').label) ?? 'Process · suction → discharge'}</span>
        {note ? <span className="note">{note}</span> : <span className="hint">{plant.clock}</span>}
      </div>
      <svg className="pid" viewBox="0 0 760 300" preserveAspectRatio="xMidYMid meet">
        <g stroke={C.pipe} strokeWidth={5} fill="none" strokeLinejoin="round">
          <path d="M 88 232 V 272 H 380 V 60 H 418" />
          <path d="M 238 232 V 272" />
          <path d="M 380 150 H 418 M 380 240 H 418" />
          <path d="M 462 60 H 520 V 240 H 462 M 462 150 H 520" />
          <path d="M 520 150 H 736" />
        </g>
        <path d="M 724 141 L 740 150 L 724 159" fill="none" stroke={C.pipe} strokeWidth={4} />
        <TankSym id="T101" x={40} s={s} level={plant.t101} />
        <TankSym id="T102" x={190} s={s} level={plant.t102} />
        <ValveSym id="V202" cx={322} cy={272} s={s} open={0} below={false} />
        <PumpSym id="P101" cy={60} s={s} i={0} />
        <PumpSym id="P102" cy={150} s={s} i={1} />
        <PumpSym id="P103" cy={240} s={s} i={2} />
        <ValveSym id="V201" cx={590} cy={150} s={s} open={100} />
        <Hit id="FT301" s={s} x={626} y={124} w={108} h={104}>
          <circle cx={680} cy={150} r={18} fill={C.bg} stroke={ftWarn ? C.warn : C.equip} strokeWidth={2} />
          <text x={680} y={156} textAnchor="middle" className="st-small">FT</text>
          <text x={680} y={194} textAnchor="middle" className="st-name">{clip(nameOf(ft, 'FT301'), 10)}</text>
          <text x={680} y={218} textAnchor="middle" className="st-small" fill={ftWarn ? C.warn : undefined}>{fmt(plant.flow)} {clip(unitsOf(ft, 'GPM'), 6)}</text>
        </Hit>
      </svg>
    </Card>
  )
}

/* ---------- equipment strip ---------- */

function PumpGlyph({ run, fill, stroke }: { run: boolean; fill: string; stroke: string }) {
  const glyph = run ? (isLight(fill) ? '#0D0E10' : C.text) : 'none'
  return (
    <svg width="18" height="18" viewBox="0 0 22 22" aria-hidden style={{ flex: "none" }}>
      <circle cx="11" cy="11" r="9.5" fill={run ? fill : 'none'} stroke={stroke} strokeWidth="1.5" />
      <path d="M 7.5 6.5 L 16 11 L 7.5 15.5 Z" fill={glyph} stroke={run ? 'none' : stroke} strokeWidth="1.5" />
    </svg>
  )
}

function PumpCard({ id, i, s }: { id: string; i: number; s: S }) {
  const p = P(s, id)
  const q = s.plant.pumps[i]
  const fill = String(p.runFill)
  const fault = String(p.faultColor)
  const state = q.fault ? 'FAULT' : q.run ? String(p.runLabel) : 'STOPPED'
  const chip = q.fault
    ? { color: fault, borderColor: fault }
    : q.run
      ? { color: C.text, borderColor: fill }
      : {}
  return (
    <Card id={id} s={s} className="eq">
      <div className="eq-top">
        <PumpGlyph run={q.run} fill={fill} stroke={q.fault ? fault : C.equip} />
        <span className="eq-name">{nameOf(p, id)}</span>
        <span className="state" style={chip}>{state}</span>
      </div>
      <div className="eq-vals">
        {p.showSpeed ? <span className="n">{q.speed.toFixed(0)}<u>{unitsOf(p, '%')}</u></span> : null}
        {p.showAmps ? <span className="n">{q.amps.toFixed(0)}<u>A</u></span> : null}
        {!p.showSpeed && !p.showAmps ? <span className="n dim">{q.run ? 'ON' : 'OFF'}</span> : null}
      </div>
    </Card>
  )
}

function TankCard({ id, s, level }: { id: string; s: S; level: number }) {
  const p = P(s, id)
  const hi = num(p.hi, 85), lo = num(p.lo, 15)
  const alarm = level > hi
  return (
    <Card id={id} s={s} className={`eq${alarm ? ' lvlhi' : ''}`}>
      <div className="eq-top">
        <span className="eq-name">{nameOf(p, id)}</span>
        <span className={`state${alarm ? ' hi' : ''}`}>{alarm ? 'LEVEL HI' : 'NORMAL'}</span>
      </div>
      <div className="eq-vals">
        <span className="n">{level.toFixed(1)}<u>{unitsOf(p, '%')}</u></span>
        {p.showVolume ? <span className="n sm">{fmt(level * 200)}<u>gal</u></span> : null}
      </div>
      <div className="gauge">
        <i style={{ width: `${level}%`, background: alarm ? C.hi : C.liquid }} />
        {p.showLimits ? <><b style={{ left: `${hi}%` }} /><b style={{ left: `${lo}%` }} /></> : null}
      </div>
    </Card>
  )
}

function ValveCard({ id, s, open }: { id: string; s: S; open: number }) {
  const p = P(s, id)
  return (
    <Card id={id} s={s} className="eq">
      <div className="eq-top">
        <span className="eq-name">{nameOf(p, id)}</span>
        <span className="state">{open > 5 ? 'OPEN' : 'CLOSED'}</span>
      </div>
      <div className="eq-vals">
        {p.showOpenPct ? <span className="n">{open}<u>% open</u></span> : <span className="n dim">{open > 5 ? 'OPEN' : 'SHUT'}</span>}
      </div>
    </Card>
  )
}

function FlowCard({ s }: { s: S }) {
  const p = P(s, 'FT301')
  const warn = typeof p.warnBelow === 'number' && s.plant.flow < p.warnBelow
  return (
    <Card id="FT301" s={s} className={`eq${warn ? ' warn' : ''}`}>
      <div className="eq-top">
        <span className="eq-name">{nameOf(p, 'FT301')}</span>
        <span className="state">{warn ? 'LOW FLOW' : 'FLOW'}</span>
      </div>
      <div className="eq-vals">
        <span className="n">{fmt(s.plant.flow)}<u>{unitsOf(p, 'GPM')}</u></span>
        {p.showTotal ? <span className="n sm">1.24<u>M gal today</u></span> : null}
      </div>
    </Card>
  )
}

/* ---------- trend ---------- */

function Trend({ s }: { s: S }) {
  const p = P(s, 'trend')
  const mins = num(p.rangeMinutes, 60)
  const range = mins >= 60 && mins % 60 === 0 ? `${mins / 60} H` : `${mins} MIN`
  const second = p.secondAxis ? String(p.secondAxis) : null
  const { trend1, trend2 } = s.plant
  const path = (vals: number[], max = 100) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${((i / (vals.length - 1)) * 100).toFixed(2)} ${(100 - (v / max) * 100).toFixed(2)}`).join(' ')
  const amps = trend1.map((v) => 34 + (v - 55) * 0.6)
  return (
    <Card id="trend" s={s} className="card trend">
      <div className="chead">
        <span>{str(p.label) ?? 'Levels'} · last {range}</span>
        <span className="legend">
          <span><i className="lg l1" />T-101</span>
          <span><i className="lg l2" />T-102</span>
          {second ? <span><i className="lg la" />{second.split('/').slice(-2).join(' ')}</span> : null}
        </span>
      </div>
      <div className={`plot${second ? ' two' : ''}`}>
        <div className="yax"><span style={{ top: '15%' }} className="hl">HI 85</span><span style={{ top: '50%' }}>50</span><span style={{ top: '100%' }}>0</span></div>
        <div className="area">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {[0, 50, 100].map((y) => <line key={y} x1={0} x2={100} y1={y} y2={y} stroke={C.line} vectorEffect="non-scaling-stroke" />)}
            <line x1={0} x2={100} y1={15} y2={15} stroke={C.hi} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <path d={path(trend1)} fill="none" stroke={C.run} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <path d={path(trend2)} fill="none" stroke={C.mute} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            {second ? <path d={path(amps, 60)} fill="none" stroke={C.equip} strokeWidth={1.5} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
        </div>
        {second ? <div className="yax r"><span style={{ top: '0%' }}>60 A</span><span style={{ top: '50%' }}>30 A</span><span style={{ top: '100%' }}>0 A</span></div> : null}
      </div>
    </Card>
  )
}

export default function Screen(s: S) {
  const { plant } = s
  const running = plant.pumps.filter((p) => p.run).length
  return (
    <main className="screen" onClick={() => s.onSelect('')}>
      <div className="kpis">
        <Kpi id="kpi_pumps" s={s} label="Pumps running" value={`${running} / 3`} n={running} pct={(running / 3) * 100} />
        <Kpi id="kpi_flow" s={s} label="Discharge flow" value={fmt(plant.flow)} n={plant.flow} pct={plant.flow / 20} />
        <Kpi id="kpi_level" s={s} label="T-101 level" value={plant.t101.toFixed(1)} n={plant.t101} pct={plant.t101} />
        <Kpi id="kpi_level2" s={s} label="T-102 level" value={plant.t102.toFixed(1)} n={plant.t102} pct={plant.t102} />
      </div>
      <Process s={s} />
      <div className="equip">
        <PumpCard id="P101" i={0} s={s} />
        <PumpCard id="P102" i={1} s={s} />
        <PumpCard id="P103" i={2} s={s} />
        <FlowCard s={s} />
        <TankCard id="T101" s={s} level={plant.t101} />
        <TankCard id="T102" s={s} level={plant.t102} />
        <ValveCard id="V201" s={s} open={100} />
        <ValveCard id="V202" s={s} open={0} />
      </div>
      <Alarms s={s} />
      <Trend s={s} />
    </main>
  )
}

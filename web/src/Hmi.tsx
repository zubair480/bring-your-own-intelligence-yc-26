// The pump station screen as a bento of glass cards. Equipment stays neutral
// white/gray per ISA-101; lime is only for charts and selection.
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
  line: 'rgba(255,255,255,0.08)',
  equip: '#8E8E93',
  run: '#E5E5EA',
  pipe: '#3A3A3F',
  text: '#FFFFFF',
  mute: '#8E8E93',
  liquid: '#5B6B78',
  hi: '#FF5A4F',
  warn: '#FFB020',
  lime: '#B9F26C',
  bg: '#141416',
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

/* ---------- icons (inline line SVG) ---------- */

const PATHS: Record<string, string> = {
  pump: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18Zm-3 5 7 4-7 4Z',
  flow: 'M3 8h13l-3-3M21 16H8l3 3',
  tank: 'M5 5c0-1.1 3.1-2 7-2s7 .9 7 2v14c0 1.1-3.1 2-7 2s-7-.9-7-2ZM5 12c0 1.1 3.1 2 7 2s7-.9 7-2',
  gauge: 'M4 16a8 8 0 1 1 16 0M12 16l4-5',
  process: 'M4 6h5v5H4ZM15 13h5v5h-5ZM9 8.5h4v7h2',
  alarm: 'M6 17V11a6 6 0 1 1 12 0v6M4 17h16M10 20h4',
  trend: 'M4 18l5-6 4 3 7-9M4 21h16',
  activity: 'M3 12h4l3-7 4 14 3-7h4',
  brain: 'M9 4a3 3 0 0 0-3 3 3 3 0 0 0-2 5 3 3 0 0 0 3 5 3 3 0 0 0 5 1V5a3 3 0 0 0-3-1ZM15 4a3 3 0 0 1 3 3 3 3 0 0 1 2 5 3 3 0 0 1-3 5 3 3 0 0 1-5 1',
  qm: 'M9 11l2 2 4-4M5 4h14v16H5Z',
  settings: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M5 19l2-2M17 7l2-2',
  overview: 'M4 4h7v7H4ZM13 4h7v4h-7ZM13 10h7v10h-7ZM4 13h7v7H4Z',
  model: 'M12 3l8 4.5v9L12 21l-8-4.5v-9ZM12 12l8-4.5M12 12v9M12 12 4 7.5',
}

export function Ico({ n, size = 16 }: { n: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={PATHS[n] ?? PATHS.overview} />
    </svg>
  )
}

export function Head({ icon, title, meta }: { icon: string; title: ReactNode; meta?: ReactNode }) {
  return (
    <div className="ch">
      <span className="tile"><Ico n={icon} /></span>
      <span className="ct">{title}</span>
      {meta != null ? <span className="cm">{meta}</span> : null}
    </div>
  )
}

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
    </div>
  )
}

function Pills({ pct, n = 10 }: { pct: number; n?: number }) {
  const lit = Math.round((Math.max(0, Math.min(100, pct)) / 100) * n)
  return <div className="pills">{Array.from({ length: n }, (_, i) => <i key={i} className={i < lit ? 'on' : ''} />)}</div>
}

function Bar({ pct, color }: { pct: number; color?: string }) {
  return <div className="bar"><i style={{ width: `${Math.max(0, Math.min(100, pct))}%`, background: color }} /></div>
}

function Kpi({ id, s, icon, label, value, n, pct, meta }: { id: string; s: S; icon: string; label: string; value: string; n: number; pct: number; meta?: string }) {
  const p = P(s, id)
  const warn = typeof p.warnAbove === 'number' && n > p.warnAbove
  return (
    <Card id={id} s={s} className={`card kpi${warn ? ' warn' : ''}`}>
      <Head icon={icon} title={str(p.label) ?? label} meta={meta} />
      <div className="big">
        {value}
        {p.units ? <span className="unit">{String(p.units)}</span> : null}
      </div>
      {p.showBar ? <div className="barrow"><Bar pct={pct} /><span>{pct.toFixed(0)}%</span></div> : <Pills pct={pct} />}
    </Card>
  )
}

function LevelRow({ id, s, label, level }: { id: string; s: S; label: string; level: number }) {
  const p = P(s, id)
  const warn = typeof p.warnAbove === 'number' && level > p.warnAbove
  return (
    <Card id={id} s={s} className={`lrow${warn ? ' warn' : ''}`}>
      <div className="lr-t">
        <span className="lr-n">{str(p.label) ?? label}</span>
        <span className="lr-v">{level.toFixed(1)}<u>{unitsOf(p, '%')}</u></span>
      </div>
      {p.showBar ? <Pills pct={level} /> : <Bar pct={level} />}
    </Card>
  )
}

function Ring({ s }: { s: S }) {
  const id = 'T102'
  const p = P(s, id)
  const level = s.plant.t102
  const hi = num(p.hi, 85), lo = num(p.lo, 15)
  const alarm = level > hi
  const r = 42, c = 2 * Math.PI * r
  const at = (v: number) => {
    const a = (v / 100) * 2 * Math.PI - Math.PI / 2
    return [50 + Math.cos(a) * (r - 8), 50 + Math.sin(a) * (r - 8), 50 + Math.cos(a) * (r + 8), 50 + Math.sin(a) * (r + 8)]
  }
  return (
    <Card id={id} s={s} className={`card ring${alarm ? ' alarm' : ''}`}>
      <Head icon="gauge" title={nameOf(p, id)} />
      <div className={alarm ? 'ring-f hi' : 'ring-f'}>{alarm ? `Level high · HI ${hi}` : 'Normal'}</div>
      <div className="ring-w">
        <svg viewBox="0 0 100 100">
          <circle cx={50} cy={50} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={8} />
          <circle cx={50} cy={50} r={r} fill="none" stroke={C.lime} strokeWidth={8} strokeLinecap="round"
            strokeDasharray={`${(c * level) / 100} ${c}`} transform="rotate(-90 50 50)" style={{ transition: 'stroke-dasharray 900ms ease' }} />
          {p.showLimits ? [hi, lo].map((m, i) => { const [x1, y1, x2, y2] = at(m); return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={i ? C.equip : C.hi} strokeWidth={2} /> }) : null}
          <text x={50} y={p.showVolume ? 51 : 59} textAnchor="middle" className={`ring-v${alarm ? ' hi' : ''}`}>{level.toFixed(0)}{clip(unitsOf(p, '%'), 3)}</text>
          {p.showVolume ? <text x={50} y={66} textAnchor="middle" className="ring-s">{fmt(level * 200)} gal</text> : null}
        </svg>
      </div>
    </Card>
  )
}

function PumpGlyph({ run, fill, stroke }: { run: boolean; fill: string; stroke: string }) {
  const glyph = run ? (isLight(fill) ? '#0D0E10' : C.text) : 'none'
  return (
    <svg width="20" height="20" viewBox="0 0 22 22" aria-hidden style={{ flex: 'none' }}>
      <circle cx="11" cy="11" r="9.5" fill={run ? fill : 'none'} stroke={stroke} strokeWidth="1.5" />
      <path d="M 7.5 6.5 L 16 11 L 7.5 15.5 Z" fill={glyph} stroke={run ? 'none' : stroke} strokeWidth="1.5" />
    </svg>
  )
}

function PumpRow({ id, i, s }: { id: string; i: number; s: S }) {
  const p = P(s, id)
  const q = s.plant.pumps[i]
  const fill = String(p.runFill)
  const fault = String(p.faultColor)
  const state = q.fault ? 'FAULT' : q.run ? String(p.runLabel) : 'STOPPED'
  const chip = q.fault ? { color: fault, borderColor: fault } : q.run ? { color: C.text, borderColor: fill } : {}
  return (
    <Card id={id} s={s} className="prow">
      <PumpGlyph run={q.run} fill={fill} stroke={q.fault ? fault : C.equip} />
      <span className="pr-n">{clip(nameOf(p, id), 12)}</span>
      <span className="state" style={chip}>{clip(state, 10)}</span>
      {p.showSpeed ? <><Bar pct={q.speed} color={fill} /><span className="pr-v">{q.speed.toFixed(0)}{clip(unitsOf(p, '%'), 4)}</span></> : <span className="pr-sp" />}
      {p.showAmps ? <span className="pr-v">{q.amps.toFixed(0)} A</span> : null}
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
      <Head icon="alarm" title={<>{str(p.label) ?? <><span className="al-x">Active </span>Alarms</>} <b className="count">{shown.length}</b></>}
        meta={p.showAckAll ? <span className="ack">Ack all</span> : `≥ ${String(p.minPriority)}`} />
      <div className="alist">
        {shown.map((a) => (
          <div className="arow" key={a.tag}>
            <i className="stripe" style={{ background: a.color }} />
            <span className="atag">{a.tag}</span>
            <span className="amsg">{a.msg}</span>
            <span className="apri" style={{ color: a.color === C.equip ? C.mute : a.color }}>{a.pri}</span>
            <span className="atime">{a.t}</span>
          </div>
        ))}
        {shown.length === 0 ? <div className="dim">No active alarms</div> : null}
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
      <rect className="hit" x={x} y={y} width={w} height={h} rx={12} />
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
      <rect x={x} y={top} width={w} height={h} rx={14} fill="none" stroke={alarm ? C.hi : C.equip} strokeWidth={2} />
      <rect x={x + 3} y={top + h - 3 - fill} width={w - 6} height={fill} rx={11} fill={C.liquid} style={{ transition: 'all 900ms ease' }} />
      {p.showVolume ? <text x={x + w / 2} y={top + h - 12} textAnchor="middle" className="st-small">{fmt(level * 200)} gal</text> : null}
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
      <Head icon="process" title={str(P(s, 'process').label) ?? 'Process · suction → discharge'} meta={note ? clip(note, 40) : plant.clock} />
      <svg className="pid" viewBox="0 0 760 300" preserveAspectRatio="xMidYMid meet">
        <g stroke={C.pipe} strokeWidth={5} fill="none" strokeLinejoin="round" strokeLinecap="round">
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
          {ft.showTotal ? <text x={680} y={240} textAnchor="middle" className="st-small">1.24M gal today</text> : null}
        </Hit>
      </svg>
    </Card>
  )
}

/* ---------- trend ---------- */

function Trend({ s }: { s: S }) {
  const p = P(s, 'trend')
  const mins = num(p.rangeMinutes, 60)
  const range = mins >= 60 && mins % 60 === 0 ? `${mins / 60} h` : `${mins} min`
  const second = p.secondAxis ? String(p.secondAxis) : null
  const { trend1, trend2 } = s.plant
  const path = (vals: number[], max = 100) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${((i / (vals.length - 1)) * 100).toFixed(2)} ${(100 - (v / max) * 100).toFixed(2)}`).join(' ')
  const amps = trend1.map((v) => 34 + (v - 55) * 0.6)
  return (
    <Card id="trend" s={s} className="card trend">
      <Head icon="trend" title={<>{str(p.label) ?? 'Levels'} · <span className="tr-x">last </span>{range}</>} />
      <div className="legend">
        <span><i className="lg l1" />T-101</span>
        <span><i className="lg l2" />T-102</span>
        {second ? <span><i className="lg la" />{clip(second.split('/').slice(-2).join(' '), 14)}</span> : null}
      </div>
      <div className={`plot${second ? ' two' : ''}`}>
        <div className="yax"><span style={{ top: '15%' }} className="hl">HI 85</span><span style={{ top: '50%' }}>50</span><span style={{ top: '100%' }}>0</span></div>
        <div className="area">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none">
            {[0, 50, 100].map((y) => <line key={y} x1={0} x2={100} y1={y} y2={y} stroke={C.line} vectorEffect="non-scaling-stroke" />)}
            <line x1={0} x2={100} y1={15} y2={15} stroke={C.hi} strokeDasharray="5 5" vectorEffect="non-scaling-stroke" />
            <path d={path(trend1)} fill="none" stroke={C.lime} strokeWidth={2} vectorEffect="non-scaling-stroke" />
            <path d={path(trend2)} fill="none" stroke={C.run} strokeWidth={2} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
            {second ? <path d={path(amps, 60)} fill="none" stroke={C.equip} strokeWidth={1.5} strokeDasharray="2 3" vectorEffect="non-scaling-stroke" /> : null}
          </svg>
        </div>
        {second ? <div className="yax r"><span style={{ top: '0%' }}>60 A</span><span style={{ top: '50%' }}>30 A</span><span style={{ top: '100%' }}>0 A</span></div> : null}
      </div>
    </Card>
  )
}

export default function Screen(s: S & { feed: ReactNode }) {
  const { plant } = s
  const running = plant.pumps.filter((p) => p.run).length
  const flowPct = (plant.flow / 2000) * 100
  return (
    <main className="bento" onClick={() => s.onSelect('')}>
      <div className="b-kp"><Kpi id="kpi_pumps" s={s} icon="pump" label="Pumps" value={`${running} / 3`} n={running} pct={(running / 3) * 100} /></div>
      <div className="b-kf"><Kpi id="kpi_flow" s={s} icon="flow" label="Discharge flow" value={fmt(plant.flow)} n={plant.flow} pct={flowPct} meta="Live" /></div>
      <div className="b-kl card" onClick={(e) => e.stopPropagation()}>
        <Head icon="tank" title="Tank levels" meta="HI 85" />
        <LevelRow id="kpi_level" s={s} label="T-101" level={plant.t101} />
        <LevelRow id="kpi_level2" s={s} label="T-102" level={plant.t102} />
      </div>
      <div className="b-ring"><Ring s={s} /></div>
      <div className="b-pumps card" onClick={(e) => e.stopPropagation()}>
        <Head icon="pump" title="Pumps" meta={`${running} of 3 running`} />
        <div className="prows">
          <PumpRow id="P101" i={0} s={s} />
          <PumpRow id="P102" i={1} s={s} />
          <PumpRow id="P103" i={2} s={s} />
        </div>
      </div>
      <div className="b-proc"><Process s={s} /></div>
      <div className="b-al"><Alarms s={s} /></div>
      <div className="b-tr"><Trend s={s} /></div>
      <div className="b-feed">{s.feed}</div>
    </main>
  )
}

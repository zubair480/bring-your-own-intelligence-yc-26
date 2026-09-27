// Stand-in for the live Perspective session: the same screen, drawn to ISA-101.
// Swapped for an <iframe> of the real gateway once Ignition is up.

export interface Plant {
  t101: number
  t102: number
  flow: number
  pumps: { run: boolean; speed: number; amps: number; fault: boolean }[]
  trend1: number[]
  trend2: number[]
  clock: string
}

const C = {
  bg: '#D7D7D2',
  panel: '#CDCDC7',
  rule: '#B3B3AC',
  equip: '#8E8E88',
  run: '#4A4A48',
  pipe: '#77776F',
  text: '#1D1D1B',
  mute: '#5F5F59',
  liquid: '#93A5B1',
  hi: '#E0301E',
  warn: '#F5A623',
}

const COND = { fontFamily: 'Archivo, sans-serif', fontStretch: '75%' } as const
const MONO = { fontFamily: '"JetBrains Mono", monospace' } as const

function Tank({ x, id, level, alarm }: { x: number; id: string; level: number; alarm?: boolean }) {
  const top = 130, h = 260, w = 120
  const fill = (h - 8) * (level / 100)
  return (
    <g>
      <text x={x + w / 2} y={118} textAnchor="middle" fontSize={15} fontWeight={700} fill={C.text} style={COND}>{id}</text>
      <rect x={x} y={top} width={w} height={h} rx={14} fill="#C6C6C0" stroke={C.run} strokeWidth={2} />
      <rect x={x + 4} y={top + h - 4 - fill} width={w - 8} height={fill} rx={10} fill={C.liquid}
        style={{ transition: 'y 900ms ease, height 900ms ease' }} />
      {[85, 15].map((m) => (
        <g key={m}>
          <line x1={x - 8} x2={x} y1={top + h - 4 - (h - 8) * m / 100} y2={top + h - 4 - (h - 8) * m / 100} stroke={C.run} strokeWidth={2} />
          <text x={x - 12} y={top + h - (h - 8) * m / 100} textAnchor="end" fontSize={10} fill={C.mute} style={MONO}>{m === 85 ? 'HI' : 'LO'}</text>
        </g>
      ))}
      <text x={x + w / 2} y={top + 34} textAnchor="middle" fontSize={20} fontWeight={600} fill={C.text} style={MONO}>{level.toFixed(1)}</text>
      <text x={x + w / 2} y={top + 50} textAnchor="middle" fontSize={10} fill={C.mute} style={MONO}>% LEVEL</text>
      {alarm && (
        <g>
          <rect x={x + w + 6} y={top + 6} width={20} height={20} fill={C.hi} />
          <text x={x + w + 16} y={top + 21} textAnchor="middle" fontSize={13} fontWeight={700} fill="#fff" style={MONO}>1</text>
        </g>
      )}
    </g>
  )
}

function Pump({ cy, id, p }: { cy: number; id: string; p: Plant['pumps'][number] }) {
  const cx = 880
  return (
    <g>
      <circle cx={cx} cy={cy} r={28} fill={p.run ? C.run : C.bg} stroke={C.run} strokeWidth={2} />
      <path d={`M ${cx - 10} ${cy - 14} L ${cx + 16} ${cy} L ${cx - 10} ${cy + 14} Z`} fill={p.run ? C.bg : 'none'} stroke={p.run ? 'none' : C.run} strokeWidth={2} />
      <text x={cx} y={cy + 46} textAnchor="middle" fontSize={13} fontWeight={700} fill={C.text} style={COND}>{id}</text>
      <text x={cx} y={cy + 60} textAnchor="middle" fontSize={10} fill={C.mute} style={MONO}>
        {p.fault ? 'FAULT' : p.run ? `RUN ${p.speed.toFixed(0)}%` : 'STOPPED'}
      </text>
      {p.fault && (
        <g>
          <path d={`M ${cx + 36} ${cy - 30} l 11 11 l -11 11 l -11 -11 Z`} fill={C.warn} />
          <text x={cx + 36} y={cy - 15} textAnchor="middle" fontSize={11} fontWeight={700} fill={C.text} style={MONO}>2</text>
        </g>
      )}
    </g>
  )
}

function Valve({ cx, cy, id, open }: { cx: number; cy: number; id: string; open: number }) {
  const on = open > 5
  return (
    <g>
      <path d={`M ${cx - 16} ${cy - 11} L ${cx + 16} ${cy + 11} L ${cx + 16} ${cy - 11} L ${cx - 16} ${cy + 11} Z`}
        fill={on ? C.run : C.bg} stroke={C.run} strokeWidth={2} strokeLinejoin="round" />
      <text x={cx} y={cy + 30} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.text} style={COND}>{id}</text>
      <text x={cx} y={cy + 43} textAnchor="middle" fontSize={10} fill={C.mute} style={MONO}>{open}%</text>
    </g>
  )
}

export default function Hmi({ plant }: { plant: Plant }) {
  const running = plant.pumps.filter((p) => p.run).length
  const plot = { x0: 64, x1: 1240, y0: 596, y1: 690 }
  const line = (vals: number[]) =>
    vals.map((v, i) => `${i ? 'L' : 'M'} ${(plot.x0 + (i * (plot.x1 - plot.x0)) / (vals.length - 1)).toFixed(1)} ${(plot.y1 - (v / 100) * (plot.y1 - plot.y0)).toFixed(1)}`).join(' ')

  return (
    <svg viewBox="0 0 1280 720" width="1280" height="720" style={{ display: 'block' }} aria-label="Pump Station 01 overview">
      <rect width={1280} height={720} fill={C.bg} />

      {/* Header */}
      <rect width={1280} height={64} fill={C.panel} />
      <line x1={0} x2={1280} y1={64} y2={64} stroke={C.rule} />
      <text x={24} y={30} fontSize={22} fontWeight={700} fill={C.text} style={COND}>PUMP STATION 01</text>
      <text x={24} y={49} fontSize={11} fill={C.mute} style={MONO}>OVERVIEW · {plant.clock}</text>
      {[
        { x: 560, label: 'PUMPS RUNNING', value: `${running} / 3` },
        { x: 780, label: 'DISCHARGE FLOW', value: `${plant.flow.toLocaleString('en-US', { maximumFractionDigits: 0 })} GPM` },
        { x: 1020, label: 'T-101 LEVEL', value: `${plant.t101.toFixed(1)} %` },
      ].map((k) => (
        <g key={k.label}>
          <line x1={k.x - 12} x2={k.x - 12} y1={14} y2={50} stroke={C.rule} />
          <text x={k.x} y={27} fontSize={10} fontWeight={600} fill={C.mute} letterSpacing={0.8} style={COND}>{k.label}</text>
          <text x={k.x} y={50} fontSize={20} fontWeight={600} fill={C.text} style={MONO}>{k.value}</text>
        </g>
      ))}

      {/* Alarms */}
      <rect x={16} y={80} width={300} height={460} fill={C.panel} stroke={C.rule} />
      <text x={32} y={106} fontSize={13} fontWeight={700} fill={C.text} letterSpacing={0.6} style={COND}>ACTIVE ALARMS</text>
      <text x={300} y={106} textAnchor="end" fontSize={12} fontWeight={600} fill={C.text} style={MONO}>3</text>
      <line x1={32} x2={300} y1={118} y2={118} stroke={C.rule} />
      {[
        { c: C.hi, p: '1', tag: 'T-102', msg: 'LEVEL HIGH', t: '15:41:07' },
        { c: C.warn, p: '2', tag: 'P-103', msg: 'MOTOR FAULT', t: '15:38:52' },
        { c: C.equip, p: '3', tag: 'V-202', msg: 'TRAVEL TIMEOUT', t: '15:22:10' },
      ].map((a, i) => (
        <g key={a.tag} transform={`translate(32 ${130 + i * 62})`}>
          <rect width={268} height={52} fill={C.bg} />
          <rect width={4} height={52} fill={a.c} />
          <text x={16} y={21} fontSize={13} fontWeight={700} fill={C.text} style={MONO}>{a.tag}</text>
          <text x={16} y={40} fontSize={12} fill={C.text} style={COND}>{a.msg}</text>
          <text x={256} y={21} textAnchor="end" fontSize={10} fill={C.mute} style={MONO}>{a.t}</text>
          <text x={256} y={40} textAnchor="end" fontSize={10} fill={C.mute} style={MONO}>P{a.p} · UNACK</text>
        </g>
      ))}

      {/* Process */}
      <rect x={332} y={80} width={932} height={460} fill={C.bg} stroke={C.rule} />
      <text x={348} y={102} fontSize={11} fontWeight={600} fill={C.mute} letterSpacing={0.8} style={COND}>PROCESS · SUCTION → DISCHARGE</text>

      <g stroke={C.pipe} strokeWidth={5} fill="none" strokeLinejoin="round">
        <path d="M 460 390 V 452 H 800 V 160 H 852" />
        <path d="M 700 390 V 452" />
        <path d="M 800 270 H 852 M 800 380 H 852" />
        <path d="M 908 160 H 990 V 380 H 908 M 908 270 H 990" />
        <path d="M 990 270 H 1250" />
      </g>
      <path d="M 1236 262 L 1252 270 L 1236 278" fill="none" stroke={C.pipe} strokeWidth={3} />
      <text x={1246} y={300} textAnchor="end" fontSize={10} fill={C.mute} style={MONO}>TO DIST.</text>

      <Tank x={400} id="T-101" level={plant.t101} />
      <Tank x={640} id="T-102" level={plant.t102} alarm />
      <Valve cx={580} cy={452} id="V-202" open={0} />
      <Pump cy={160} id="P-101" p={plant.pumps[0]} />
      <Pump cy={270} id="P-102" p={plant.pumps[1]} />
      <Pump cy={380} id="P-103" p={plant.pumps[2]} />
      <Valve cx={1084} cy={270} id="V-201" open={100} />

      <circle cx={1180} cy={270} r={20} fill={C.bg} stroke={C.run} strokeWidth={2} />
      <text x={1180} y={275} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.text} style={COND}>FT</text>
      <text x={1180} y={312} textAnchor="middle" fontSize={12} fontWeight={700} fill={C.text} style={COND}>FT-301</text>
      <text x={1180} y={326} textAnchor="middle" fontSize={10} fill={C.mute} style={MONO}>{plant.flow.toFixed(0)} GPM</text>

      {/* Trend */}
      <rect x={16} y={556} width={1248} height={148} fill={C.panel} stroke={C.rule} />
      <text x={32} y={580} fontSize={12} fontWeight={700} fill={C.text} letterSpacing={0.6} style={COND}>TANK LEVELS · LAST 60 MIN</text>
      {[0, 50, 100].map((v) => {
        const y = plot.y1 - (v / 100) * (plot.y1 - plot.y0)
        return (
          <g key={v}>
            <line x1={plot.x0} x2={plot.x1} y1={y} y2={y} stroke={C.rule} />
            <text x={plot.x0 - 8} y={y + 4} textAnchor="end" fontSize={10} fill={C.mute} style={MONO}>{v}</text>
          </g>
        )
      })}
      <line x1={plot.x0} x2={plot.x1} y1={plot.y1 - 0.85 * (plot.y1 - plot.y0)} y2={plot.y1 - 0.85 * (plot.y1 - plot.y0)} stroke={C.hi} strokeDasharray="3 4" />
      <path d={line(plant.trend1)} fill="none" stroke={C.run} strokeWidth={2} />
      <path d={line(plant.trend2)} fill="none" stroke={C.run} strokeWidth={2} strokeDasharray="6 4" />
      <g style={MONO} fontSize={10} fill={C.mute}>
        <line x1={1010} x2={1034} y1={576} y2={576} stroke={C.run} strokeWidth={2} />
        <text x={1040} y={580}>T-101</text>
        <line x1={1090} x2={1114} y1={576} y2={576} stroke={C.run} strokeWidth={2} strokeDasharray="6 4" />
        <text x={1120} y={580}>T-102</text>
        <line x1={1170} x2={1194} y1={576} y2={576} stroke={C.hi} strokeDasharray="3 4" />
        <text x={1200} y={580}>HI 85</text>
      </g>
    </svg>
  )
}

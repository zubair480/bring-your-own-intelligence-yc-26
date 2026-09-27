import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Hmi from './Hmi'
import type { Plant } from './Hmi'
import { COMPONENTS, VIEW } from './view'
import type { Comp } from './view'

interface Pin {
  n: number
  comp: Comp
  x: number
  y: number
  text: string
  status: 'draft' | 'queued'
}

const seed = (base: number, spread: number) =>
  Array.from({ length: 60 }, (_, i) => base + Math.sin(i / 7) * spread + Math.sin(i / 2.3) * spread * 0.25)

const clock = () => new Date().toLocaleTimeString('en-US', { hour12: false })

function usePlant(): Plant {
  const [plant, setPlant] = useState<Plant>(() => ({
    t101: 62.4,
    t102: 90.8,
    flow: 1284,
    pumps: [
      { run: true, speed: 74, amps: 41, fault: false },
      { run: true, speed: 68, amps: 38, fault: false },
      { run: false, speed: 0, amps: 0, fault: true },
    ],
    trend1: seed(60, 4),
    trend2: seed(88, 2.5),
    clock: clock(),
  }))
  useEffect(() => {
    const id = setInterval(() => {
      setPlant((p) => {
        const t101 = Math.min(80, Math.max(45, p.t101 + (Math.random() - 0.5) * 0.9))
        const t102 = Math.min(93, Math.max(88, p.t102 + (Math.random() - 0.5) * 0.5))
        return {
          ...p,
          t101,
          t102,
          flow: Math.round(1284 + (Math.random() - 0.5) * 30),
          pumps: p.pumps.map((q) => (q.run ? { ...q, speed: Math.max(55, Math.min(90, q.speed + (Math.random() - 0.5) * 2)) } : q)),
          trend1: [...p.trend1.slice(1), t101],
          trend2: [...p.trend2.slice(1), t102],
          clock: clock(),
        }
      })
    }, 1500)
    return () => clearInterval(id)
  }, [])
  return plant
}

export default function App() {
  const plant = usePlant()
  const canvasRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(0.8)
  const [hover, setHover] = useState<Comp | null>(null)
  const [cursor, setCursor] = useState<[number, number] | null>(null)
  const [pins, setPins] = useState<Pin[]>([])
  const draft = pins.find((p) => p.status === 'draft')

  useLayoutEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const fit = () => {
      const { width, height } = el.getBoundingClientRect()
      setScale(Math.min((width - 96) / VIEW.width, (height - 120) / VIEW.height, 1))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPins((ps) => ps.filter((p) => p.status !== 'draft'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const local = (e: React.MouseEvent) => {
    const r = (e.currentTarget.closest('.sheet') as HTMLElement).getBoundingClientRect()
    return [Math.round((e.clientX - r.left) / scale), Math.round((e.clientY - r.top) / scale)] as [number, number]
  }

  const place = (comp: Comp, e: React.MouseEvent) => {
    const [x, y] = local(e)
    setPins((ps) => {
      const kept = ps.filter((p) => p.status !== 'draft')
      const n = kept.length ? Math.max(...kept.map((p) => p.n)) + 1 : 1
      return [...kept, { n, comp, x, y, text: '', status: 'draft' }]
    })
  }

  const send = (text: string) => {
    if (!text.trim()) return
    setPins((ps) => ps.map((p) => (p.status === 'draft' ? { ...p, text: text.trim(), status: 'queued' } : p)))
  }

  const queued = pins.filter((p) => p.status === 'queued').length

  return (
    <div className="app">
      <header className="bar">
        <div className="brand">
          <span className="mark" aria-hidden />
          <span className="word">Faceplate</span>
        </div>
        <nav className="crumbs">
          <span>{VIEW.project}</span>
          <i>/</i>
          <span className="strong">{VIEW.name}</span>
          <span className="ext">view.json</span>
        </nav>
        <div className="bar-right">
          <div className="gateway">
            <span className="dot" />
            <span>Gateway</span>
            <b>localhost:8088</b>
            <em>SIM</em>
          </div>
          <div className="who" title="Zubair">ZZ</div>
        </div>
      </header>

      <main className="canvas" ref={canvasRef}>
        <div className="frame" style={{ width: VIEW.width * scale, height: VIEW.height * scale }}>
          <div className="caption top">
            <span>root · ia.container.coord · fixed {VIEW.width} × {VIEW.height}</span>
            <span>{Math.round(scale * 100)}%</span>
          </div>
          <span className="crop tl" /><span className="crop tr" /><span className="crop bl" /><span className="crop br" />

          <div
            className="sheet"
            onMouseMove={(e) => setCursor(local(e))}
            onMouseLeave={() => { setCursor(null); setHover(null) }}
          >
            <div className="stage" style={{ transform: `scale(${scale})` }}>
              <Hmi plant={plant} />
              <div className="overlay">
                {COMPONENTS.map((c) => (
                  <button
                    key={c.id}
                    className={`hit${c.container ? ' container' : ''}${hover?.id === c.id ? ' on' : ''}${draft?.comp.id === c.id ? ' picked' : ''}`}
                    style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
                    aria-label={`Annotate ${c.name}`}
                    onMouseEnter={() => setHover(c)}
                    onClick={(e) => place(c, e)}
                  />
                ))}
              </div>
            </div>

            {hover && !draft && (
              <div className={`tab${hover.y < 30 ? ' inside' : ''}`} style={{ left: hover.x * scale, top: hover.y * scale }}>
                <b>{hover.name}</b>
                <span>{hover.type}</span>
              </div>
            )}

            {pins.map((p) => (
              <div
                key={p.n}
                className={`pin ${p.status}`}
                style={{ left: p.x * scale, top: p.y * scale }}
                title={p.text || undefined}
              >
                {p.n}
              </div>
            ))}

            {draft && <Composer key={draft.n} pin={draft} scale={scale} onSend={send} onCancel={() => setPins((ps) => ps.filter((p) => p.status !== 'draft'))} />}
          </div>

          <div className="caption bottom">
            <span>{cursor ? `x ${String(cursor[0]).padStart(4, '0')}  y ${String(cursor[1]).padStart(4, '0')}` : 'x ----  y ----'}</span>
            <span>{hover ? hover.path : 'hover to inspect · click to annotate'}</span>
            <span>{COMPONENTS.length} components · {queued} {queued === 1 ? 'note' : 'notes'}</span>
          </div>
        </div>
      </main>
    </div>
  )
}

function Composer({ pin, scale, onSend, onCancel }: { pin: Pin; scale: number; onSend: (t: string) => void; onCancel: () => void }) {
  const [text, setText] = useState('')
  const flip = pin.x * scale > VIEW.width * scale - 380
  const lift = pin.y * scale > VIEW.height * scale - 230
  return (
    <div
      className="composer"
      style={{
        left: flip ? undefined : pin.x * scale + 22,
        right: flip ? VIEW.width * scale - pin.x * scale + 22 : undefined,
        top: lift ? undefined : pin.y * scale - 14,
        bottom: lift ? VIEW.height * scale - pin.y * scale - 14 : undefined,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="c-head">
        <span className="c-n">{pin.n}</span>
        <b>{pin.comp.name}</b>
        <span className="c-type">{pin.comp.type}</span>
        <button className="c-x" onClick={onCancel} aria-label="Cancel">esc</button>
      </div>
      <textarea
        autoFocus
        rows={2}
        value={text}
        placeholder="Describe the change…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(text) }
        }}
      />
      <div className="c-sugg">
        {pin.comp.suggestions.map((s) => (
          <button key={s} onClick={() => setText(s)}>{s}</button>
        ))}
      </div>
      <div className="c-foot">
        <span>{pin.comp.path}</span>
        <button className="c-send" disabled={!text.trim()} onClick={() => onSend(text)}>
          Send <kbd>↵</kbd>
        </button>
      </div>
    </div>
  )
}

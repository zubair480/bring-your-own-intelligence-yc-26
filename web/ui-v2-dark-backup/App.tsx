import { useCallback, useEffect, useRef, useState } from 'react'
import Screen, { BY_ID, DEFAULTS } from './Hmi'
import type { Plant, PropsMap } from './Hmi'
import type { Comp } from './view'

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
          pumps: p.pumps.map((q) => {
            if (!q.run) return q
            const speed = Math.max(55, Math.min(90, q.speed + (Math.random() - 0.5) * 2))
            return { ...q, speed, amps: speed * 0.56 }
          }),
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

/* ---------- api ---------- */

interface Rule { slug: string; title?: string; snippet: string }
type Kind = 'patch' | 'answer'
interface EditResp { kind?: Kind; patch?: Record<string, unknown>; answer?: string; rationale?: string; rules_cited?: Rule[]; model: string; latency_ms: number }
interface AcceptResp { ok: boolean; gbrain_logged: boolean; logged_line: string; pairs_total: number; next_train_in: number }
interface Health { ok: boolean; gbrain: boolean; model: string }

const MODEL_LABEL: Record<string, string> = {
  'gbrain-think': 'GBrain think (LLM)',
  'qwen-lora': 'Qwen3.8 LoRA · River',
  rules: 'Team rules engine',
}
const modelLabel = (m?: string | null) => (!m ? '…' : m === 'down' ? 'offline' : MODEL_LABEL[m] ?? m)

const TIMEOUT_MS = 60000

async function post<T>(url: string, body: unknown, timeoutMs = TIMEOUT_MS): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: ctl.signal })
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 100)}`)
    return (await r.json()) as T
  } catch (e) {
    if (ctl.signal.aborted) throw new Error(`Timed out after ${timeoutMs / 1000} s`)
    throw e
  } finally {
    clearTimeout(timer)
  }
}

/* ---------- activity feed ---------- */

type StepState = 'wait' | 'run' | 'done' | 'err'
interface Step { key: string; label: string; detail?: string; state: StepState; t?: string }
interface Req { id: number; comp: Comp; instruction: string; t: string; steps: Step[]; active: boolean }

interface Result {
  kind: Kind
  patch: Record<string, unknown>
  answer: string
  rationale: string
  rules_cited: Rule[]
  model: string
  latency_ms: number
  reqId: number
  comp: Comp
  before: Record<string, unknown>
  instruction: string
}

const show = (v: unknown) => (v === null || v === undefined || v === '' ? '—' : typeof v === 'object' ? JSON.stringify(v) : String(v))
const isHex = (v: unknown) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)
const norm = (v: unknown) => (v === undefined || v === '' ? null : typeof v === 'string' && isHex(v) ? v.toLowerCase() : v)
const same = (a: unknown, b: unknown) => JSON.stringify(norm(a)) === JSON.stringify(norm(b))

export default function App() {
  const plant = usePlant()
  const [props, setProps] = useState<PropsMap>({})
  const [sel, setSel] = useState<Comp | null>(null)
  const [flash, setFlash] = useState<string | null>(null)
  const [health, setHealth] = useState<Health | null>(null)
  const [reqs, setReqs] = useState<Req[]>([])
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [confirm, setConfirm] = useState<string | null>(null)
  const [train, setTrain] = useState<{ pairs: number; next: number } | null>(null)
  const [tuned, setTuned] = useState(true)
  const [lastModel, setLastModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState<{ start: number; instruction: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const nextId = useRef(1)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (!wait) return
    const id = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(id)
  }, [wait])

  const selRef = useRef<string | null>(null)
  const select = useCallback((id: string) => {
    const c = id ? BY_ID[id] ?? null : null
    if (selRef.current === (c?.id ?? null)) return
    selRef.current = c?.id ?? null
    setSel(c); setResult(null); setConfirm(null); setError(null); setText('')
  }, [])

  useEffect(() => {
    const id = new URLSearchParams(location.search).get('select')
    if (id && BY_ID[id]) select(id)
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') select('') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [select])

  useEffect(() => {
    const poll = () => fetch('/api/health').then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false, gbrain: false, model: 'down' }))
    poll()
    const id = setInterval(poll, 10000)
    return () => clearInterval(id)
  }, [])

  const patchReq = (id: number, fn: (r: Req) => Req) => setReqs((rs) => rs.map((r) => (r.id === id ? fn(r) : r)))
  const setStep = (id: number, key: string, s: Partial<Step>) =>
    patchReq(id, (r) => ({ ...r, steps: r.steps.map((st) => (st.key === key ? { ...st, ...s } : st)) }))
  const addSteps = (id: number, steps: Step[]) => patchReq(id, (r) => ({ ...r, steps: [...r.steps, ...steps] }))

  const send = async (raw: string) => {
    const instruction = raw.trim()
    if (!sel || !instruction || pending) return
    const comp = sel
    const id = nextId.current++
    const before = { ...DEFAULTS[comp.id], ...props[comp.id] }
    setPending(true); setResult(null); setConfirm(null); setError(null)
    const start = Date.now()
    setNow(start); setWait({ start, instruction })
    setReqs((rs) => [{
      id, comp, instruction, t: clock(), active: true,
      steps: [
        { key: 'rules', label: 'GBrain — searching team rules', state: 'run', t: clock() },
        { key: 'model', label: 'GBrain think — reasoning over team memory', state: 'wait' },
        { key: 'valid', label: 'Validated patch', state: 'wait' },
      ],
    }, ...rs.map((r) => ({ ...r, active: false }))])
    const timer = setTimeout(() => setStep(id, 'model', { state: 'run', t: clock() }), 450)
    try {
      const r = await post<EditResp>('/api/edit', {
        component_id: comp.id, component_type: comp.type, component_path: comp.path,
        component_name: comp.name, instruction, current_props: before,
      })
      clearTimeout(timer)
      const rawPatch = r.patch && typeof r.patch === 'object' ? r.patch : {}
      const answer = typeof r.answer === 'string' ? r.answer : ''
      const kind: Kind = r.kind === 'answer' || (r.kind !== 'patch' && Object.keys(rawPatch).length === 0 && answer) ? 'answer' : 'patch'
      const patch = kind === 'patch' ? rawPatch : {}
      const rules = Array.isArray(r.rules_cited) ? r.rules_cited : []
      const changed = Object.keys(patch).filter((key) => !same(before[key], patch[key])).length
      const n = rules.length
      setStep(id, 'rules', { state: 'done', label: 'GBrain — team rules', detail: `${n} rule${n === 1 ? '' : 's'} found`, t: clock() })
      setStep(id, 'model', { state: 'done', label: `${modelLabel(r.model)} · ${r.latency_ms} ms`, t: clock() })
      setStep(id, 'valid', kind === 'answer'
        ? { state: 'done', label: 'Answered', t: clock() }
        : { state: 'done', detail: `${changed} prop${changed === 1 ? '' : 's'} changed`, t: clock() })
      setLastModel(r.model)
      if (selRef.current === comp.id) {
        setResult({ kind, patch, answer, rationale: r.rationale ?? '', rules_cited: rules, model: r.model, latency_ms: r.latency_ms, reqId: id, comp, before, instruction })
      } else {
        patchReq(id, (q) => ({ ...q, active: false }))
      }
    } catch (e) {
      clearTimeout(timer)
      const msg = e instanceof Error ? e.message : String(e)
      setStep(id, 'rules', { state: 'err', t: clock() })
      setStep(id, 'model', { state: 'err', label: 'GBrain think — failed', detail: msg, t: clock() })
      patchReq(id, (r) => ({ ...r, active: false }))
      if (selRef.current === comp.id) setError(msg)
    } finally {
      setPending(false)
      setWait(null)
    }
  }

  const clearAnswer = () => {
    if (result) patchReq(result.reqId, (r) => ({ ...r, active: false }))
    setResult(null)
    setText('')
    inputRef.current?.focus()
  }

  const accept = async () => {
    if (!result) return
    const { comp, patch, reqId, instruction } = result
    setProps((m) => ({ ...m, [comp.id]: { ...m[comp.id], ...patch } }))
    setFlash(comp.id)
    setTimeout(() => setFlash((f) => (f === comp.id ? null : f)), 1400)
    setResult(null)
    setConfirm('Applied. Logging to GBrain…')
    addSteps(reqId, [
      { key: 'apply', label: 'Applied to screen', state: 'done', t: clock() },
      { key: 'log', label: 'Logged to GBrain · decisions/log', state: 'run', t: clock() },
    ])
    try {
      const r = await post<AcceptResp>('/api/accept', { pin: false, component_id: comp.id, component_name: comp.name, instruction, patch, author: 'Zubair' })
      setStep(reqId, 'log', { state: 'done', detail: r.gbrain_logged ? undefined : 'local copy only', t: clock() })
      addSteps(reqId, [{ key: 'pair', label: `Training pair #${r.pairs_total}`, detail: `next LoRA step in ${r.next_train_in}`, state: 'done', t: clock() }])
      setTrain({ pairs: r.pairs_total, next: r.next_train_in })
      setConfirm(`Applied to ${comp.name}. Logged to GBrain, saved as training pair #${r.pairs_total}.`)
    } catch (e) {
      setStep(reqId, 'log', { state: 'err', detail: e instanceof Error ? e.message : String(e), t: clock() })
      setConfirm(`Applied to ${comp.name}. Logging failed; see activity.`)
    }
    patchReq(reqId, (r) => ({ ...r, active: false }))
  }

  const discard = () => {
    if (result) {
      addSteps(result.reqId, [{ key: 'disc', label: 'Discarded', state: 'done', t: clock() }])
      patchReq(result.reqId, (r) => ({ ...r, active: false }))
    }
    setResult(null)
    inputRef.current?.focus()
  }

  const current = sel ? { ...DEFAULTS[sel.id], ...props[sel.id] } : {}
  const activeModel = lastModel ?? health?.model
  const model = modelLabel(activeModel)
  const k = train ? 8 - train.next : 0
  const elapsed = wait ? Math.max(0, (now - wait.start) / 1000) : 0
  const diffRows = result && result.kind === 'patch'
    ? Object.entries(result.patch).filter(([key, v]) => !same(result.before[key], v))
    : []

  return (
    <div className="app">
      <header className="top">
        <div className="brand"><i className="mark" /><span>Faceplate</span></div>
        <div className="crumb">Station 01 <span>·</span> Pump Station Overview</div>
        <div className="chips">
          <span className="chip">GBrain <i className={`dot${health && !health.gbrain ? ' bad' : ''}`} />{health ? (health.gbrain ? 'connected' : 'offline') : '…'}</span>
          <span className="chip">Model <i className={`dot${health?.model === 'down' ? ' bad' : ''}`} />{health ? model : '…'}</span>
          <span className="chip">Ignition <i className="dot" />simulated</span>
          <span className="chip clock">{plant.clock}</span>
          <span className="who" title="Zubair">ZZ</span>
        </div>
      </header>

      <aside className="feed">
        <div className="rail-h">Live activity <span>{reqs.length}</span></div>
        <div className="feed-list">
          {reqs.length === 0 && (
            <div className="empty-feed">Every edit request shows up here as it runs: GBrain rule search, model draft, validation, then the accept and training steps.</div>
          )}
          {reqs.map((r) => (
            <div key={r.id} className={`req${r.active ? ' active' : ''}`}>
              <div className="req-h"><b>{r.comp.name}</b><span>{r.t}</span></div>
              <div className="req-i">“{r.instruction}”</div>
              <ol>
                {r.steps.map((s) => (
                  <li key={s.key} className={s.state}>
                    <i className="mk" />
                    <div className="st">
                      <div className="st-l">{s.label}</div>
                      {s.detail ? <div className="st-d">{s.detail}</div> : null}
                    </div>
                    <span className="st-t">{s.t ?? ''}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </aside>

      <Screen plant={plant} props={props} selected={sel?.id ?? null} flash={flash} onSelect={select} />

      <aside className="insp">
        <div className="rail-h">Inspector {sel ? <button className="x" onClick={() => select('')}>Esc</button> : null}</div>
        {!sel ? (
          <div className="empty">
            <h2>Select any component on the screen to change it</h2>
            <ol className="how">
              <li><b>1</b><span>Click a pump, tank, valve, alarm table, trend or KPI.</span></li>
              <li><b>2</b><span>Describe the change in plain words. GBrain pulls your team's HMI rules and the model drafts a props patch.</span></li>
              <li><b>3</b><span>Accept it. The screen updates live, the decision is logged to GBrain, and a training pair is saved.</span></li>
            </ol>
          </div>
        ) : (
          <>
            <div className="insp-body">
              <div className="id">
                <h2>{sel.name}</h2>
                <div className="type">{sel.type}</div>
                <div className="path">{sel.path}</div>
              </div>

              {!result && (
                <section>
                  <div className="lbl">Current props</div>
                  <dl className="kv">
                    {Object.entries(current).map(([key, v]) => (
                      <div key={key}><dt>{key}</dt><dd>{isHex(v) ? <i className="sw" style={{ background: String(v) }} /> : null}{show(v)}</dd></div>
                    ))}
                  </dl>
                </section>
              )}

              <section>
                <div className="lbl">Change or ask</div>
                <textarea
                  ref={inputRef}
                  rows={3}
                  value={text}
                  disabled={pending}
                  placeholder="Describe a change, or ask what this is…"
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(text) } }}
                />
                <div className="send-row">
                  <span className="hint">Enter to send · Shift+Enter for a new line</span>
                  <button className="send" disabled={pending || !text.trim()} onClick={() => send(text)}>{pending ? 'Sending…' : 'Send'}</button>
                </div>
                {!result && !pending && (
                  <div className="sugg">
                    {sel.suggestions.map((s) => (
                      <button key={s} onClick={() => { setText(s); inputRef.current?.focus() }}>{s}</button>
                    ))}
                  </div>
                )}
                {wait && (
                  <div className="thinking" role="status" aria-live="polite">
                    <div className="th-h">
                      <i className="pulse" />
                      <span>Thinking with GBrain…</span>
                      <span className="th-t">{elapsed.toFixed(0)} s</span>
                    </div>
                    <div className="th-i">“{wait.instruction}”</div>
                    <div className="th-d">Reasoning over team memory. This can take 5–40 s.</div>
                  </div>
                )}
                {error && !pending && <div className="err-line" title={error}>Request failed: {error}</div>}
              </section>

              {result && result.kind === 'answer' && (
                <section>
                  <div className="lbl">Answer</div>
                  <p className="answer">{result.answer || 'No answer text returned.'}</p>
                </section>
              )}

              {result && result.kind === 'patch' && (
                <>
                  <section>
                    <div className="lbl">Proposed patch</div>
                    {diffRows.length === 0 ? <p className="why dim">No changes: every proposed value matches the current props.</p> : (
                      <ul className="diff">
                        {diffRows.map(([key, v]) => (
                          <li key={key}>
                            <span className="dk">{key}</span>
                            <span className="dold">{show(result.before[key])}</span>
                            <span className="arr">→</span>
                            <span className="dnew">{isHex(v) ? <i className="sw" style={{ background: String(v) }} /> : null}{show(v)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                  <section>
                    <div className="lbl">Why</div>
                    <p className="why">{result.rationale || '—'}</p>
                  </section>
                </>
              )}

              {result && (
                <>
                  <section>
                    <div className="lbl">Rules used from GBrain</div>
                    {result.rules_cited.length === 0 ? <p className="why dim">No team rules matched.</p> : (
                      <ul className="rules">
                        {result.rules_cited.map((r, i) => (
                          <li key={i}><code>{r.slug}</code><p>{r.snippet}</p></li>
                        ))}
                      </ul>
                    )}
                  </section>
                </>
              )}
              {confirm && !result && <div className="confirm"><i className="mark" />{confirm}</div>}
            </div>
            {result && result.kind === 'patch' && (
              <div className="actions">
                <button className="primary" onClick={accept}>Accept</button>
                <button onClick={discard}>Discard</button>
              </div>
            )}
            {result && result.kind === 'answer' && (
              <div className="actions small">
                <button onClick={clearAnswer}>Ask another</button>
              </div>
            )}
          </>
        )}
      </aside>

      <footer className="modelbar">
        <span className="mb-l">Model</span>
        <span className="mb-v">{model}</span>
        <span className="sep" />
        <span className="mb-l">Pairs learned</span>
        <span className="mb-n">{train ? train.pairs : '—'}</span>
        <span className="sep" />
        <span className="mb-l">Next training step</span>
        <span className="prog"><i style={{ width: `${(k / 8) * 100}%` }} /></span>
        <span className="mb-n">{train ? `${k}/8` : '—/8'}</span>
        <div className="seg">
          <button className={!tuned ? 'on' : ''} onClick={() => setTuned(false)}>Base</button>
          <button className={tuned ? 'on' : ''} onClick={() => setTuned(true)}>Tuned</button>
        </div>
      </footer>
    </div>
  )
}

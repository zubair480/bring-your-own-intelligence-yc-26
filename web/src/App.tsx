import { useCallback, useEffect, useRef, useState } from 'react'
import Screen, { BY_ID, DEFAULTS, Ico, Head } from './Hmi'
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
interface TraceStep { step?: string; target?: string; detail?: string; ms?: number }
interface EditResp { kind?: Kind; patch?: Record<string, unknown>; answer?: string; rationale?: string; rules_cited?: Rule[]; model: string; latency_ms: number; trace?: TraceStep[] }
interface AcceptResp { ok: boolean; gbrain_logged: boolean; logged_line: string; pairs_total: number; next_train_in: number; gbrain_write?: { page?: string; line?: string; ok?: boolean }; pairs_file?: string; pair_index?: number }
interface Stats { pairs_total?: number; next_train_in?: number; model?: string; river_ready?: boolean }
interface ToastRow { text: string; mono?: boolean }
interface Toast { id: number; err?: boolean; title: string; rows: ToastRow[] }
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const pairsPath = (f?: string) => (typeof f === 'string' && f ? f.split('\\').join('/').replace(/^.*?(server\/)/, '$1') : 'server/data/pairs.jsonl')
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
  const [train, setTrain] = useState<{ pairs: number | null; next: number | null } | null>(null)
  const [toast, setToast] = useState<Toast | null>(null)
  const toastId = useRef(1)
  const showToast = (t: Omit<Toast, 'id'>) => setToast({ ...t, id: toastId.current++ })
  const [tuned, setTuned] = useState(true)
  const [lastModel, setLastModel] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [wait, setWait] = useState<{ start: number; instruction: string } | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const nextId = useRef(1)
  const inputRef = useRef<HTMLInputElement>(null)

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

  useEffect(() => {
    if (!toast) return
    const id = setTimeout(() => setToast((t) => (t?.id === toast.id ? null : t)), 7000)
    return () => clearTimeout(id)
  }, [toast])

  const loadStats = useCallback(async () => {
    try {
      const r = await fetch('/api/stats')
      if (!r.ok) return false
      const st = (await r.json()) as Stats
      const pairs = isNum(st.pairs_total) ? st.pairs_total : null
      const next = isNum(st.next_train_in) ? st.next_train_in : null
      if (pairs === null && next === null) return false
      setTrain((t) => ({ pairs: pairs ?? t?.pairs ?? null, next: next ?? t?.next ?? null }))
      return true
    } catch {
      return false
    }
  }, [])

  useEffect(() => {
    let done = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = async () => {
      const ok = await loadStats()
      if (!ok && !done) timer = setTimeout(tick, 10000)
    }
    tick()
    return () => { done = true; if (timer) clearTimeout(timer) }
  }, [loadStats])

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
      const rows: ToastRow[] = [{ text: `→ Backend  ${location.origin}/api/edit` }]
      const trace = Array.isArray(r.trace) ? r.trace.filter((t) => t && (t.target || t.step)) : []
      if (trace.length) {
        for (const t of trace) rows.push({ text: `→ ${t.target || t.step}${t.detail ? ` — ${t.detail}` : ''}${isNum(t.ms) ? ` · ${Math.round(t.ms)} ms` : ''}` })
      } else {
        rows.push({ text: `→ GBrain search · ${n} rule${n === 1 ? '' : 's'}` })
        rows.push({ text: `→ ${modelLabel(r.model)}${isNum(r.latency_ms) ? ` · ${r.latency_ms} ms` : ''}` })
      }
      showToast({ title: 'Sent ✓', rows })
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
      showToast({ err: true, title: 'Request failed', rows: [{ text: `→ ${location.origin}/api/edit` }, { text: msg }] })
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
      setTrain((t) => ({ pairs: isNum(r.pairs_total) ? r.pairs_total : t?.pairs ?? null, next: isNum(r.next_train_in) ? r.next_train_in : t?.next ?? null }))
      setConfirm(`Applied to ${comp.name}. Logged to GBrain, saved as training pair #${r.pairs_total}.`)
      const gw = r.gbrain_write && typeof r.gbrain_write === 'object' ? r.gbrain_write : null
      const pairNo = isNum(r.pair_index) ? r.pair_index : isNum(r.pairs_total) ? r.pairs_total : null
      const rows: ToastRow[] = [
        { text: `page: ${gw?.page || 'decisions/log'}` },
        { text: gw?.line || r.logged_line || 'logged', mono: true },
      ]
      if (pairNo !== null) rows.push({ text: `training pair #${pairNo} → ${pairsPath(r.pairs_file)}` })
      showToast({ title: 'Saved to GBrain ✓', rows })
      loadStats()
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setStep(reqId, 'log', { state: 'err', detail: msg, t: clock() })
      setConfirm(`Applied to ${comp.name}. Logging failed; see activity.`)
      showToast({ err: true, title: 'Save failed', rows: [{ text: `→ ${location.origin}/api/accept` }, { text: msg }] })
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
  const k = train && train.next !== null ? Math.max(0, Math.min(8, 8 - train.next)) : 0
  const elapsed = wait ? Math.max(0, (now - wait.start) / 1000) : 0
  const diffRows = result && result.kind === 'patch'
    ? Object.entries(result.patch).filter(([key, v]) => !same(result.before[key], v))
    : []

  const feed = (
    <div className="card feed">
      <Head icon="activity" title="Live activity" meta={`${reqs.length} request${reqs.length === 1 ? '' : 's'}`} />
      <div className="feed-list">
        {reqs.length === 0 && (
          <div className="empty-feed">Every edit shows up here as it runs: GBrain rule search, model draft, validation, then accept and training.</div>
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
    </div>
  )

  const RAIL: [string, string, string | null][] = [
    ['overview', 'Overview', null], ['alarm', 'Alarms', 'alarms'], ['trend', 'Trends', 'trend'],
    ['brain', 'GBrain', null], ['qm', 'QM', null], ['settings', 'Settings', null],
  ]
  const headerNote = String(props.header?.note ?? '')

  return (
    <div className={`app${sel ? ' open' : ''}`}>
      <nav className="rail">
        <div className="logo" title="Faceplate"><i /></div>
        {RAIL.map(([icon, label, target]) => (
          <button key={icon} className={`rb${(target ? sel?.id === target : icon === 'overview' && !sel) ? ' on' : ''}`} title={label} aria-label={label}
            onClick={() => select(target ?? '')}><Ico n={icon} size={18} /></button>
        ))}
      </nav>

      <div className="main">
        <section className="hero">
          <div className="hero-top">
            <button className={`station${sel?.id === 'header' ? ' sel' : ''}${flash === 'header' ? ' flash' : ''}`} onClick={() => select('header')}>
              <b>Faceplate</b><span>Station 01 · Pump Station Overview</span>
              {headerNote ? <em>{headerNote}</em> : null}
            </button>
            <div className="chips">
              <span className="chip"><i className={`dot${health && !health.gbrain ? ' bad' : ''}`} />GBrain · {health ? (health.gbrain ? 'connected' : 'offline') : '…'}</span>
              <span className="chip"><i className={`dot${health?.model === 'down' ? ' bad' : ''}`} />{health ? model : '…'}</span>
              <span className="chip mono">{plant.clock}</span>
              <span className="who"><span className="av">ZZ</span><span className="wn"><b>Zubair</b><span>HMI lead</span></span></span>
            </div>
          </div>
          <div className="hero-c">
            <div className="hi">Hey Zubair 👋</div>
            <h1>What should we change on Station 01?</h1>
            <form className={`ask${pending ? ' busy' : ''}`} onSubmit={(e) => { e.preventDefault(); send(text) }}>
              {sel ? <span className="target" title={sel.path}>{sel.name}</span> : null}
              <input
                ref={inputRef}
                value={text}
                disabled={pending}
                placeholder={sel ? `Change or ask about ${sel.name}…` : 'Just ask me anything about the plant…'}
                onChange={(e) => setText(e.target.value)}
              />
              {pending ? <span className="ask-t"><i className="pulse" />{elapsed.toFixed(0)} s</span> : null}
              <button type="submit" className="go" disabled={!sel || pending || !text.trim()} aria-label="Send">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </button>
            </form>
            <div className="sugg">
              {!sel ? <span className="hint">Select a component below first</span> : pending ? <span className="hint">Thinking with GBrain… reasoning over team memory</span> : (
                sel.suggestions.map((s) => (
                  <button key={s} onClick={() => { setText(s); inputRef.current?.focus() }}>{s}</button>
                ))
              )}
            </div>
          </div>
        </section>

        <Screen plant={plant} props={props} selected={sel?.id ?? null} flash={flash} onSelect={select} feed={feed} />

        <footer className="modelbar card">
          <span className="tile"><Ico n="model" /></span>
          <span className="mb-l">Model</span>
          <span className="mb-v">{model}</span>
          <span className="sep" />
          <span className="mb-l">Pairs learned</span>
          <span className="mb-n">{train?.pairs ?? '—'}</span>
          <span className="sep" />
          <span className="mb-l">Next LoRA step</span>
          <span className="prog"><i style={{ width: `${(k / 8) * 100}%` }} /></span>
          <span className="mb-n">{train && train.next !== null ? `${k}/8` : '—/8'}</span>
          <div className="seg">
            <button className={!tuned ? 'on' : ''} onClick={() => setTuned(false)}>Base</button>
            <button className={tuned ? 'on' : ''} onClick={() => setTuned(true)}>Tuned</button>
          </div>
        </footer>
      </div>

      <aside className="drawer" aria-hidden={!sel}>
        <div className="dw">
          {sel && (
            <>
              <div className="dw-h">
                <span className="tile"><Ico n="overview" /></span>
                <div className="id">
                  <h2>{sel.name}</h2>
                  <div className="type">{sel.type}</div>
                </div>
                <button className="x" onClick={() => select('')}>Esc</button>
              </div>
              <div className="path">{sel.path}</div>
              <div className="insp-body">
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

                {!result && !wait && (
                  <section>
                    <div className="lbl">Current props</div>
                    <dl className="kv">
                      {Object.entries(current).map(([key, v]) => (
                        <div key={key}><dt>{key}</dt><dd>{isHex(v) ? <i className="sw" style={{ background: String(v) }} /> : null}{show(v)}</dd></div>
                      ))}
                    </dl>
                  </section>
                )}

                {result && (
                  <section>
                    <div className="lbl">You asked</div>
                    <p className="why">“{result.instruction}”</p>
                  </section>
                )}

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
                )}
                {confirm && !result && <div className="confirm"><i className="mark" />{confirm}</div>}
                {!result && !wait && !confirm && <p className="why dim">Type a change or a question in the bar above, then press Enter.</p>}
              </div>
              {result && result.kind === 'patch' && (
                <div className="actions">
                  <button className="primary" onClick={accept}>Accept</button>
                  <button onClick={discard}>Discard</button>
                </div>
              )}
              {result && result.kind === 'answer' && (
                <div className="actions">
                  <button onClick={clearAnswer}>Ask another</button>
                </div>
              )}
            </>
          )}
        </div>
      </aside>

      {toast && (
        <div key={toast.id} className={`toast${toast.err ? ' err' : ''}`} role="status" aria-live="polite" onClick={() => setToast(null)} title="Click to dismiss">
          <div className="toast-t">{toast.title}</div>
          {toast.rows.map((row, i) => <div key={i} className={`toast-r${row.mono ? ' mono' : ''}`}>{row.text}</div>)}
        </div>
      )}
    </div>
  )
}

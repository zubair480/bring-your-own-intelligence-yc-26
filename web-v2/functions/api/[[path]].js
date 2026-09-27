// Cloudflare Pages Function: proxies every /api/* request to the FastAPI backend.
// The backend is exposed with a cloudflared quick tunnel (see deploy.md).
// Override without redeploying code by setting the Pages env var BACKEND_URL.
const DEFAULT_BACKEND_URL = 'https://hop-independence-car-surgeons.trycloudflare.com'

export async function onRequest({ request, env }) {
  const backend = (env.BACKEND_URL || DEFAULT_BACKEND_URL).replace(/\/+$/, '')
  const incoming = new URL(request.url)
  const target = backend + incoming.pathname + incoming.search

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('cf-connecting-ip')

  const init = { method: request.method, headers, redirect: 'manual' }
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer()
  }

  try {
    const resp = await fetch(target, init)
    return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers: resp.headers })
  } catch (err) {
    return new Response(JSON.stringify({ ok: false, error: 'backend unreachable', detail: String(err) }), {
      status: 502,
      headers: { 'content-type': 'application/json' },
    })
  }
}

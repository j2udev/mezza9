// Client-side half of the task-97 token gate. The server may require a shared token
// (MEZZ_TOKEN) on every /api/* request and on both WebSocket upgrades. We keep the token in
// localStorage, attach it as a Bearer header to every fetch (via a one-time window.fetch
// wrapper, so no individual call site has to opt in), and append it to WebSocket URLs -
// browsers cannot set headers on a WebSocket, so the token rides in the query string. A 401
// from any /api/ call broadcasts `mezz-auth-required` so the app can drop back to the login
// screen (e.g. when a token is revoked server-side mid-session).

const TOKEN_KEY = 'mezz-token'

let token = (() => { try { return localStorage.getItem(TOKEN_KEY) || '' } catch { return '' } })()

export function getToken() { return token }

export function setToken(t) {
  token = (t || '').trim()
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    else localStorage.removeItem(TOKEN_KEY)
  } catch { /* private mode / storage disabled - in-memory token still works for the session */ }
}

export function clearToken() { setToken('') }

// One-click login, Jupyter-style: if the page was opened with ?token=... (the URL printed in the
// server log when MEZZ_TOKEN=auto), adopt that token and strip it from the address bar so it does
// not linger in history / get shared. Call once at boot, before initAuth.
export function consumeUrlToken() {
  try {
    const url = new URL(window.location.href)
    const t = url.searchParams.get('token')
    if (t) {
      setToken(t)
      url.searchParams.delete('token')
      window.history.replaceState({}, '', url.pathname + url.search + url.hash)
    }
  } catch { /* malformed URL / no history API - ignore, the login screen still works */ }
}

// Append ?token= (or &token=) to a WebSocket URL so the upgrade carries the token. No-op when
// no token is held (auth disabled, or not logged in yet).
export function withToken(url) {
  if (!token) return url
  return url + (url.includes('?') ? '&' : '?') + 'token=' + encodeURIComponent(token)
}

let installed = false
// Wrap window.fetch ONCE so every /api/ request gets the Authorization header automatically and
// any 401 flips the app back to the login screen. Same-origin relative URLs ('/api/...') are
// what the app uses; we match those and leave third-party requests untouched.
export function installAuthFetch() {
  if (installed) return
  installed = true
  const orig = window.fetch.bind(window)
  window.fetch = (input, init) => {
    init = init || {}
    const url = typeof input === 'string' ? input : (input && input.url) || ''
    const isApi = url.startsWith('/api/')
    if (token && isApi) {
      const headers = new Headers(init.headers || {})
      if (!headers.has('Authorization')) headers.set('Authorization', 'Bearer ' + token)
      init = { ...init, headers }
    }
    return orig(input, init).then((res) => {
      if (res.status === 401 && isApi) {
        window.dispatchEvent(new CustomEvent('mezz-auth-required'))
      }
      return res
    })
  }
}

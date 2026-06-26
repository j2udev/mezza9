import express from 'express'
import { WebSocketServer } from 'ws'
import { createServer } from 'http'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import { existsSync, readFileSync } from 'fs'
import { execFile, spawn } from 'child_process'
import { PassThrough, Writable } from 'stream'
import { promisify } from 'util'
import { createHash, timingSafeEqual, randomBytes } from 'crypto'
import cors from 'cors'
import yaml from 'js-yaml'
import { fetchResources, fetchCrdInstances, getExec, addEphemeralDebugContainer, fetchPolicy, whoAmI } from './k8s.js'
import { getMockLogs, getMockDescribe, getMockYaml, getMockCrdResources, getMockHelmValues, getMockHelmAllValues, getMockHelmManifest, getMockHelmHistory, getMockHelmNotes, getMockPolicy, getMockWhoAmI } from './mock.js'

// kubectl/helm are run with execFile (NOT exec): execFile invokes the binary directly
// without a shell, so a crafted resource/name/namespace in a URL can never inject shell
// commands. This is the same no-shell pattern the edit/port-forward endpoints use via spawn.
const execFileAsync = promisify(execFile)

// kubectl/helm are invoked as subprocesses (describe/yaml/json/edit/delete/port-forward
// and helm get/history/rollback). Resolve from env so the container can point at its
// bundled binaries on PATH; falls back to a bare name (PATH lookup). In devbox dev,
// start.sh exports MEZZ_KUBECTL/MEZZ_HELM to the nix profile paths.
const KUBECTL = process.env.MEZZ_KUBECTL || 'kubectl'
const HELM    = process.env.MEZZ_HELM    || 'helm'

// Defense in depth on top of the no-shell execFile: reject anything that isn't a plausible
// Kubernetes identifier before it reaches kubectl/helm. Blocks argument injection (a value
// starting with '-' read as a flag) and fails fast with a 400. The charset allows the '.' in
// grouped resource types (foos.example.com) and the ':' in built-in RBAC names
// (system:controller:...); the '_' cluster-scoped namespace sentinel is handled by callers.
const ID_RE = /^[A-Za-z0-9][A-Za-z0-9._:-]*$/
const validId = (s) => typeof s === 'string' && s.length > 0 && s.length <= 253 && ID_RE.test(s)
const validTarget = (resource, namespace, name) =>
  validId(resource) && validId(name) && (namespace === '_' || validId(namespace))

// ── Auth gate (task 97) ──────────────────────────────────────────────────────
// Optional shared-token gate. Set MEZZ_TOKEN (or MEZZ_TOKEN_FILE pointing at a file, e.g. a
// mounted Kubernetes Secret) to require that token on every /api/* request AND both WebSocket
// upgrades (/ws data stream + /ws/exec pod shell). Set MEZZ_TOKEN=auto to have the server mint a
// random token and PRINT it (+ a one-click URL) at startup, Jupyter-style, so you don't have to
// invent and track one. When unset the dashboard is UNAUTHENTICATED: anyone who can reach the port
// gets full cluster control (delete / edit / exec / port-forward), so we log a loud warning at
// startup. For real multi-user / per-identity access, front mezza9 with an auth proxy + TLS
// (oauth2-proxy, Istio RequestAuthentication) - the blessed production path documented in
// README.md. This built-in gate is one shared identity, not per-user RBAC.
let AUTH_GENERATED = false   // true when the token was auto-minted this run (MEZZ_TOKEN=auto)
function readToken() {
  const file = process.env.MEZZ_TOKEN_FILE
  if (file != null && file !== '') {
    try { return readFileSync(file, 'utf8').trim() }
    catch (e) { console.error(`  ✗ MEZZ_TOKEN_FILE unreadable (${file}): ${e.message}`); return '' }
  }
  const env = (process.env.MEZZ_TOKEN || '').trim()
  // MEZZ_TOKEN=auto: mint a fresh url-safe token for this run and flag it for the startup banner.
  if (env.toLowerCase() === 'auto') {
    AUTH_GENERATED = true
    return randomBytes(24).toString('base64url')   // 24 bytes -> 32-char url-safe string
  }
  return env
}
// True when the operator explicitly asked for the gate (either env var is present), regardless of
// whether the value turns out usable. Drives the fail-closed check below.
const AUTH_CONFIGURED = process.env.MEZZ_TOKEN_FILE != null || process.env.MEZZ_TOKEN != null
const AUTH_TOKEN = readToken()
const AUTH_ENABLED = AUTH_TOKEN.length > 0

// Fail CLOSED: if a token was configured (MEZZ_TOKEN / MEZZ_TOKEN_FILE set) but resolved EMPTY -
// an unreadable mounted Secret, the wrong Secret key, or a blank/whitespace value - refuse to
// start. The dangerous alternative is silently serving an unauthenticated, cluster-admin dashboard
// while every signal says auth is on. A loud crash-loop is the safe, visible failure; to run
// without the gate, unset the variable entirely rather than setting it empty.
if (AUTH_CONFIGURED && !AUTH_ENABLED) {
  console.error(
    '\n  ✗ auth: a token was configured (MEZZ_TOKEN / MEZZ_TOKEN_FILE) but resolved EMPTY.\n' +
    '    Refusing to start unauthenticated. Check the value, the mounted Secret, and that its key\n' +
    '    matches what is referenced. To run with NO gate, unset the variable entirely.\n'
  )
  process.exit(1)
}
// Pre-hash the expected token once. Comparing fixed-length SHA-256 digests keeps the check
// constant-time (timingSafeEqual) and leaks neither the token's length nor its content.
const EXPECTED_HASH = AUTH_ENABLED ? createHash('sha256').update(AUTH_TOKEN).digest() : null

function tokenOk(provided) {
  if (!AUTH_ENABLED) return true
  if (typeof provided !== 'string' || provided.length === 0) return false
  return timingSafeEqual(EXPECTED_HASH, createHash('sha256').update(provided).digest())
}

// Pull a token from an HTTP request or a WS upgrade request. Order: Authorization: Bearer <t>,
// HTTP Basic (token in the password field, e.g. `curl -u any:token`; falls back to the username
// field so `curl -u token:` also works), then a ?token= query param (browsers cannot set headers
// on a WebSocket, so the WS client passes the token in the URL).
function tokenFromReq(req) {
  const auth = req.headers?.authorization || ''
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim()
  if (auth.startsWith('Basic ')) {
    try {
      const dec = Buffer.from(auth.slice(6), 'base64').toString('utf8')
      const i = dec.indexOf(':')
      if (i < 0) return dec                          // no colon: the whole value is the token
      return dec.slice(i + 1) || dec.slice(0, i)     // password, or username when password is empty
    } catch { /* malformed - fall through to query param */ }
  }
  try { return new URL(req.url, 'http://localhost').searchParams.get('token') } catch { return null }
}

const __dirname = dirname(fileURLToPath(import.meta.url))
const distDir = join(__dirname, '..', 'client', 'dist')

const app = express()
app.use(cors())
app.use(express.json())

// Serve built frontend if it exists (single-port production mode). Static assets + the SPA
// shell stay OPEN so the login screen can load; the data endpoints behind them are gated below.
if (existsSync(distDir)) {
  app.use(express.static(distDir))
}

// Gate every /api/* request (task 97). /api/health stays public so liveness/readiness probes
// and the client's "is auth required?" boot probe work without a token. Non-/api paths (the
// SPA + its assets) are served openly above. No-op when AUTH_ENABLED is false.
app.use((req, res, next) => {
  if (!AUTH_ENABLED) return next()
  // Normalize exactly how Express routes (case-insensitive, percent-decoded) before deciding what
  // to gate - otherwise /API/data or /%61pi/data would skip a case/encoding-sensitive prefix check
  // yet still match the /api/data route handler, bypassing auth entirely.
  let p = req.path
  try { p = decodeURIComponent(p) } catch { /* malformed escape - gate the raw path */ }
  p = p.toLowerCase()
  if (!p.startsWith('/api/')) return next()
  if (p === '/api/health') return next()
  if (tokenOk(tokenFromReq(req))) return next()
  res.set('WWW-Authenticate', 'Bearer realm="mezza9", Basic realm="mezza9"')
  return res.status(401).json({ error: 'Unauthorized', authRequired: true })
})

const server = createServer(app)
// Accept WS on any path so Vite's /ws proxy works. verifyClient runs during the handshake so an
// unauthenticated upgrade is rejected with 401 BEFORE the socket opens (task 97) - this covers
// both the /ws data stream and the /ws/exec pod shell.
const wss = new WebSocketServer({
  server,
  verifyClient: (info, done) => {
    if (!AUTH_ENABLED) return done(true)
    if (tokenOk(tokenFromReq(info.req))) return done(true)
    return done(false, 401, 'Unauthorized')
  },
})

const clients = new Set()
let latest = {
  pods: [], deployments: [], replicasets: [], services: [],
  statefulsets: [], daemonsets: [], jobs: [], cronjobs: [], hpa: [], pdb: [],
  ingresses: [], networkpolicies: [],
  configmaps: [], secrets: [], serviceaccounts: [], resourcequotas: [],
  pvcs: [], pvs: [], storageclasses: [],
  roles: [], clusterroles: [], rolebindings: [], clusterrolebindings: [],
  nodes: [], namespaces: [], events: [], crds: [], helmreleases: [],
  portforwards: [],
  demoMode: false, clusterConnected: false, clusterError: null,
}

let refreshing = false
async function refresh() {
  if (refreshing) return
  refreshing = true
  try {
    const data = await Promise.race([
      fetchResources(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('fetch timeout after 15s')), 15000)),
    ])
    latest = data
    latest.portforwards = pfList()   // surface live forwards in the data stream (#53)
    const msg = JSON.stringify({ type: 'update', data: latest })
    for (const ws of clients) {
      if (ws.readyState === 1) ws.send(msg)
    }
  } catch (err) {
    console.error('refresh error:', err.message)
  } finally {
    refreshing = false
  }
}

wss.on('connection', (ws, req) => {
  // /ws/exec is an interactive pod shell session (task 81), not a data-stream subscriber.
  if ((req.url || '').startsWith('/ws/exec')) { handleExec(ws, req); return }
  clients.add(ws)
  ws.send(JSON.stringify({ type: 'update', data: { ...latest, portforwards: pfList() } }))
  ws.on('close', () => clients.delete(ws))
  ws.on('error', () => clients.delete(ws))
})

// Bridge a browser terminal <-> `kubectl exec`-style pod shell over the apiserver.
// Wire protocol (binary vs text disambiguates the two channels in BOTH directions):
//   browser -> server : binary frame = raw stdin keystrokes; text frame = JSON control
//                       ({type:'resize',cols,rows})
//   server -> browser : binary frame = raw stdout/stderr bytes; text frame = JSON status
//                       ({type:'ready'|'error'|'exit', ...})
async function handleExec(ws, req) {
  const url = new URL(req.url, 'http://localhost')
  const namespace = url.searchParams.get('namespace') || 'default'
  const pod       = url.searchParams.get('pod')
  const container = url.searchParams.get('container') || undefined
  const shell     = url.searchParams.get('shell') || '/bin/sh'
  const send = (obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)) }

  if (latest.demoMode) { send({ type: 'error', message: 'Exec is not available in demo mode.' }); ws.close(); return }
  if (!pod)            { send({ type: 'error', message: 'Missing pod.' }); ws.close(); return }

  let exec
  try { exec = await getExec() } catch (e) { send({ type: 'error', message: e.message }); ws.close(); return }
  if (!exec) { send({ type: 'error', message: 'No live cluster connection.' }); ws.close(); return }

  // stdin: browser keystrokes flow in here -> apiserver.
  const stdin = new PassThrough()
  // stdout/stderr -> browser. The stream carries rows/columns + emits 'resize' so
  // client-node's isResizable() detection enables terminal resize over its channel 4.
  const mkOut = () => new Writable({ write(chunk, _enc, cb) { if (ws.readyState === 1) ws.send(chunk); cb() } })
  const stdout = mkOut()
  const stderr = mkOut()
  stdout.columns = Number(url.searchParams.get('cols')) || 80
  stdout.rows    = Number(url.searchParams.get('rows')) || 24

  let conn = null, closed = false
  const cleanup = () => {
    if (closed) return
    closed = true
    try { stdin.end() } catch { /* noop */ }
    try { conn?.close() } catch { /* noop */ }
    if (ws.readyState === 1) ws.close()
  }

  ws.on('message', (data, isBinary) => {
    if (isBinary) { stdin.write(data); return }
    try {
      const msg = JSON.parse(data.toString())
      if (msg.type === 'resize' && msg.cols && msg.rows) {
        stdout.columns = msg.cols; stdout.rows = msg.rows; stdout.emit('resize')
      }
    } catch { /* ignore malformed control frame */ }
  })
  ws.on('close', cleanup)
  ws.on('error', cleanup)

  // `kubectl exec -it` exports TERM from the client; client-node's Exec does not, so the shell
  // would start with an empty TERM. busybox vi tolerates that, but full curses apps (vim, less,
  // top) can't load termcap and hang waiting for input they can't decode - which looked like the
  // terminal "freezing". Re-exec the shell with a sane TERM (done via the shell itself so we
  // don't depend on env(1) existing). $0 is the shell path passed as the trailing arg.
  const cmd = [shell, '-c', 'export TERM=xterm-256color; exec "$0"', shell]

  try {
    conn = await exec.exec(namespace, pod, container, cmd, stdout, stderr, stdin, true, (status) => {
      send({ type: 'exit', status: status.status, message: status.message })
      cleanup()
    })
    conn.on('close', cleanup)
    conn.on('error', (err) => { send({ type: 'error', message: err.message }); cleanup() })
    send({ type: 'ready' })
  } catch (err) {
    send({ type: 'error', message: err.message })
    cleanup()
  }
}

// Shells probed (best-first) so the UI offers only the ones that actually exist in the
// container (#81). Each is run as `<shell> -c 'exit 0'`: the apiserver execs the binary
// directly (no pre-existing shell needed), and a missing binary comes back as a Failure
// status - so this works on distroless/scratch images too (they simply return none).
const SHELL_CANDIDATES = ['/bin/bash', '/bin/zsh', '/bin/ash', '/bin/sh', '/bin/dash', '/busybox/sh']

function probeShell(exec, namespace, pod, container, shell) {
  return new Promise((resolve) => {
    let settled = false
    const done = (ok) => { if (!settled) { settled = true; resolve(ok) } }
    const sink = new Writable({ write(_c, _e, cb) { cb() } })
    exec.exec(namespace, pod, container, [shell, '-c', 'exit 0'], sink, sink, null, false,
      (status) => done(status.status === 'Success'))
      .then((conn) => {
        conn.on('error', () => done(false))
        setTimeout(() => { try { conn.close() } catch { /* noop */ } done(false) }, 5000)
      })
      .catch(() => done(false))
  })
}

// GET /api/exec/shells/:namespace/:pod?container= -> { shells: [...], demo?, error? }
app.get('/api/exec/shells/:namespace/:pod', async (req, res) => {
  const { namespace, pod } = req.params
  const container = req.query.container || undefined
  if (latest.demoMode) return res.json({ shells: [], demo: true })
  let exec
  try { exec = await getExec() } catch { exec = null }
  if (!exec) return res.json({ shells: [], error: 'No live cluster connection.' })
  try {
    const results = await Promise.all(SHELL_CANDIDATES.map(sh =>
      probeShell(exec, namespace, pod, container, sh).then(ok => ok ? sh : null)))
    res.json({ shells: results.filter(Boolean) })
  } catch (err) {
    res.json({ shells: [], error: err.message })
  }
})

// POST /api/debug/:namespace/:pod {image, target?} -> { container } | { error }  (#82)
// Injects an ephemeral debug container; the frontend then execs a shell into the returned
// container name via the normal /ws/exec flow.
app.post('/api/debug/:namespace/:pod', async (req, res) => {
  const { namespace, pod } = req.params
  const { image, target } = req.body || {}
  if (latest.demoMode) return res.status(400).json({ error: 'Debug is not available in demo mode.' })
  if (!image) return res.status(400).json({ error: 'Missing debug image.' })
  try {
    const out = await addEphemeralDebugContainer(namespace, pod, { image, target })
    res.json(out)
  } catch (err) {
    res.status(500).json({ error: err.message })
  }
})

// Public: probes + the client's "do I need a token?" boot check. Never gated.
app.get('/api/health', (_, res) => res.json({ ok: true, demoMode: latest.demoMode, authRequired: AUTH_ENABLED }))
// Behind the auth gate: reaching it means the supplied token was accepted (or auth is off).
// The login screen calls this to validate a token before storing it.
app.get('/api/auth/verify', (_, res) => res.json({ ok: true }))
app.get('/api/data', (_, res) => res.json({ ...latest, portforwards: pfList() }))
app.get('/api/logs/:namespace/:pod', async (req, res) => {
  const { namespace, pod } = req.params
  const { container, tail, sinceSeconds } = req.query
  const tailLines = tail && tail !== 'all' ? parseInt(tail) : undefined
  if (latest.demoMode) {
    return res.json({ logs: getMockLogs(namespace, pod) })
  }
  try {
    const k8s = await import('@kubernetes/client-node')
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)
    const baseParams = {
      name: pod, namespace,
      ...(tailLines !== undefined && { tailLines }),
      ...(sinceSeconds && { sinceSeconds: parseInt(sinceSeconds) }),
    }
    if (container) {
      const result = await coreApi.readNamespacedPodLog({ ...baseParams, container })
      return res.json({ logs: typeof result === 'string' ? result : String(result) })
    }
    // No container = "all containers". The k8s API rejects a container-less log
    // request on a multi-container pod (400), so fetch each container and combine.
    const podInfo = await coreApi.readNamespacedPod({ name: pod, namespace })
    const containers = (podInfo.spec?.containers || []).map(c => c.name)
    if (containers.length <= 1) {
      const result = await coreApi.readNamespacedPodLog(baseParams)
      return res.json({ logs: typeof result === 'string' ? result : String(result) })
    }
    const parts = await Promise.all(containers.map(async c => {
      try {
        const r = await coreApi.readNamespacedPodLog({ ...baseParams, container: c })
        const text = (typeof r === 'string' ? r : String(r)).trim()
        return text ? text.split('\n').map(l => `[${c}] ${l}`).join('\n') : `[${c}] (no logs)`
      } catch (e) {
        return `[${c}] Error: ${e.message}`
      }
    }))
    res.json({ logs: parts.join('\n') })
  } catch (err) {
    res.json({ logs: `Error fetching logs: ${err.message}` })
  }
})

// Multi-pod logs for workloads (deployments, statefulsets, daemonsets, services, jobs)
app.get('/api/logs-multi/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  const { tail, sinceSeconds } = req.query
  const tailLines = tail && tail !== 'all' ? parseInt(tail) : undefined

  let pods = []
  if (resource === 'deployments') {
    const dep = latest.deployments.find(d => d.name === name && d.namespace === namespace)
    if (dep) pods = latest.pods.filter(p => p.ownerRef === dep.id)
  } else if (resource === 'statefulsets' || resource === 'daemonsets') {
    pods = latest.pods.filter(p => p.namespace === namespace && p.name.startsWith(`${name}-`))
  } else if (resource === 'services') {
    const svc = latest.services.find(s => s.name === name && s.namespace === namespace)
    if (svc?.selector && Object.keys(svc.selector).length) {
      pods = latest.pods.filter(p =>
        p.namespace === namespace &&
        Object.entries(svc.selector).every(([k, v]) => p.labels?.[k] === v)
      )
    }
  } else if (resource === 'jobs') {
    pods = latest.pods.filter(p => p.namespace === namespace && p.name.startsWith(`${name}-`))
  }

  if (latest.demoMode || !pods.length) {
    const mockLog = getMockLogs(namespace, name)
    const podNames = pods.length ? pods.map(p => p.name) : [`${name}-demo-abc12`]
    const combined = podNames.map(pn =>
      mockLog.split('\n').map(l => `[${pn}] ${l}`).join('\n')
    ).join('\n')
    return res.json({ logs: combined, podCount: podNames.length, pods: podNames })
  }

  try {
    const k8s = await import('@kubernetes/client-node')
    const kc = new k8s.KubeConfig()
    kc.loadFromDefault()
    const coreApi = kc.makeApiClient(k8s.CoreV1Api)

    const results = await Promise.allSettled(pods.map(async pod => {
      const params = {
        name: pod.name, namespace,
        ...(tailLines !== undefined && { tailLines }),
        ...(sinceSeconds && { sinceSeconds: parseInt(sinceSeconds) }),
      }
      const log = await coreApi.readNamespacedPodLog(params)
      return { pod: pod.name, log: typeof log === 'string' ? log : String(log) }
    }))

    const combined = results
      .filter(r => r.status === 'fulfilled')
      .map(({ value: { pod, log } }) =>
        log.trim() ? log.trim().split('\n').map(l => `[${pod}] ${l}`).join('\n') : `[${pod}] (no logs)`
      ).join('\n')

    res.json({ logs: combined, podCount: pods.length, pods: pods.map(p => p.name) })
  } catch (err) {
    res.json({ logs: `Error: ${err.message}`, podCount: 0, pods: [] })
  }
})

// Describe resource via kubectl
app.get('/api/describe/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockDescribe(resource, name, namespace) })
  }
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ output: '', error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout } = await execFileAsync(
      KUBECTL, ['describe', `${resource}/${name}`, ...nsArgs],
      { timeout: 15000 }
    )
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockDescribe(resource, name, namespace), error: err.message })
  }
})

// Get resource YAML via kubectl
app.get('/api/yaml/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockYaml(resource, name, namespace) })
  }
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ output: '', error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout } = await execFileAsync(
      KUBECTL, ['get', `${resource}/${name}`, ...nsArgs, '-o', 'yaml'],
      { timeout: 15000 }
    )
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockYaml(resource, name, namespace), error: err.message })
  }
})

// Get resource JSON via kubectl
app.get('/api/json/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    // Demo mode has no kubectl - derive JSON from the same mock YAML so the JSON
    // view mirrors the YAML view instead of returning an empty {}.
    try {
      const obj = yaml.load(getMockYaml(resource, name, namespace)) || {}
      return res.json({ output: JSON.stringify(obj, null, 2) })
    } catch (err) {
      return res.json({ output: '{}', error: err.message })
    }
  }
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ output: '', error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout } = await execFileAsync(
      KUBECTL, ['get', `${resource}/${name}`, ...nsArgs, '-o', 'json'],
      { timeout: 15000 }
    )
    res.json({ output: JSON.stringify(JSON.parse(stdout), null, 2) })
  } catch (err) {
    res.json({ output: '', error: err.message })
  }
})

// Apply edited YAML via kubectl apply
app.post('/api/edit', express.text({ type: 'text/plain', limit: '2mb' }), async (req, res) => {
  if (latest.demoMode) {
    return res.json({ ok: false, error: 'Edit not available in demo mode' })
  }
  if (!req.body?.trim()) {
    return res.status(400).json({ ok: false, error: 'No YAML content provided' })
  }
  try {
    const result = await new Promise((resolve, reject) => {
      const child = spawn(KUBECTL, ['apply', '-f', '-'])
      let out = '', err = ''
      child.stdout.on('data', d => out += d)
      child.stderr.on('data', d => err += d)
      child.on('close', code => {
        if (code === 0) resolve(out.trim())
        else reject(new Error((err || out || `exit code ${code}`).trim()))
      })
      child.on('error', reject)
      child.stdin.write(req.body)
      child.stdin.end()
    })
    res.json({ ok: true, output: result })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Delete resource via kubectl
app.delete('/api/delete/:resource/:namespace/:name', async (req, res) => {
  const { resource, namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ ok: false, error: 'Delete not available in demo mode' })
  }
  if (!validTarget(resource, namespace, name)) {
    return res.status(400).json({ ok: false, error: 'Invalid resource, namespace, or name' })
  }
  try {
    const nsArgs = namespace !== '_' ? ['-n', namespace] : []
    const { stdout, stderr } = await execFileAsync(
      KUBECTL, ['delete', `${resource}/${name}`, ...nsArgs, '--wait=false'],
      { timeout: 15000 }
    )
    res.json({ ok: true, output: (stdout || stderr).trim() })
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// Helm endpoints
app.get('/api/helm/values/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  const all = req.query.all === 'true'
  const revision = req.query.revision ? parseInt(req.query.revision, 10) : null
  if (latest.demoMode) {
    return res.json({ output: all ? getMockHelmAllValues(name) : getMockHelmValues(name) })
  }
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ output: '', error: 'Invalid release name or namespace' })
  }
  try {
    const flagArgs = all ? ['-a'] : []
    const revArgs = Number.isInteger(revision) ? ['--revision', String(revision)] : []
    const { stdout } = await execFileAsync(HELM, ['get', 'values', name, '-n', namespace, ...flagArgs, ...revArgs], { timeout: 15000 })
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: all ? getMockHelmAllValues(name) : getMockHelmValues(name), error: err.message })
  }
})

app.get('/api/helm/manifest/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockHelmManifest(name, namespace) })
  }
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ output: '', error: 'Invalid release name or namespace' })
  }
  try {
    const { stdout } = await execFileAsync(HELM, ['get', 'manifest', name, '-n', namespace], { timeout: 15000 })
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockHelmManifest(name, namespace), error: err.message })
  }
})

app.get('/api/helm/notes/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ output: getMockHelmNotes(name) })
  }
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ output: '', error: 'Invalid release name or namespace' })
  }
  try {
    const { stdout } = await execFileAsync(HELM, ['get', 'notes', name, '-n', namespace], { timeout: 15000 })
    res.json({ output: stdout })
  } catch (err) {
    res.json({ output: getMockHelmNotes(name), error: err.message })
  }
})

app.get('/api/helm/history/:namespace/:name', async (req, res) => {
  const { namespace, name } = req.params
  if (latest.demoMode) {
    return res.json({ history: getMockHelmHistory(name) })
  }
  if (!validId(name) || !validId(namespace)) {
    return res.status(400).json({ history: [], error: 'Invalid release name or namespace' })
  }
  try {
    const { stdout } = await execFileAsync(HELM, ['history', name, '-n', namespace, '-o', 'json'], { timeout: 15000 })
    const rows = JSON.parse(stdout).map(r => ({
      revision: r.revision,
      updated: r.updated,
      status: r.status,
      chart: r.chart,
      appVersion: r.app_version,
      description: r.description,
    }))
    res.json({ history: rows })
  } catch (err) {
    res.json({ history: getMockHelmHistory(name), error: err.message })
  }
})

app.post('/api/helm/rollback/:namespace/:name/:revision', async (req, res) => {
  const { namespace, name, revision } = req.params
  if (latest.demoMode) {
    return res.json({ ok: false, error: 'Rollback not available in demo mode' })
  }
  const rev = parseInt(revision, 10)
  if (!validId(name) || !validId(namespace) || !Number.isInteger(rev) || rev < 1) {
    return res.status(400).json({ ok: false, error: 'Invalid release, namespace, or revision' })
  }
  try {
    const { stdout, stderr } = await execFileAsync(
      HELM, ['rollback', name, String(rev), '-n', namespace],
      { timeout: 60000 }
    )
    res.json({ ok: true, output: (stdout || stderr).trim() })
    setTimeout(refresh, 2000)
  } catch (err) {
    res.json({ ok: false, error: err.message })
  }
})

// ── Port forwarding ─────────────────────────────────────────────────────────
// Tracks `kubectl port-forward` child processes started from the UI.
const portForwards = new Map() // id → { id, resource, namespace, name, localPort, remotePort, status, error, proc }
let pfSeq = 0
// Strip the child handle and normalize cluster-scoped namespaces ('_' → '') for the UI.
const pfPublic = ({ proc, namespace, ...rest }) => ({ ...rest, namespace: namespace === '_' ? '' : namespace })
const pfList = () => [...portForwards.values()].map(pfPublic)

app.get('/api/port-forward', (_, res) => {
  res.json({ forwards: pfList() })
})

app.post('/api/port-forward/:resource/:namespace/:name', (req, res) => {
  const { resource, namespace, name } = req.params
  const remotePort = parseInt(req.body?.remotePort)
  if (!remotePort) return res.status(400).json({ ok: false, error: 'remotePort is required' })
  const localPort = parseInt(req.body?.localPort) || remotePort
  const id = `pf-${++pfSeq}`

  // Demo mode: simulate an active forward so the UI is exercisable without a cluster.
  if (latest.demoMode) {
    const pf = { id, resource, namespace, name, localPort, remotePort, status: 'active', demo: true, error: null }
    portForwards.set(id, pf)
    return res.json({ ok: true, forward: pfPublic(pf) })
  }

  const nsFlag = namespace !== '_' ? ['-n', namespace] : []
  const args = ['port-forward', `${resource}/${name}`, `${localPort}:${remotePort}`, ...nsFlag, '--address', '127.0.0.1']
  const child = spawn(KUBECTL, args)
  const pf = { id, resource, namespace, name, localPort, remotePort, status: 'starting', error: null, proc: child }
  portForwards.set(id, pf)
  child.stdout.on('data', d => { if (/Forwarding from/.test(String(d))) pf.status = 'active' })
  child.stderr.on('data', d => {
    const msg = String(d)
    if (/Forwarding from/.test(msg)) pf.status = 'active'
    else { pf.error = msg.trim(); if (pf.status !== 'active') pf.status = 'error' }
  })
  child.on('exit', code => { pf.status = 'stopped'; if (code && !pf.error) pf.error = `kubectl exited (${code})` })
  child.on('error', err => { pf.status = 'error'; pf.error = err.message })
  res.json({ ok: true, forward: pfPublic(pf) })
})

app.delete('/api/port-forward/:id', (req, res) => {
  const pf = portForwards.get(req.params.id)
  if (!pf) return res.json({ ok: false, error: 'not found' })
  try { pf.proc?.kill() } catch { /* already gone */ }
  portForwards.delete(req.params.id)
  res.json({ ok: true })
})

// Kill all forwards when the server shuts down so ports are released.
for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => {
    for (const pf of portForwards.values()) { try { pf.proc?.kill() } catch { /* noop */ } }
    process.exit(0)
  })
}

app.get('/api/crd/:group/:version/:plural', async (req, res) => {
  const { group, version, plural } = req.params
  if (latest.demoMode) {
    return res.json({ items: getMockCrdResources(group, version, plural) })
  }
  const items = await fetchCrdInstances(group, version, plural)
  res.json({ items })
})

// ── RBAC: policy + self access review (task 94) ──────────────────────────────
// Map the frontend resource key to the singular kind fetchPolicy/getMockPolicy expect.
const RBAC_KINDS = {
  roles: 'role', clusterroles: 'clusterrole', rolebindings: 'rolebinding',
  clusterrolebindings: 'clusterrolebinding', serviceaccounts: 'serviceaccount',
}

// Effective policy for an RBAC object (k9s-style "what can this do" view).
app.get('/api/rbac/policy/:kind/:namespace/:name', async (req, res) => {
  const { kind, namespace, name } = req.params
  const k = RBAC_KINDS[kind] || kind
  const ns = namespace === '_' ? '' : namespace
  if (latest.demoMode) return res.json(getMockPolicy(k, name, ns))
  try {
    res.json(await fetchPolicy(k, ns, name))
  } catch (err) {
    res.json({ kind: k, name, namespace: ns, sources: [], error: err.message })
  }
})

// Self access review for the dashboard's own identity (the `kubectl auth can-i --list`
// mechanism). Namespace-scoped, like `auth can-i --list -n <ns>`.
app.get('/api/rbac/can-i', async (req, res) => {
  const namespace = req.query.namespace || 'default'
  if (latest.demoMode) return res.json(getMockWhoAmI(namespace))
  try {
    res.json(await whoAmI(namespace))
  } catch (err) {
    res.json({ user: null, groups: [], namespace, rules: [], nonResourceRules: [], error: err.message })
  }
})

// SPA fallback - serve index.html for any non-API route.
// /ws is the WebSocket endpoint: a real upgrade is handled before Express, but if a
// proxy strips the Upgrade header the request lands here - return 426 instead of HTML
// so it fails cleanly (the client then relies on its HTTP polling fallback).
if (existsSync(distDir)) {
  app.get('*', (req, res) => {
    if (req.path === '/ws') return res.status(426).send('Upgrade Required')
    if (!req.path.startsWith('/api')) {
      res.sendFile(join(distDir, 'index.html'))
    }
  })
}

const PORT = process.env.PORT || 3001
server.listen(PORT, '0.0.0.0', () => {
  const mode = existsSync(distDir) ? 'serving built frontend' : 'API only (run npm run build in client/)'
  console.log(`\n  mezza9 → http://localhost:${PORT}  [${mode}]`)
  if (AUTH_GENERATED) {
    // Jupyter-style: surface the freshly minted token + a one-click URL (the SPA reads ?token=
    // from the address bar on load, stores it, then strips it). Note it changes every restart.
    console.log('  ✓ auth: token gate ENABLED (auto-generated this run; changes on restart)')
    console.log(`    token: ${AUTH_TOKEN}`)
    console.log(`    open:  http://localhost:${PORT}/?token=${AUTH_TOKEN}\n`)
  } else if (AUTH_ENABLED) {
    console.log('  ✓ auth: token gate ENABLED (requests need MEZZ_TOKEN)\n')
  } else {
    console.warn(
      '  ⚠ auth: DISABLED - no MEZZ_TOKEN set. Anyone who can reach this port has full cluster\n' +
      '    control (delete / edit / exec / port-forward). Set MEZZ_TOKEN, or front mezza9 with an\n' +
      '    auth proxy + TLS (see README). Keep the bind on loopback until one of those is in place.\n'
    )
  }
  refresh()
  setInterval(refresh, 5000)
})

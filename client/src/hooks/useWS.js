import { useEffect } from 'react'
import { useStore } from '../store'
import { withToken } from '../lib/auth'

function getWsUrl() {
  // withToken appends the shared token (task 97) - browsers can't set headers on a WebSocket, so
  // the upgrade carries it in the query string. No-op when auth is off / not logged in. Applied to
  // the VITE_WS_URL override too, else a custom-backend build would connect token-less and 401.
  if (import.meta.env.VITE_WS_URL) return withToken(import.meta.env.VITE_WS_URL)
  // Always connect through the same host - Vite proxies /ws to the backend.
  // This works whether accessed via localhost, devcontainer forwarding, or tunnel.
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return withToken(`${proto}//${window.location.host}/ws`)
}

export function useWS() {
  const setData = useStore(s => s.setData)
  const setConnected = useStore(s => s.setConnected)
  // Stay disconnected until authenticated (task 97): no WS, no polling, no /api/data fetch
  // before a valid token is held. Re-runs when authed flips, so login connects immediately.
  const authed = useStore(s => s.authed)

  useEffect(() => {
    if (!authed) return
    let ws
    let retryTimer
    let pollTimer
    let dead = false

    const loadData = () =>
      fetch('/api/data').then(r => r.json()).then(setData).catch(() => {})

    // HTTP polling fallback. The WebSocket upgrade doesn't survive every proxy/tunnel
    // (VS Code port-forward, ingress, etc. may strip the Upgrade header), which would
    // otherwise leave the UI frozen on the initial snapshot. The server refreshes
    // `latest` every 5s, so polling /api/data keeps data fresh whenever the WS isn't
    // carrying updates. The WS, when it connects, is preferred (lower latency) and
    // stops the poll.
    function startPolling() {
      if (pollTimer || dead) return
      pollTimer = setInterval(loadData, 5000)
    }
    function stopPolling() {
      clearInterval(pollTimer)
      pollTimer = null
    }

    function connect() {
      if (dead) return
      ws = new WebSocket(getWsUrl())
      ws.onopen = () => { setConnected(true); stopPolling() }
      ws.onclose = () => {
        setConnected(false)
        startPolling()                       // WS down → keep data fresh via polling
        retryTimer = setTimeout(connect, 3000)
      }
      ws.onerror = () => ws.close()
      ws.onmessage = (e) => {
        try {
          const msg = JSON.parse(e.data)
          if (msg.type === 'update') setData(msg.data)
        } catch {}
      }
    }

    loadData()      // immediate snapshot on mount
    startPolling()  // poll until the WS opens (cleared in onopen); covers WS-never-connects
    connect()

    return () => {
      dead = true
      clearTimeout(retryTimer)
      stopPolling()
      ws?.close()
    }
  }, [authed])
}

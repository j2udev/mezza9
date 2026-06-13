import { useEffect } from 'react'
import { useStore } from '../store'

function getWsUrl() {
  if (import.meta.env.VITE_WS_URL) return import.meta.env.VITE_WS_URL
  // Always connect through the same host — Vite proxies /ws to the backend.
  // This works whether accessed via localhost, devcontainer forwarding, or tunnel.
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${window.location.host}/ws`
}

export function useWS() {
  const setData = useStore(s => s.setData)
  const setConnected = useStore(s => s.setConnected)

  useEffect(() => {
    // HTTP fetch: load current data immediately on mount
    fetch('/api/data')
      .then(r => r.json())
      .then(data => setData(data))
      .catch(err => console.error('[useWS] fetch /api/data failed:', err))

    let ws
    let retryTimer
    let dead = false

    function connect() {
      if (dead) return
      ws = new WebSocket(getWsUrl())
      ws.onopen = () => setConnected(true)
      ws.onclose = () => {
        setConnected(false)
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

    connect()
    return () => {
      dead = true
      clearTimeout(retryTimer)
      ws?.close()
    }
  }, [])
}

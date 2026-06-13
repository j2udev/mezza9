import { useEffect, useState, useCallback, useRef } from 'react'
import { useStore } from '../store'

const CLUSTER_SCOPED = new Set(['nodes', 'pvs', 'namespaces', 'crds'])

// Ports worth suggesting for the object being forwarded. Services expose a "80/TCP, 443/TCP"
// string; pods/deployments/statefulsets carry a containerPorts array from the pod template.
function portSuggestions(resource, item) {
  if (resource === 'services') {
    return [...new Set(String(item?.ports || '').match(/\d+/g) || [])]
  }
  return [...new Set((item?.containerPorts || []).map(String))]
}

const ACCENT = '#ffaa00'

export function PortForwardModal() {
  const pfModal          = useStore(s => s.pfModal)
  const closePortForward = useStore(s => s.closePortForward)
  const demoMode         = useStore(s => s.demoMode)

  const [forwards,  setForwards]  = useState([])
  const [remote,    setRemote]    = useState('')
  const [local,     setLocal]     = useState('')
  const [busy,      setBusy]      = useState(false)
  const [error,     setError]     = useState(null)
  const remoteRef = useRef()

  const refresh = useCallback(async () => {
    try {
      const res  = await fetch('/api/port-forward')
      const data = await res.json()
      setForwards(data.forwards || [])
    } catch { /* ignore */ }
  }, [])

  const suggestions = pfModal ? portSuggestions(pfModal.resource, pfModal.item) : []

  // Reset + load on open
  useEffect(() => {
    if (!pfModal) return
    const rp = portSuggestions(pfModal.resource, pfModal.item)[0] || ''
    setRemote(rp); setLocal(rp); setError(null)
    refresh()
    setTimeout(() => remoteRef.current?.focus(), 30)
  }, [pfModal, refresh])

  const start = useCallback(async () => {
    if (!pfModal || !remote) return
    setBusy(true); setError(null)
    const { resource, item } = pfModal
    const ns = CLUSTER_SCOPED.has(resource) ? '_' : (item.namespace || '_')
    try {
      const res  = await fetch(`/api/port-forward/${resource}/${ns}/${item.name}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ localPort: local || remote, remotePort: remote }),
      })
      const data = await res.json()
      if (!data.ok) setError(data.error || 'Failed to start port-forward')
      await refresh()
      setTimeout(refresh, 600) // pick up active status once kubectl binds
    } catch (err) { setError(err.message) }
    finally       { setBusy(false) }
  }, [pfModal, remote, local, refresh])

  const stop = useCallback(async (id) => {
    try { await fetch(`/api/port-forward/${id}`, { method: 'DELETE' }) } catch { /* ignore */ }
    refresh()
  }, [refresh])

  if (!pfModal) return null
  const { item, resource } = pfModal
  const statusColor = s => s === 'active' ? '#00ffaa' : s === 'error' || s === 'stopped' ? '#ff4455' : '#ffcc00'

  return (
    <div
      onClick={closePortForward}
      style={{
        position: 'absolute', inset: 0, zIndex: 55,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(1,5,14,0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(560px, 94vw)', maxHeight: '80vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(2,10,22,0.98)',
          border: `1px solid ${ACCENT}30`, boxShadow: `0 0 50px ${ACCENT}12`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: `1px solid ${ACCENT}18`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>PORT-FORWARD</span>
            <span style={{ fontSize: 11, color: '#3a6a8a' }}>
              {resource.slice(0, -1)} / {item.name}
              {item.namespace && <span style={{ color: '#2a5070' }}> · {item.namespace}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#1e3a52' }}>ESC · close</span>
            <button onClick={closePortForward}
              style={{ fontSize: 18, lineHeight: 1, color: '#3a5a7a', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
              onMouseEnter={e => e.target.style.color = '#c0d8f0'}
              onMouseLeave={e => e.target.style.color = '#3a5a7a'}
            >×</button>
          </div>
        </div>

        {/* New forward form */}
        <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'flex-end', gap: 12, flexShrink: 0 }}>
          <PortInput label="LOCAL"  value={local}  onChange={setLocal}  onEnter={start} placeholder={remote || 'auto'} />
          <span style={{ color: '#3a5a7a', fontSize: 16, paddingBottom: 4 }}>→</span>
          <PortInput label="REMOTE" value={remote} onChange={setRemote} onEnter={start} inputRef={remoteRef} placeholder="port" />
          <button
            onClick={start} disabled={busy || !remote}
            style={{
              fontSize: 11, padding: '5px 16px', borderRadius: 4, marginBottom: 1,
              cursor: busy || !remote ? 'default' : 'pointer',
              color: busy || !remote ? '#5a6a3a' : '#020818',
              background: busy || !remote ? 'rgba(255,170,0,0.15)' : ACCENT,
              border: `1px solid ${ACCENT}`, fontFamily: 'inherit', fontWeight: 'bold',
              transition: 'all 0.15s',
            }}
          >{busy ? 'Starting…' : 'Forward'}</button>
        </div>
        {/* Port suggestions from the object */}
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '0 16px 12px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: 9, color: '#3a6a8a', letterSpacing: '0.08em', textTransform: 'uppercase' }}>ports:</span>
            {suggestions.map(p => {
              const active = remote === p
              return (
                <button key={p} onClick={() => { setRemote(p); setLocal(p) }} style={{
                  fontSize: 10, padding: '2px 9px', borderRadius: 3, cursor: 'pointer', fontFamily: 'monospace',
                  color: active ? '#020818' : ACCENT,
                  background: active ? ACCENT : 'rgba(255,170,0,0.08)',
                  border: `1px solid ${active ? ACCENT : 'rgba(255,170,0,0.3)'}`,
                  fontWeight: active ? 'bold' : 'normal', transition: 'all 0.12s',
                }}>{p}</button>
              )
            })}
          </div>
        )}
        {error && <div style={{ padding: '0 16px 8px', fontSize: 10, color: '#ff6677' }}>{error}</div>}
        {demoMode && <div style={{ padding: '0 16px 8px', fontSize: 10, color: '#ffcc0099' }}>demo mode — forwards are simulated</div>}

        {/* Active forwards */}
        <div style={{ borderTop: `1px solid ${ACCENT}12`, overflowY: 'auto', flex: 1 }}>
          <div style={{ padding: '8px 16px 4px', fontSize: 9, letterSpacing: '0.1em', color: '#3a6a8a', textTransform: 'uppercase' }}>
            Active forwards ({forwards.length})
          </div>
          {forwards.length === 0 && (
            <div style={{ padding: '4px 16px 14px', fontSize: 11, color: '#3a5a7a', fontStyle: 'italic' }}>None running.</div>
          )}
          {forwards.map(f => (
            <div key={f.id} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '6px 16px',
              borderTop: '1px solid rgba(255,255,255,0.03)',
            }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusColor(f.status), boxShadow: `0 0 6px ${statusColor(f.status)}`, flexShrink: 0 }} />
              {f.status === 'active'
                ? <a href={`http://127.0.0.1:${f.localPort}`} target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: '#00d4ff', fontFamily: 'monospace', textDecoration: 'none' }}>
                    127.0.0.1:{f.localPort}
                  </a>
                : <span style={{ fontSize: 11, color: '#7a9ab8', fontFamily: 'monospace' }}>127.0.0.1:{f.localPort}</span>}
              <span style={{ fontSize: 11, color: '#3a5a7a', fontFamily: 'monospace' }}>→ {f.remotePort}</span>
              <span style={{ fontSize: 10, color: '#4a6a8a', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.resource.slice(0, -1)}/{f.name}
                <span style={{ color: statusColor(f.status), marginLeft: 6 }}>{f.status}</span>
                {f.error && <span style={{ color: '#ff667799', marginLeft: 6 }}>{f.error}</span>}
              </span>
              <button onClick={() => stop(f.id)} style={{
                fontSize: 10, padding: '2px 10px', borderRadius: 3, cursor: 'pointer',
                color: '#ff8899', background: 'rgba(255,68,85,0.08)', border: '1px solid rgba(255,68,85,0.3)',
                fontFamily: 'inherit',
              }}>Stop</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function PortInput({ label, value, onChange, onEnter, placeholder, inputRef }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
      <span style={{ fontSize: 9, color: '#3a6a8a', letterSpacing: '0.08em' }}>{label}</span>
      <input
        ref={inputRef}
        value={value}
        onChange={e => onChange(e.target.value.replace(/[^0-9]/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter() } }}
        placeholder={placeholder}
        inputMode="numeric"
        style={{
          width: 80, background: 'rgba(255,170,0,0.06)', border: '1px solid rgba(255,170,0,0.25)',
          color: '#ffd47a', fontSize: 12, padding: '4px 8px', borderRadius: 4,
          fontFamily: 'monospace', outline: 'none',
        }}
      />
    </label>
  )
}

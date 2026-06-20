import { useEffect, useRef, useState } from 'react'
import { alpha } from '../theme'
import { useStore } from '../store'

const ACCENT = 'var(--mz-accent-2)'

// Quick-pick debug images. busybox = tiny default; netshoot = full network toolkit; the
// others are common go-tos. Free text always wins (the input is editable).
const PRESETS = [
  { img: 'busybox:1.36',       label: 'busybox' },
  { img: 'nicolaka/netshoot',  label: 'netshoot' },
  { img: 'alpine:3.20',        label: 'alpine' },
  { img: 'ubuntu:24.04',       label: 'ubuntu' },
]

// kubectl-debug-style dialog (#82): pick a debug image + the container whose process
// namespace to share, inject an ephemeral container server-side, then hand off to the shell
// terminal (ExecModal) bound to that container. Useful for distroless pods with no shell.
export function DebugModal() {
  const debugModal  = useStore(s => s.debugModal)
  const closeDebug  = useStore(s => s.closeDebug)
  const debugToShell = useStore(s => s.debugToShell)

  const [image, setImage]   = useState(PRESETS[0].img)
  const [target, setTarget] = useState('')
  const [status, setStatus] = useState('idle') // 'idle' | 'starting' | 'error'
  const [error, setError]   = useState('')
  const inputRef = useRef(null)

  // Reset form each time the dialog opens for a new pod.
  useEffect(() => {
    if (!debugModal) return
    setImage(PRESETS[0].img)
    setTarget(debugModal.target || '')
    setStatus('idle')
    setError('')
    // Focus the image input once mounted.
    const t = setTimeout(() => inputRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [debugModal])

  if (!debugModal) return null
  const { namespace, pod, containers = [], label } = debugModal

  const start = async () => {
    const img = image.trim()
    if (!img || status === 'starting') return
    setStatus('starting'); setError('')
    try {
      const res = await fetch(`/api/debug/${encodeURIComponent(namespace || 'default')}/${encodeURIComponent(pod)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: img, target: target || undefined }),
      })
      const data = await res.json()
      if (!res.ok || data.error) { setStatus('error'); setError(data.error || `Request failed (${res.status})`); return }
      // Container is Running - hand the terminal a debug-tagged label so it's obvious.
      debugToShell({ namespace, pod, container: data.container, label: `${label} · debug` })
    } catch (e) {
      setStatus('error'); setError(e.message || 'Failed to start debug container.')
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeDebug(); return }
    // Enter starts only from the image text input. When a preset/container chip or the
    // Start button has focus, let that control handle its own Enter/Space (so tabbing to a
    // container and pressing Enter selects it instead of jumping straight to Start).
    if (e.key === 'Enter' && e.target === inputRef.current) { e.preventDefault(); start() }
  }

  const busy = status === 'starting'

  return (
    <div
      onClick={closeDebug}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: 'min(560px, 94vw)', display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: `1px solid ${alpha(ACCENT, 28)}`, boxShadow: `0 0 50px ${alpha(ACCENT, 13)}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: `1px solid ${alpha(ACCENT, 9)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>DEBUG</span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
              {namespace && <span style={{ color: 'var(--mz-text-faint)' }}> · {namespace}</span>}
            </span>
          </div>
          <button onClick={closeDebug}
            style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Image */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>DEBUG IMAGE</label>
            <input
              ref={inputRef}
              value={image}
              disabled={busy}
              onChange={e => setImage(e.target.value)}
              spellCheck={false}
              style={{
                fontFamily: 'monospace', fontSize: 13, padding: '7px 9px', borderRadius: 4,
                color: 'var(--mz-text)', background: 'var(--mz-bg)',
                border: `1px solid ${alpha(ACCENT, 30)}`, outline: 'none',
              }}
            />
            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
              {PRESETS.map(p => {
                const active = image === p.img
                return (
                  <button key={p.img} disabled={busy} onClick={() => setImage(p.img)}
                    onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${alpha(ACCENT, 45)}`}
                    onBlur={e => e.target.style.boxShadow = 'none'}
                    style={{
                      fontSize: 10, padding: '2px 8px', borderRadius: 3, cursor: busy ? 'default' : 'pointer', fontFamily: 'monospace',
                      color: active ? 'var(--mz-bg)' : ACCENT,
                      background: active ? ACCENT : alpha(ACCENT, 8),
                      border: `1px solid ${active ? ACCENT : alpha(ACCENT, 30)}`,
                      outline: 'none',
                      fontWeight: active ? 'bold' : 'normal', transition: 'box-shadow 0.12s, background 0.12s, color 0.12s',
                    }}>{p.label}</button>
                )
              })}
            </div>
          </div>

          {/* Target container - only meaningful when the pod has containers to share with. */}
          {containers.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>
                SHARE PROCESS NAMESPACE WITH
              </label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {containers.map(c => {
                  const active = target === c
                  return (
                    <button key={c} disabled={busy} onClick={() => setTarget(active ? '' : c)}
                      onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${alpha(ACCENT, 45)}`}
                      onBlur={e => e.target.style.boxShadow = 'none'}
                      style={{
                        fontSize: 11, padding: '3px 9px', borderRadius: 3, cursor: busy ? 'default' : 'pointer', fontFamily: 'monospace',
                        color: active ? 'var(--mz-bg)' : 'var(--mz-text-dim)',
                        background: active ? ACCENT : alpha(ACCENT, 6),
                        border: `1px solid ${active ? ACCENT : alpha(ACCENT, 22)}`,
                        outline: 'none',
                        fontWeight: active ? 'bold' : 'normal', transition: 'box-shadow 0.12s, background 0.12s, color 0.12s',
                      }}>{c}</button>
                  )
                })}
              </div>
              <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>
                Optional - lets the debugger see the target container's processes (and /proc/&lt;pid&gt;/root).
              </span>
            </div>
          )}

          {/* Error */}
          {status === 'error' && error && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--mz-danger-2)',
              background: alpha('var(--mz-danger)', 10), border: `1px solid ${alpha('var(--mz-danger)', 30)}`,
              borderRadius: 4, padding: '7px 9px', whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto',
            }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: `1px solid ${alpha(ACCENT, 9)}`,
        }}>
          <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>
            {busy ? 'injecting ephemeral container, waiting for it to start…' : 'enter · start  ·  esc · cancel'}
          </span>
          <button onClick={start} disabled={busy || !image.trim()}
            style={{
              fontSize: 11, fontWeight: 'bold', letterSpacing: '0.05em', padding: '5px 14px', borderRadius: 4,
              cursor: busy || !image.trim() ? 'default' : 'pointer',
              color: busy ? 'var(--mz-text-faint)' : 'var(--mz-bg)',
              background: busy ? alpha(ACCENT, 20) : ACCENT,
              border: `1px solid ${ACCENT}`, opacity: !image.trim() ? 0.5 : 1, transition: 'all 0.12s',
            }}>{busy ? 'Starting…' : 'Start debug'}</button>
        </div>
      </div>
    </div>
  )
}

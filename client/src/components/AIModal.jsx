import { useEffect, useRef, useState } from 'react'
import { alpha } from '../theme'
import { useStore } from '../store'

const ACCENT = 'var(--mz-info)'
const MAX_TURNS = 3

export function AIModal() {
  const aiModal      = useStore(s => s.aiModal)
  const closeAIModal = useStore(s => s.closeAIModal)

  const [history, setHistory] = useState([])     // full {role, content} array, as echoed back by the server
  const [turns, setTurns]     = useState(0)       // user follow-ups sent so far (capped at MAX_TURNS)
  const [loading, setLoading] = useState(false)
  const [error, setError]     = useState(null)
  const [input, setInput]     = useState('')
  const inputRef = useRef()
  const bodyRef  = useRef()

  // On open: reset local state and fire the seed request (empty history = initial analysis).
  useEffect(() => {
    if (!aiModal) return
    setHistory([]); setTurns(0); setError(null); setInput(''); setLoading(true)
    const { resource, namespace, name, findingId } = aiModal
    fetch('/api/ai/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resource, namespace, name, findingId, history: [] }),
    })
      .then(r => r.json())
      .then(data => {
        if (data.error) setError(data.error)
        else setHistory(data.messages || [])
      })
      .catch(err => setError(err.message))
      .finally(() => setLoading(false))
  }, [aiModal])

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [history, loading])

  const send = async () => {
    if (!input.trim() || loading || turns >= MAX_TURNS || !aiModal) return
    const { resource, namespace, name, findingId } = aiModal
    const nextHistory = [...history, { role: 'user', content: input.trim() }]
    setHistory(nextHistory)
    setInput('')
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resource, namespace, name, findingId, history: nextHistory }),
      })
      const data = await res.json()
      if (data.error) setError(data.error)
      else { setHistory(data.messages || nextHistory); setTurns(t => t + 1) }
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (!aiModal) return null
  const { resource, namespace, name, seedTitle } = aiModal
  const capped = turns >= MAX_TURNS

  // The seed (first user message) embeds describe/yaml/logs context - not worth showing
  // verbatim in the transcript, so the visible conversation starts at the first assistant reply.
  const visible = history.filter((m, i) => !(i === 0 && m.role === 'user'))

  return (
    <div
      onClick={closeAIModal}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(720px, 94vw)', height: 'min(560px, 86vh)', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: `1px solid ${alpha(ACCENT, 28)}`, boxShadow: `0 0 50px ${alpha(ACCENT, 13)}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: `1px solid ${alpha(ACCENT, 9)}`, flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>AI ANALYZE</span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {resource.slice(0, -1)} / {seedTitle || name}
              {namespace && <span style={{ color: 'var(--mz-text-faint)' }}> · {namespace}</span>}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>ESC · close</span>
            <button onClick={closeAIModal}
              style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
              onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
              onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
            >×</button>
          </div>
        </div>

        {/* Conversation */}
        <div ref={bodyRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
          {visible.map((m, i) => (
            <div key={i} style={{ marginBottom: 14 }}>
              <div style={{
                fontSize: 9, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4,
                color: m.role === 'user' ? 'var(--mz-accent-2)' : ACCENT,
              }}>
                {m.role === 'user' ? 'you' : 'ai'}
              </div>
              <div style={{ fontSize: 12, color: 'var(--mz-text)', whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic' }}>thinking…</div>
          )}
          {error && (
            <div style={{ fontSize: 11, color: 'var(--mz-danger-2)', marginTop: 6 }}>{error}</div>
          )}
        </div>

        {/* Footer: capped follow-up input */}
        <div style={{ borderTop: `1px solid ${alpha(ACCENT, 9)}`, padding: '10px 16px', flexShrink: 0 }}>
          {capped ? (
            <div style={{ fontSize: 11, color: 'var(--mz-text-faint)', fontStyle: 'italic' }}>
              Follow-up limit reached ({MAX_TURNS} max).
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                ref={inputRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); send() } }}
                placeholder="Ask a follow-up about this..."
                disabled={loading || !history.length}
                style={{
                  flex: 1, background: 'rgba(var(--mz-info-rgb),0.06)', border: `1px solid ${alpha(ACCENT, 25)}`,
                  color: 'var(--mz-text)', fontSize: 12, padding: '6px 10px', borderRadius: 4,
                  fontFamily: 'inherit', outline: 'none',
                }}
              />
              <button
                onClick={send} disabled={loading || !input.trim() || !history.length}
                style={{
                  fontSize: 11, padding: '5px 16px', borderRadius: 4,
                  cursor: (loading || !input.trim()) ? 'default' : 'pointer',
                  color: (loading || !input.trim()) ? 'var(--mz-text-muted)' : 'var(--mz-bg)',
                  background: (loading || !input.trim()) ? 'rgba(var(--mz-info-rgb),0.15)' : ACCENT,
                  border: `1px solid ${ACCENT}`, fontFamily: 'inherit', fontWeight: 'bold',
                  transition: 'all 0.15s',
                }}
              >Send</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

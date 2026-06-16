import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { THEMES } from '../theme'

const LIST = Object.values(THEMES)

// Theme switcher (#14). Opened with Shift+T or `:theme`. j/k navigates and LIVE-PREVIEWS
// each theme as you move (so you can experiment, per the issue); Enter/click commits and
// closes; Esc reverts to whatever was active when the picker opened.
export function ThemePicker() {
  const open       = useStore(s => s.themePickerOpen)
  const themeId    = useStore(s => s.themeId)
  const setTheme   = useStore(s => s.setTheme)
  const closePicker = useStore(s => s.closeThemePicker)

  const [idx, setIdx]    = useState(0)
  const originalRef      = useRef(themeId)
  const selectedRef      = useRef()

  // On open: remember the active theme (to revert on Esc) and start the cursor on it.
  useEffect(() => {
    if (!open) return
    originalRef.current = themeId
    setIdx(Math.max(0, LIST.findIndex(t => t.id === themeId)))
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { selectedRef.current?.scrollIntoView({ block: 'nearest' }) }, [idx])

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape') {
        e.preventDefault(); e.stopPropagation()
        setTheme(originalRef.current) // revert preview
        closePicker(); return
      }
      if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation()
        setTheme(LIST[idx].id); closePicker(); return
      }
      if (e.key === 'j' || e.key === 'ArrowDown') {
        e.preventDefault(); e.stopPropagation()
        setIdx(i => { const n = Math.min(i + 1, LIST.length - 1); setTheme(LIST[n].id); return n }); return
      }
      if (e.key === 'k' || e.key === 'ArrowUp') {
        e.preventDefault(); e.stopPropagation()
        setIdx(i => { const n = Math.max(i - 1, 0); setTheme(LIST[n].id); return n }); return
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, idx, setTheme, closePicker])

  if (!open) return null

  return (
    <div
      onClick={() => { setTheme(originalRef.current); closePicker() }}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(460px, 92vw)', maxHeight: '80vh', overflowY: 'auto',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: '1px solid rgba(var(--mz-accent-rgb),0.28)', boxShadow: '0 0 50px rgba(var(--mz-accent-rgb),0.12)',
        }}
      >
        <div style={{
          padding: '12px 18px', borderBottom: '1px solid rgba(var(--mz-accent-rgb),0.18)',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.16em', color: 'var(--mz-accent)' }}>
            THEME
          </span>
          <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>j/k preview · enter apply · esc cancel</span>
        </div>

        <div style={{ padding: '10px 12px' }}>
          {LIST.map((t, i) => {
            const selected = i === idx
            const active = t.id === themeId
            return (
              <div key={t.id}
                ref={selected ? selectedRef : null}
                onClick={() => { setTheme(t.id); closePicker() }}
                onMouseEnter={() => { setIdx(i); setTheme(t.id) }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 12px', borderRadius: 6, cursor: 'pointer',
                  background: selected ? 'rgba(var(--mz-accent-rgb),0.1)' : 'transparent',
                  border: `1px solid ${selected ? 'rgba(var(--mz-accent-rgb),0.35)' : 'transparent'}`,
                  marginBottom: 4,
                }}
              >
                {/* Swatch */}
                <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                  {t.swatch.map((c, j) => (
                    <span key={j} style={{
                      width: 16, height: 16, borderRadius: '50%', background: c,
                      boxShadow: `0 0 7px ${c}`, border: '1px solid rgba(255,255,255,0.18)',
                    }} />
                  ))}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 13, color: 'var(--mz-text-bright)', fontWeight: 'bold' }}>{t.name}</span>
                    {active && <span style={{ fontSize: 9, letterSpacing: '0.1em', color: 'var(--mz-ok)' }}>● ACTIVE</span>}
                  </div>
                  <div style={{ fontSize: 10.5, color: 'var(--mz-text-dim)', marginTop: 2 }}>{t.blurb}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

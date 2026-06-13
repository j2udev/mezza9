import { useEffect, useState, useRef, useMemo, Fragment } from 'react'
import { useStore } from '../store'
import { applicableActions } from '../actions'

// Scalable actions palette (opened with `a`). Lists every action applicable to the
// selected object — including destructive ones — grouped, filterable, keyboard-driven.
// Driven entirely by the actions.js registry, so new actions appear here for free.
export function ActionMenu() {
  const open           = useStore(s => s.actionMenuOpen)
  const close          = useStore(s => s.closeActionMenu)
  const activeResource = useStore(s => s.activeResource)
  const selectedId     = useStore(s => s.selectedId)
  const markedCount    = useStore(s => s.selectedIds.size)
  const items = useStore(s =>
    s.drilldownItems
      || (s.activeResource.startsWith('cr:') ? (s.crdResources[s.activeResource.slice(3)] || []) : (s[s.activeResource] || []))
  )

  const [filter, setFilter] = useState('')
  const [idx, setIdx]       = useState(0)
  const inputRef = useRef()

  const item = items.find(i => i.id === selectedId)

  const actions = useMemo(() => {
    const all = applicableActions(activeResource)
    if (!filter) return all
    const q = filter.toLowerCase()
    return all.filter(a => a.label.toLowerCase().includes(q) || a.id.includes(q))
  }, [activeResource, filter])

  useEffect(() => { if (open) { setFilter(''); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30) } }, [open])
  useEffect(() => { setIdx(0) }, [filter])

  const run = (a) => { close(); a.run(useStore.getState()) }

  useEffect(() => {
    if (!open) return
    const onKey = e => {
      if (e.key === 'Escape')    { e.preventDefault(); e.stopPropagation(); close(); return }
      if (e.key === 'ArrowDown') { e.preventDefault(); e.stopPropagation(); setIdx(i => Math.min(i + 1, actions.length - 1)); return }
      if (e.key === 'ArrowUp')   { e.preventDefault(); e.stopPropagation(); setIdx(i => Math.max(i - 1, 0)); return }
      if (e.key === 'Enter')     { e.preventDefault(); e.stopPropagation(); if (actions[idx]) run(actions[idx]); return }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, actions, idx, close])

  if (!open || !item) return null
  const label = activeResource.startsWith('cr:') ? activeResource.slice(3).split('/').pop() : activeResource

  return (
    <div
      onClick={close}
      style={{
        position: 'absolute', inset: 0, zIndex: 58,
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center', paddingTop: '12vh',
        background: 'rgba(1,5,14,0.8)', backdropFilter: 'blur(6px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(440px, 92vw)', maxHeight: '70vh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(2,10,22,0.99)',
          border: '1px solid rgba(0,212,255,0.28)', boxShadow: '0 0 50px rgba(0,212,255,0.14)',
        }}
      >
        {/* Header + filter */}
        <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(0,212,255,0.14)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.14em', color: '#00d4ff' }}>ACTIONS</span>
            <span style={{ fontSize: 10, color: '#3a6a8a' }}>
              {label.slice(0, -1)} / {item.name}
              {markedCount > 0 && <span style={{ color: '#ffcc44', marginLeft: 6 }}>· {markedCount} marked</span>}
            </span>
          </div>
          <input
            ref={inputRef}
            value={filter}
            onChange={e => setFilter(e.target.value)}
            placeholder="filter actions…"
            style={{
              width: '100%', background: 'rgba(0,212,255,0.06)', border: '1px solid rgba(0,212,255,0.18)',
              color: '#c0e8ff', fontSize: 12, padding: '4px 8px', borderRadius: 4,
              fontFamily: 'inherit', outline: 'none',
            }}
          />
        </div>

        {/* Action list */}
        <div style={{ overflowY: 'auto', padding: '6px 0' }}>
          {actions.length === 0 && (
            <div style={{ padding: '10px 16px', fontSize: 11, color: '#3a5a7a', fontStyle: 'italic' }}>No matching actions.</div>
          )}
          {actions.map((a, i) => {
            const showGroup = i === 0 || actions[i - 1].group !== a.group
            const selected = i === idx
            return (
              <Fragment key={a.id}>
                {showGroup && (
                  <div style={{ padding: '6px 16px 2px', fontSize: 9, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#3a6a8a' }}>
                    {a.group}
                  </div>
                )}
                <div
                  onClick={() => run(a)}
                  onMouseEnter={() => setIdx(i)}
                  style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '6px 16px', cursor: 'pointer',
                    background: selected ? `${a.color}1a` : 'transparent',
                    borderLeft: `2px solid ${selected ? a.color : 'transparent'}`,
                  }}
                >
                  <span style={{ fontSize: 12, color: a.danger ? a.color : (selected ? a.color : '#c0d8f0') }}>{a.label}</span>
                  <span style={{
                    fontSize: 10, color: '#5a7a98', fontFamily: 'inherit',
                    background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: 3, padding: '0 5px',
                  }}>{a.hint}</span>
                </div>
              </Fragment>
            )
          })}
        </div>

        {/* Footer */}
        <div style={{ padding: '6px 14px', borderTop: '1px solid rgba(0,212,255,0.12)', flexShrink: 0,
          display: 'flex', gap: 12, fontSize: 10, color: '#3a5a7a', background: 'rgba(0,0,0,0.25)' }}>
          <span>↑↓ move</span><span>↵ run</span><span>esc close</span>
        </div>
      </div>
    </div>
  )
}

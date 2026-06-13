import { useEffect } from 'react'
import { useStore } from '../store'

const SECTIONS = [
  {
    title: 'NAVIGATION',
    color: '#00d4ff',
    keys: [
      ['j / k', 'Select prev / next row'],
      ['gg / G', 'First / last row'],
      ['Enter', 'Drill into resource'],
      ['[ / ]', 'History back / forward'],
      ['ctrl+b', 'Toggle sidebar'],
      ['Esc', 'Step back / clear'],
    ],
  },
  {
    title: 'SORT & FILTER',
    color: '#ffcc44',
    keys: [
      ['Shift+N', 'Sort by name'],
      ['Shift+A', 'Sort by age'],
      ['Shift+S', 'Sort by status'],
      ['(repeat)', 'Toggle sort direction'],
      ['ctrl+z', 'Toggle faults-only'],
      ['/', 'Filter by name / namespace'],
      [':', 'Command (:pods, :ns …)'],
    ],
  },
  {
    title: 'ACTIONS',
    color: '#00ffaa',
    keys: [
      ['a', 'Actions palette'],
      ['Space', 'Mark / unmark row'],
      ['l', 'Logs'],
      ['d', 'Describe'],
      ['y', 'YAML / JSON'],
      ['e', 'Edit'],
      ['x', 'Decode secret'],
      ['Shift+F', 'Port-forward'],
      ['Shift+J', 'Jump to owner'],
      ['ctrl+d', 'Delete (confirm)'],
      ['ctrl+k', 'Kill (no confirm)'],
    ],
  },
  {
    title: 'HELM (release selected)',
    color: '#ff8844',
    keys: [
      ['v', 'Values (Tab: user / all)'],
      ['m', 'Manifest'],
      ['n', 'Notes'],
      ['h', 'History (rollback / values)'],
      ['d', 'Describe'],
    ],
  },
  {
    title: 'MODAL (describe / yaml / logs / edit)',
    color: '#aa55ff',
    keys: [
      ['j / k', 'Scroll'],
      ['ctrl+d / u', 'Half-page scroll'],
      ['gg / G', 'Top / bottom'],
      ['Tab', 'Describe / YAML / JSON'],
      ['/', 'Search'],
      ['n / N', 'Next / prev match'],
      ['e', 'Edit mode'],
      ['i', 'Insert mode (in edit)'],
      ['x', 'Decode secret (yaml / json)'],
      ['#', 'Toggle line numbers'],
      ['c', 'Copy'],
    ],
  },
]

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 6px', borderRadius: 3, minWidth: 18,
      textAlign: 'center', fontSize: 10, color: '#9ab8d0',
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      fontFamily: 'inherit',
    }}>{children}</span>
  )
}

export function HelpModal() {
  const helpOpen    = useStore(s => s.helpOpen)
  const setHelpOpen = useStore(s => s.setHelpOpen)

  // Esc / ? handled in useKeys; this guards clicks and direct mounts.
  useEffect(() => {
    if (!helpOpen) return
    const onKey = e => { if (e.key === 'Escape' || e.key === '?') { e.preventDefault(); setHelpOpen(false) } }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [helpOpen, setHelpOpen])

  if (!helpOpen) return null

  return (
    <div
      onClick={() => setHelpOpen(false)}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(1,5,14,0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          width: 'min(820px, 94vw)', maxHeight: '86vh', overflowY: 'auto',
          borderRadius: 8, background: 'rgba(2,10,22,0.98)',
          border: '1px solid rgba(0,212,255,0.28)', boxShadow: '0 0 50px rgba(0,212,255,0.12)',
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 18px', borderBottom: '1px solid rgba(0,212,255,0.18)',
          position: 'sticky', top: 0, background: 'rgba(2,10,22,0.98)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 'bold', letterSpacing: '0.16em', color: '#00d4ff' }}>
            KEYBOARD SHORTCUTS
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: 10, color: '#1e3a52' }}>? · ESC · close</span>
            <button onClick={() => setHelpOpen(false)}
              style={{ fontSize: 18, lineHeight: 1, color: '#3a5a7a', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
              onMouseEnter={e => e.target.style.color = '#c0d8f0'}
              onMouseLeave={e => e.target.style.color = '#3a5a7a'}
            >×</button>
          </div>
        </div>

        {/* Sections grid */}
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(330px, 1fr))',
          gap: '8px 28px', padding: '16px 22px',
        }}>
          {SECTIONS.map(section => (
            <div key={section.title}>
              <div style={{
                fontSize: 10, fontWeight: 'bold', letterSpacing: '0.12em',
                color: section.color, marginBottom: 8, marginTop: 6,
              }}>{section.title}</div>
              {section.keys.map(([k, label]) => (
                <div key={k + label} style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '3px 0', fontSize: 11,
                }}>
                  <span style={{ flexShrink: 0, minWidth: 96 }}>
                    {k.split(' / ').map((part, i, arr) => (
                      <span key={part}>
                        <Kbd>{part}</Kbd>
                        {i < arr.length - 1 && <span style={{ color: '#3a5a7a', margin: '0 2px' }}>/</span>}
                      </span>
                    ))}
                  </span>
                  <span style={{ color: '#7a9ab8' }}>{label}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

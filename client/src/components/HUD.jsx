import { useRef, useEffect, useMemo } from 'react'
import { useStore, RESOURCE_ALIASES, DRILLABLE, FORWARDABLE, OWNED } from '../store'
import { DetailPanel } from './DetailPanel'
import { ActionModal } from './ActionModal'
import { PortForwardModal } from './PortForwardModal'
import { HelpModal } from './HelpModal'
import { ActionMenu } from './ActionMenu'

function Kbd({ children }) {
  return (
    <span style={{
      display: 'inline-block', padding: '1px 5px', borderRadius: 3,
      background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
      color: '#7a9ab8', fontFamily: 'inherit', fontSize: 10,
    }}>
      {children}
    </span>
  )
}

function Hint({ keys, label }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {keys.map(k => <Kbd key={k}>{k}</Kbd>)}
      <span style={{ fontSize: 10, color: '#4a6a8a' }}>{label}</span>
    </div>
  )
}

export function HUD({ panelWidth = 288 }) {
  const activeResource  = useStore(s => s.activeResource)
  const activeNamespace = useStore(s => s.activeNamespace)
  const demoMode        = useStore(s => s.demoMode)
  const connected       = useStore(s => s.connected)
  const filter          = useStore(s => s.filter)
  const filterActive    = useStore(s => s.filterActive)
  const filterPinned    = useStore(s => s.filterPinned)
  const commandActive   = useStore(s => s.commandActive)
  const command         = useStore(s => s.command)
  const selectedId      = useStore(s => s.selectedId)
  const selectedIds     = useStore(s => s.selectedIds)
  const navStack        = useStore(s => s.navStack)
  const navFuture       = useStore(s => s.navFuture)
  const drilldownLabel  = useStore(s => s.drilldownLabel)
  const nsPickerMode    = useStore(s => s.nsPickerMode)
  const sortKey         = useStore(s => s.sortKey)
  const sortDir         = useStore(s => s.sortDir)
  const faultsOnly      = useStore(s => s.faultsOnly)
  const toggleFaults    = useStore(s => s.toggleFaults)
  const clearSort       = useStore(s => s.clearSort)

  const setActiveNamespace  = useStore(s => s.setActiveNamespace)
  const setFilter           = useStore(s => s.setFilter)
  const setFilterActive     = useStore(s => s.setFilterActive)
  const clearFilter         = useStore(s => s.clearFilter)
  const setCommandActive    = useStore(s => s.setCommandActive)
  const setCommand          = useStore(s => s.setCommand)
  const submitCommand       = useStore(s => s.submitCommand)
  const navBack             = useStore(s => s.navBack)
  const navForwardStep      = useStore(s => s.navForwardStep)

  const filterRef  = useRef()
  const commandRef = useRef()

  useEffect(() => { if (filterActive)  filterRef.current?.focus()  }, [filterActive])
  useEffect(() => { if (commandActive) commandRef.current?.focus() }, [commandActive])

  // Items for count/filter display (handles drilldown and cr: prefix)
  const crdResources = useStore(s => s.crdResources)
  const drilldownItems = useStore(s => s.drilldownItems)
  const storeItems   = useStore(s => s[activeResource])
  const allItems = drilldownItems
    || (activeResource.startsWith('cr:') ? (crdResources[activeResource.slice(3)] || []) : (storeItems || []))

  const filteredCount = useMemo(() => {
    let items = allItems
    if (activeNamespace !== 'all') items = items.filter(i => i.namespace === activeNamespace)
    if (!filter) return items.length
    const q = filter.toLowerCase()
    return items.filter(i =>
      i.name.toLowerCase().includes(q) || (i.namespace || '').toLowerCase().includes(q)
    ).length
  }, [allItems, filter, activeNamespace])

  const totalCount = allItems.length
  const resourceLabel = drilldownLabel
    ? drilldownLabel.split('›').pop().trim()
    : activeResource.startsWith('cr:') ? activeResource.slice(3).split('/').pop() : activeResource

  // Command preview
  const cmdLow = command.trim().toLowerCase()
  const commandPreview = (cmdLow === 'ns' || cmdLow === 'namespace')
    ? 'namespace picker'
    : RESOURCE_ALIASES[cmdLow]

  const showBreadcrumb = navStack.length > 0 || !!drilldownLabel

  return (
    <>
      {/* ── Top bar ─────────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 44,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 10,
          background: 'linear-gradient(180deg, rgba(2,8,24,0.97) 0%, rgba(2,8,24,0) 100%)',
          borderBottom: '1px solid rgba(0,212,255,0.06)',
        }}
      >
        {/* Wordmark */}
        <span className="mezz-wordmark" style={{ fontSize: 22, lineHeight: 1, flexShrink: 0, paddingRight: 2 }}>
          Mezzanine
        </span>

        {/* Connection dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
          <div style={{
            width: 6, height: 6, borderRadius: '50%',
            background: connected ? '#00ffaa' : demoMode ? '#ffcc00' : '#ff4455',
            boxShadow: `0 0 6px ${connected ? '#00ffaa' : demoMode ? '#ffcc00' : '#ff4455'}`,
          }} />
          {demoMode && <span style={{ fontSize: 10, letterSpacing: '0.08em', color: '#ffcc00aa' }}>DEMO</span>}
        </div>

        {/* Namespace pill */}
        {activeNamespace !== 'all' && !nsPickerMode && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 4, padding: '2px 8px', borderRadius: 4, flexShrink: 0,
            background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)',
          }}>
            <span style={{ fontSize: 10, color: '#4a7a9a' }}>ns:</span>
            <span style={{ fontSize: 11, color: '#00d4ff', fontFamily: 'inherit' }}>{activeNamespace}</span>
            <button onClick={() => setActiveNamespace('all')} style={{ fontSize: 12, lineHeight: 1, color: '#3a5a7a', marginLeft: 2, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              onMouseEnter={e => e.target.style.color = '#c0d8f0'} onMouseLeave={e => e.target.style.color = '#3a5a7a'}>×</button>
          </div>
        )}

        {/* Namespace picker badge */}
        {nsPickerMode && (
          <span style={{
            fontSize: 10, letterSpacing: '0.1em', padding: '2px 8px', borderRadius: 4, flexShrink: 0,
            color: '#ffcc00', background: 'rgba(255,204,0,0.1)', border: '1px solid rgba(255,204,0,0.3)',
          }}>
            SELECT NAMESPACE
          </span>
        )}

        {/* Breadcrumb trail */}
        {showBreadcrumb && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 0, flexShrink: 0, minWidth: 0,
            background: 'rgba(0,212,255,0.04)', border: '1px solid rgba(0,212,255,0.1)',
            borderRadius: 4, padding: '2px 6px', fontSize: 10,
          }}>
            {navStack.length > 0 && (
              <span
                onClick={navBack}
                title="[ back"
                style={{ color: '#4a7a9a', cursor: 'pointer', whiteSpace: 'nowrap', paddingRight: 4 }}
                onMouseEnter={e => e.currentTarget.style.color = '#7ab0cc'}
                onMouseLeave={e => e.currentTarget.style.color = '#4a7a9a'}
              >
                {navStack.length > 1 && <span style={{ color: '#2a4a6a', marginRight: 4 }}>···</span>}
                {navStack[navStack.length - 1].drilldownLabel
                  ? navStack[navStack.length - 1].drilldownLabel.split('›').pop().trim()
                  : navStack[navStack.length - 1].resource}
              </span>
            )}
            {navStack.length > 0 && (
              <span style={{ color: '#2a4a6a', padding: '0 4px' }}>›</span>
            )}
            <span style={{ color: '#c0d8f0', whiteSpace: 'nowrap', fontWeight: 500 }}>
              {drilldownLabel || activeResource}
            </span>
            {navFuture.length > 0 && (
              <>
                <span style={{ color: '#2a4a6a', padding: '0 4px' }}>›</span>
                <span
                  onClick={navForwardStep}
                  title="] forward"
                  style={{ color: '#4a7a9a', cursor: 'pointer', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => e.currentTarget.style.color = '#7ab0cc'}
                  onMouseLeave={e => e.currentTarget.style.color = '#4a7a9a'}
                >
                  {navFuture[0].drilldownLabel
                    ? navFuture[0].drilldownLabel.split('›').pop().trim()
                    : navFuture[0].resource}
                </span>
              </>
            )}
          </div>
        )}

        <div style={{ flex: 1 }} />
      </div>

      {/* ── Detail panel ─────────────────────────────────────────── */}
      {selectedId && !commandActive && <DetailPanel width={panelWidth} />}

      {/* ── Action modal ─────────────────────────────────────────── */}
      <ActionModal />

      {/* ── Port-forward modal ───────────────────────────────────── */}
      <PortForwardModal />

      {/* ── Help modal ───────────────────────────────────────────── */}
      <HelpModal />

      {/* ── Actions palette ──────────────────────────────────────── */}
      <ActionMenu />

      {/* ── Bottom bar ───────────────────────────────────────────── */}
      <div
        style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, height: 36,
          display: 'flex', alignItems: 'center', padding: '0 16px', gap: 16,
          background: 'linear-gradient(0deg, rgba(2,8,24,0.97) 0%, rgba(2,8,24,0) 100%)',
          borderTop: '1px solid rgba(0,212,255,0.06)',
        }}
      >
        {commandActive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 14, fontWeight: 'bold', color: '#00d4ff', fontFamily: 'inherit' }}>:</span>
            <input
              ref={commandRef}
              value={command}
              onChange={e => setCommand(e.target.value)}
              onBlur={() => { if (!command) setCommandActive(false) }}
              onKeyDown={e => {
                if (e.key === 'Enter') submitCommand()
                if (e.key === 'Escape') setCommandActive(false)
              }}
              style={{
                background: 'transparent', outline: 'none', fontSize: 12, width: 200,
                color: '#c0e8ff', fontFamily: 'inherit', border: 'none',
                borderBottom: '1px solid rgba(0,212,255,0.4)',
              }}
              placeholder="pods · deploy · svc · ns kube-system"
            />
            {commandPreview && (
              <span style={{ fontSize: 10, color: '#00d4ff66' }}>→ {commandPreview}</span>
            )}
          </div>
        ) : filterActive ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <span style={{ fontSize: 11, color: '#00d4ff' }}>Filter:</span>
            <input
              ref={filterRef}
              value={filter}
              onChange={e => setFilter(e.target.value)}
              onBlur={() => { if (!filter) setFilterActive(false) }}
              onKeyDown={e => {
                if (e.key === 'Escape' || e.key === 'Enter') {
                  e.preventDefault()
                  setFilterActive(false)
                  if (filter) useStore.getState().setFilterPinned(true)
                }
              }}
              style={{
                background: 'transparent', outline: 'none', fontSize: 12, width: 200,
                color: '#c0e8ff', fontFamily: 'inherit', border: 'none',
                borderBottom: '1px solid rgba(0,212,255,0.4)',
              }}
              placeholder="name or namespace…"
            />
            {filter && <span style={{ fontSize: 10, color: '#4a7a9a' }}>{filteredCount}/{totalCount}</span>}
          </div>
        ) : filterPinned && filter ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '2px 8px', borderRadius: 4,
              background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.25)',
            }}>
              <span style={{ fontSize: 10, color: '#00d4ff' }}>filter:</span>
              <span style={{ fontSize: 11, color: '#c0e8ff', fontFamily: 'inherit' }}>{filter}</span>
              <span style={{ fontSize: 10, color: '#4a7a9a' }}>{filteredCount}/{totalCount}</span>
              <button onClick={clearFilter} style={{ fontSize: 12, lineHeight: 1, marginLeft: 4, color: '#4a6a8a', background: 'none', border: 'none', cursor: 'pointer' }}
                onMouseEnter={e => e.target.style.color = '#c0d8f0'} onMouseLeave={e => e.target.style.color = '#4a6a8a'}>×</button>
            </div>
            <Hint keys={['j', 'k']} label="navigate" />
            <Hint keys={['/']} label="edit filter" />
            <Hint keys={['Esc']} label="clear" />
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1, flexWrap: 'wrap' }}>
            <Hint keys={['?']} label="help" />
            <Hint keys={[':']} label="command" />
            <Hint keys={['/']} label="filter" />
            <Hint keys={['j', 'k']} label="select" />
            {selectedId && DRILLABLE.has(activeResource) && <Hint keys={['↵']} label="enter" />}
            {navStack.length > 0 && <Hint keys={['[']} label="back" />}
            {navFuture.length > 0 && <Hint keys={[']']} label="fwd" />}
            {selectedId && activeResource === 'helmreleases' && <>
              <span style={{ color: '#2a4a6a', fontSize: 10 }}>·</span>
              <Hint keys={['v']} label="values" />
              <Hint keys={['m']} label="manifest" />
              <Hint keys={['n']} label="notes" />
              <Hint keys={['h']} label="history" />
              <Hint keys={['d']} label="describe" />
              <Hint keys={['a']} label="actions" />
            </>}
            {selectedId && activeResource !== 'helmreleases' && <>
              <span style={{ color: '#2a4a6a', fontSize: 10 }}>·</span>
              <Hint keys={['spc']} label="mark" />
              <Hint keys={['l']} label="logs" />
              <Hint keys={['d']} label="describe" />
              <Hint keys={['y']} label="yaml" />
              <Hint keys={['e']} label="edit" />
              {activeResource === 'secrets' && <Hint keys={['x']} label="decode" />}
              {FORWARDABLE.has(activeResource) && <Hint keys={['⇧f']} label="fwd" />}
              {OWNED.has(activeResource) && <Hint keys={['⇧j']} label="owner" />}
              <Hint keys={['a']} label="actions" />
              <Hint keys={['ctrl+d']} label="confirm del" />
              <Hint keys={['ctrl+k']} label="kill" />
            </>}
            {selectedIds?.size > 0 && (
              <span style={{ fontSize: 10, color: '#ffcc44', background: 'rgba(255,204,68,0.1)', border: '1px solid rgba(255,204,68,0.3)', borderRadius: 3, padding: '1px 6px' }}>
                {selectedIds.size} marked
              </span>
            )}
            {sortKey && (
              <span
                onClick={clearSort}
                title="Clear sort"
                style={{ cursor: 'pointer', fontSize: 10, color: '#00d4ff', background: 'rgba(0,212,255,0.1)', border: '1px solid rgba(0,212,255,0.3)', borderRadius: 3, padding: '1px 6px' }}
              >
                sort: {sortKey} {sortDir === 'asc' ? '▲' : '▼'} <span style={{ opacity: 0.5 }}>×</span>
              </span>
            )}
            {faultsOnly && (
              <span
                onClick={toggleFaults}
                title="Show all (ctrl+z)"
                style={{ cursor: 'pointer', fontSize: 10, color: '#ff4455', background: 'rgba(255,68,85,0.12)', border: '1px solid rgba(255,68,85,0.4)', borderRadius: 3, padding: '1px 6px' }}
              >
                faults only <span style={{ opacity: 0.6 }}>×</span>
              </span>
            )}
            <Hint keys={['Esc']} label="back" />
          </div>
        )}

        <div style={{ fontSize: 10, flexShrink: 0, color: '#3a5a7a', fontFamily: 'inherit' }}>
          {filteredCount}&nbsp;<span style={{ color: '#253a55' }}>/</span>&nbsp;{totalCount}&nbsp;{resourceLabel}
        </div>
      </div>
    </>
  )
}

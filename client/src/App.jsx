import { Component } from 'react'
import { HUD } from './components/HUD'
import { Sidebar } from './components/Sidebar'
import { LoadingScreen } from './components/LoadingScreen'
import { ResourceList } from './components/ResourceList'
import { NotConnected } from './components/NotConnected'
import { DeleteModal } from './components/DeleteModal'
import { useWS } from './hooks/useWS'
import { useKeys } from './hooks/useKeys'
import { useStore } from './store'

class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(e) { return { error: e } }
  render() {
    if (this.state.error) {
      return (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0a1220', padding: 40 }}>
          <pre style={{ color: '#ff4455', fontFamily: 'monospace', fontSize: 12, whiteSpace: 'pre-wrap', maxWidth: 800 }}>
            {String(this.state.error)}{'\n'}{this.state.error?.stack}
          </pre>
        </div>
      )
    }
    return this.props.children
  }
}

const PANEL_W = 310

export default function App() {
  useWS()
  useKeys()
  const sidebarCollapsed = useStore(s => s.sidebarCollapsed)
  const selectedId       = useStore(s => s.selectedId)
  const modal            = useStore(s => s.modal)
  const sidebarW = sidebarCollapsed ? 36 : 200
  const panelOpen = !!selectedId && !modal

  return (
    <ErrorBoundary>
      <div style={{ width: '100vw', height: '100vh', background: '#0a1220', overflow: 'hidden', position: 'relative' }}>
        <Sidebar />
        <div style={{
          position: 'absolute',
          top: 44, bottom: 36,
          left: sidebarW, right: panelOpen ? PANEL_W : 0,
          overflow: 'hidden',
          transition: 'left 0.18s ease, right 0.2s ease',
        }}>
          <ResourceList />
          <NotConnected />
        </div>
        <HUD panelWidth={PANEL_W} />
        <DeleteModal />
        <LoadingScreen />
      </div>
    </ErrorBoundary>
  )
}

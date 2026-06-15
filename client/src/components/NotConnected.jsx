import { useStore } from '../store'

// Shown when no cluster is reachable and demo mode is off (the production default).
// Mezzanine auto-retries every 5s, so this clears itself once a cluster becomes reachable.
export function NotConnected() {
  const clusterConnected = useStore(s => s.clusterConnected)
  const demoMode         = useStore(s => s.demoMode)
  const clusterError     = useStore(s => s.clusterError)

  if (clusterConnected || demoMode) return null

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40,
    }}>
      <div className="mezz-wordmark" style={{ fontSize: 52, lineHeight: 1, marginBottom: 18 }}>
        mezza9
      </div>
      <div style={{ color: '#7fd4ff', fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        No cluster connected
      </div>
      <div style={{ color: '#5a8aa8', fontSize: 12.5, lineHeight: 1.7, maxWidth: 460 }}>
        Point Mezzanine at a Kubernetes cluster to get started:
        <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', textAlign: 'left', display: 'inline-block' }}>
          <li>• Mount your kubeconfig at <code style={codeStyle}>~/.kube/config</code></li>
          <li>• or set <code style={codeStyle}>KUBECONFIG</code> to its path</li>
          <li>• in-cluster: a ServiceAccount token is detected automatically</li>
        </ul>
      </div>
      <div style={{ color: '#3a6a88', fontSize: 11, marginTop: 16 }}>
        Retrying every 5s…
      </div>
      {clusterError && (
        <pre style={{
          color: '#ff6677', fontSize: 11, fontFamily: 'monospace', marginTop: 18,
          maxWidth: 560, whiteSpace: 'pre-wrap', opacity: 0.85,
        }}>
          {clusterError}
        </pre>
      )}
    </div>
  )
}

const codeStyle = {
  color: '#9fe6ff', background: '#0a1a2a', padding: '1px 5px',
  borderRadius: 3, fontFamily: 'monospace', fontSize: 11.5,
}

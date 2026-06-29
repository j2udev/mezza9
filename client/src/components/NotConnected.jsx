import { useStore } from '../store'

// Shown when the active provider isn't reachable and demo mode is off (the production default).
// Provider-aware (module #2): a k8s deployment checks the cluster connection, an AWS deployment
// checks the AWS connection. Mezzanine auto-retries every 5s, so this clears itself once reachable.
export function NotConnected() {
  const provider         = useStore(s => s.activeProvider)
  const clusterConnected = useStore(s => s.clusterConnected)
  const demoMode         = useStore(s => s.demoMode)
  const clusterError     = useStore(s => s.clusterError)
  const awsConnected     = useStore(s => s.awsConnected)
  const awsDemo          = useStore(s => s.awsDemo)
  const awsError         = useStore(s => s.awsError)

  const isAws = provider === 'aws'
  if (isAws ? (awsConnected || awsDemo) : (clusterConnected || demoMode)) return null

  const error = isAws ? awsError : clusterError

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40,
    }}>
      <div className="mezz-wordmark" style={{ fontSize: 52, lineHeight: 1, marginBottom: 18 }}>
        mezza9
      </div>
      <div style={{ color: 'var(--mz-text-bright)', fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        {isAws ? 'No AWS connection' : 'No cluster connected'}
      </div>
      <div style={{ color: 'var(--mz-text-dim)', fontSize: 12.5, lineHeight: 1.7, maxWidth: 460 }}>
        {isAws ? (
          <>
            Point Mezzanine at an AWS account to get started:
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', textAlign: 'left', display: 'inline-block' }}>
              <li>• Set <code style={codeStyle}>AWS_PROFILE</code> or <code style={codeStyle}>AWS_ACCESS_KEY_ID</code> / <code style={codeStyle}>AWS_SECRET_ACCESS_KEY</code></li>
              <li>• Set <code style={codeStyle}>AWS_REGION</code> (defaults to us-east-1)</li>
              <li>• in-AWS: an instance / task IAM role is detected automatically</li>
              <li>• or set <code style={codeStyle}>MEZZ_AWS_DEMO=1</code> for the demo dataset</li>
            </ul>
          </>
        ) : (
          <>
            Point Mezzanine at a Kubernetes cluster to get started:
            <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', textAlign: 'left', display: 'inline-block' }}>
              <li>• Mount your kubeconfig at <code style={codeStyle}>~/.kube/config</code></li>
              <li>• or set <code style={codeStyle}>KUBECONFIG</code> to its path</li>
              <li>• in-cluster: a ServiceAccount token is detected automatically</li>
            </ul>
          </>
        )}
      </div>
      <div style={{ color: 'var(--mz-text-faint)', fontSize: 11, marginTop: 16 }}>
        Retrying every 5s…
      </div>
      {error && (
        <pre style={{
          color: 'var(--mz-danger-2)', fontSize: 11, fontFamily: 'monospace', marginTop: 18,
          maxWidth: 560, whiteSpace: 'pre-wrap', opacity: 0.85,
        }}>
          {error}
        </pre>
      )}
    </div>
  )
}

const codeStyle = {
  color: 'var(--mz-text-bright)', background: 'var(--mz-surface)', padding: '1px 5px',
  borderRadius: 3, fontFamily: 'monospace', fontSize: 11.5,
}

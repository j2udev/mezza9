import { useState } from 'react'
import { useStore } from '../store'

// Full-screen gate shown when the server requires a shared token (task 97) and we don't hold a
// valid one. Mirrors NotConnected's look. While this is up, the app tree behind it is not
// mounted, so no cluster data is fetched until the token is accepted.
export function LoginScreen() {
  const login     = useStore(s => s.login)
  const authBusy  = useStore(s => s.authBusy)
  const authError = useStore(s => s.authError)
  const [value, setValue] = useState('')

  const submit = (e) => {
    e.preventDefault()
    if (authBusy) return
    login(value)
  }

  return (
    <div style={{
      position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: 40,
      background: 'var(--mz-bg)', zIndex: 1000,
    }}>
      <div className="mezz-wordmark" style={{ fontSize: 52, lineHeight: 1, marginBottom: 18 }}>
        mezza9
      </div>
      <div style={{ color: 'var(--mz-text-bright)', fontSize: 15, fontWeight: 600, marginBottom: 10 }}>
        Authentication required
      </div>
      <div style={{ color: 'var(--mz-text-dim)', fontSize: 12.5, lineHeight: 1.7, maxWidth: 420 }}>
        This dashboard is protected by a shared access token. Enter it to continue.
      </div>

      <form onSubmit={submit} style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <input
          type="password"
          autoFocus
          autoComplete="current-password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="Access token"
          style={{
            width: 280, padding: '8px 11px', fontSize: 13, fontFamily: 'monospace',
            color: 'var(--mz-text-bright)', background: 'var(--mz-surface)',
            border: `1px solid ${authError ? 'var(--mz-danger-2)' : 'var(--mz-border)'}`,
            borderRadius: 5, outline: 'none',
          }}
        />
        <button
          type="submit"
          disabled={authBusy}
          style={{
            padding: '8px 16px', fontSize: 13, fontWeight: 600, cursor: authBusy ? 'default' : 'pointer',
            color: 'var(--mz-bg)', background: 'var(--mz-accent)', border: 'none', borderRadius: 5,
            opacity: authBusy ? 0.6 : 1,
          }}
        >
          {authBusy ? '…' : 'Unlock'}
        </button>
      </form>

      <div style={{ height: 18, marginTop: 10 }}>
        {authError && (
          <div style={{ color: 'var(--mz-danger-2)', fontSize: 12 }}>{authError}</div>
        )}
      </div>

      <div style={{ color: 'var(--mz-text-faint)', fontSize: 11, marginTop: 14, maxWidth: 420, lineHeight: 1.6 }}>
        Don't have a token? Contact your cluster administrator.
      </div>
    </div>
  )
}

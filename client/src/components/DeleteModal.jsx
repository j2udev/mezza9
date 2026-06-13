import { useState, useEffect } from 'react'
import { useStore } from '../store'

const CLUSTER_SCOPED = new Set(['nodes', 'pvs', 'namespaces', 'crds', 'clusterroles', 'clusterrolebindings', 'storageclasses'])

export function DeleteModal() {
  const deleteConfirm = useStore(s => s.deleteConfirm)
  const cancelDelete  = useStore(s => s.cancelDelete)
  const demoMode      = useStore(s => s.demoMode)
  const [status, setStatus] = useState(null)   // null | 'deleting' | { ok, msg }

  useEffect(() => {
    if (!deleteConfirm) { setStatus(null); return }
  }, [deleteConfirm])

  useEffect(() => {
    const onKey = e => {
      if (!deleteConfirm || status === 'deleting') return
      if (e.key === 'Escape') { e.preventDefault(); cancelDelete() }
      if ((e.key === 'Enter' || e.key === 'y') && status === null) {
        e.preventDefault()
        doDelete()
      }
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [deleteConfirm, status])

  const doDelete = async () => {
    if (!deleteConfirm || status) return
    setStatus('deleting')
    const { resource } = deleteConfirm
    const items = deleteConfirm.items || [deleteConfirm.item]
    try {
      await Promise.all(items.map(async item => {
        const ns = CLUSTER_SCOPED.has(resource) ? '_' : (item.namespace || '_')
        const res  = await fetch(`/api/delete/${resource}/${ns}/${item.name}`, { method: 'DELETE' })
        const data = await res.json()
        if (!data.ok) throw new Error(data.error || `Failed to delete ${item.name}`)
      }))
      cancelDelete()
    } catch (err) {
      setStatus({ ok: false, msg: err.message })
    }
  }

  if (!deleteConfirm) return null
  const { resource } = deleteConfirm
  const items = deleteConfirm.items || [deleteConfirm.item]
  const isMulti = items.length > 1
  const displayResource = resource.startsWith('cr:') ? resource.slice(3).split('/').pop() : resource

  return (
    <div
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(1,5,14,0.88)', backdropFilter: 'blur(8px)',
      }}
      onClick={cancelDelete}
    >
      <div
        style={{
          position: 'relative', padding: '28px 32px', borderRadius: 8,
          background: 'rgba(2,10,22,0.98)',
          border: '1px solid rgba(255,68,88,0.35)',
          boxShadow: '0 0 40px rgba(255,68,88,0.12)',
          minWidth: 360, maxWidth: 520,
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
          <span style={{ fontSize: 13, fontWeight: 'bold', letterSpacing: '0.12em', color: '#ff4458' }}>
            DELETE
          </span>
          {isMulti ? (
            <span style={{ fontSize: 12, color: '#3a6a8a' }}>
              {items.length} {displayResource}
            </span>
          ) : (
            <span style={{ fontSize: 12, color: '#3a6a8a' }}>
              {displayResource.slice(0, -1)} / {items[0].name}
              {items[0].namespace && <span style={{ color: '#2a5070' }}> · {items[0].namespace}</span>}
            </span>
          )}
        </div>

        {status === null && (
          <>
            {isMulti ? (
              <div style={{ marginBottom: 16 }}>
                <p style={{ fontSize: 12, color: '#c0d8f0', margin: '0 0 10px', lineHeight: 1.6 }}>
                  Permanently delete {items.length} {displayResource}? This cannot be undone.
                </p>
                <div style={{
                  maxHeight: 180, overflowY: 'auto',
                  background: 'rgba(255,68,88,0.04)', border: '1px solid rgba(255,68,88,0.15)',
                  borderRadius: 4, padding: '6px 10px',
                }}>
                  {items.map(item => (
                    <div key={item.id} style={{ fontSize: 11, color: '#9ab8d0', lineHeight: 1.8, fontFamily: 'monospace' }}>
                      <span style={{ color: '#ff6677' }}>✗</span>{' '}
                      {item.name}
                      {item.namespace && <span style={{ color: '#2a4a6a' }}> ({item.namespace})</span>}
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <p style={{ fontSize: 12, color: '#c0d8f0', margin: '0 0 20px', lineHeight: 1.6 }}>
                This will permanently delete the resource. This action cannot be undone.
              </p>
            )}
            {demoMode && (
              <p style={{ fontSize: 11, color: '#ffcc44', margin: '0 0 16px' }}>
                Demo mode — deletion is simulated and has no effect.
              </p>
            )}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
              <button
                onClick={cancelDelete}
                style={{
                  fontSize: 11, padding: '5px 16px', borderRadius: 4, cursor: 'pointer',
                  color: '#5a8aaa', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit',
                }}
              >Cancel <span style={{ opacity: 0.5, fontSize: 9 }}>Esc</span></button>
              <button
                onClick={doDelete}
                style={{
                  fontSize: 11, padding: '5px 20px', borderRadius: 4, cursor: 'pointer',
                  color: '#ff4458', background: 'rgba(255,68,88,0.1)',
                  border: '1px solid rgba(255,68,88,0.4)', fontFamily: 'inherit',
                  letterSpacing: '0.04em',
                }}
              >Delete{isMulti ? ` ${items.length}` : ''} <span style={{ opacity: 0.5, fontSize: 9 }}>Enter / y</span></button>
            </div>
          </>
        )}

        {status === 'deleting' && (
          <p style={{ fontSize: 12, color: '#ffcc44', margin: 0 }}>Deleting…</p>
        )}

        {status !== null && status !== 'deleting' && (
          <>
            <p style={{ fontSize: 12, color: status.ok ? '#00ffaa' : '#ff4458', margin: '0 0 16px' }}>
              {status.ok ? `✓ ${status.msg}` : `✗ ${status.msg}`}
            </p>
            {!status.ok && (
              <button onClick={cancelDelete} style={{
                fontSize: 11, padding: '4px 14px', borderRadius: 4, cursor: 'pointer',
                color: '#5a8aaa', background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.1)', fontFamily: 'inherit',
              }}>Close</button>
            )}
          </>
        )}
      </div>
    </div>
  )
}

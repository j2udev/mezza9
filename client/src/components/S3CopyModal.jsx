import { useEffect, useRef, useState } from 'react'
import { alpha } from '../theme'
import { useStore } from '../store'

const ACCENT = 'var(--mz-accent-2)'
const enc = encodeURIComponent

function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// S3 object copy dialog (module #2) - the AWS analog of the kubectl-cp CopyModal. DOWNLOAD an
// object to the browser, or UPLOAD a browser-picked file to a bucket/key. The "local" side is the
// browser, like CopyModal; but there is no container picker and no tar/format toggle (S3 objects
// are single blobs addressed by key, not files inside a running container - friction #5). Opened on
// a bucket (no key) or on an object (key prefilled for a one-click download).
export function S3CopyModal() {
  const s3CpModal = useStore(s => s.s3CpModal)
  const closeS3Cp = useStore(s => s.closeS3Cp)
  const awsDemo   = useStore(s => s.awsDemo)

  const [key, setKey] = useState('')
  const [file, setFile] = useState(null)
  const [ulKey, setUlKey] = useState('')
  const [dlBusy, setDlBusy] = useState(false)
  const [ulBusy, setUlBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const keyRef = useRef(null)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!s3CpModal) return
    setKey(s3CpModal.objectKey || '')
    setFile(null); setUlKey('')
    setDlBusy(false); setUlBusy(false); setError(''); setDone('')
    const t = setTimeout(() => keyRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [s3CpModal])

  if (!s3CpModal) return null
  const { bucket, label } = s3CpModal

  const download = async () => {
    const k = key.trim()
    if (!k || dlBusy) return
    setDlBusy(true); setError(''); setDone('')
    try {
      const res = await fetch(`/api/aws/s3/${enc(bucket)}/object?key=${enc(k)}`) // auth wrapper adds the token (#97)
      if (!res.ok) {
        let msg = `Download failed (${res.status})`
        try { const j = await res.json(); if (j.error) msg = j.error } catch { /* non-JSON body */ }
        setError(msg); return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const m = /filename="?([^"]+)"?/.exec(cd)
      const fname = m ? m[1] : (k.split('/').pop() || 'download')
      const objUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objUrl; a.download = fname
      document.body.appendChild(a); a.click(); a.remove()
      URL.revokeObjectURL(objUrl)
      setDone(`Downloaded ${fname} (${fmtBytes(blob.size)})`)
    } catch (e) {
      setError(e.message || 'Download failed')
    } finally {
      setDlBusy(false)
    }
  }

  const upload = async () => {
    const k = ulKey.trim()
    if (!file || !k || ulBusy) return
    setUlBusy(true); setError(''); setDone('')
    try {
      const res = await fetch(`/api/aws/s3/${enc(bucket)}/object?key=${enc(k)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file, // express.raw stages the bytes server-side, then PutObject
      })
      let data = {}
      try { data = await res.json() } catch { /* non-JSON */ }
      if (!res.ok || !data.ok) { setError(data.error || `Upload failed (${res.status})`); return }
      setDone(`Uploaded to ${data.path || `${bucket}/${k}`}`)
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setUlBusy(false)
    }
  }

  const onKeyDown = (e) => { if (e.key === 'Escape') { e.preventDefault(); closeS3Cp() } }

  const busy = dlBusy || ulBusy
  const chipStyle = (active) => ({
    fontSize: 11, padding: '3px 9px', borderRadius: 3, cursor: busy ? 'default' : 'pointer', fontFamily: 'monospace',
    color: active ? 'var(--mz-bg)' : 'var(--mz-text-dim)',
    background: active ? ACCENT : alpha(ACCENT, 6),
    border: `1px solid ${active ? ACCENT : alpha(ACCENT, 22)}`,
    outline: 'none', fontWeight: active ? 'bold' : 'normal', transition: 'box-shadow 0.12s, background 0.12s, color 0.12s',
  })
  const inputStyle = {
    fontFamily: 'monospace', fontSize: 13, padding: '7px 9px', borderRadius: 4, flex: 1, minWidth: 0,
    color: 'var(--mz-text)', background: 'var(--mz-bg)', border: `1px solid ${alpha(ACCENT, 30)}`, outline: 'none',
  }
  const btnStyle = (disabled) => ({
    fontSize: 11, fontWeight: 'bold', letterSpacing: '0.04em', padding: '7px 14px', borderRadius: 4, flexShrink: 0,
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? 'var(--mz-text-faint)' : 'var(--mz-bg)',
    background: disabled ? alpha(ACCENT, 20) : ACCENT,
    border: `1px solid ${ACCENT}`, opacity: disabled ? 0.6 : 1, transition: 'all 0.12s',
  })
  const miniLabel = { fontSize: 10, color: 'var(--mz-text-faint)', width: 70, flexShrink: 0, letterSpacing: '0.04em' }
  const noteStyle = { fontSize: 10, color: 'var(--mz-text-faint)' }

  return (
    <div
      onClick={closeS3Cp}
      style={{
        position: 'absolute', inset: 0, zIndex: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'rgba(var(--mz-backdrop-rgb),0.88)', backdropFilter: 'blur(8px)',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: 'min(580px, 94vw)', display: 'flex', flexDirection: 'column',
          borderRadius: 8, background: 'rgba(var(--mz-surface-rgb),0.98)',
          border: `1px solid ${alpha(ACCENT, 28)}`, boxShadow: `0 0 50px ${alpha(ACCENT, 13)}`,
        }}
      >
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderBottom: `1px solid ${alpha(ACCENT, 9)}`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>S3 COPY</span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
              <span style={{ color: 'var(--mz-text-faint)' }}> · {bucket}</span>
            </span>
          </div>
          <button onClick={closeS3Cp}
            style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Download an object */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>DOWNLOAD OBJECT</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>Key</span>
              <input
                ref={keyRef}
                value={key}
                disabled={busy}
                onChange={e => setKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); download() } }}
                placeholder="path/to/object.json"
                spellCheck={false}
                style={inputStyle}
              />
              <button onClick={download} disabled={busy || !key.trim()}
                style={btnStyle(busy || !key.trim())}>{dlBusy ? 'Downloading…' : 'Download'}</button>
            </div>
            <span style={noteStyle}>The object is fetched to your browser as a file.</span>
          </div>

          {/* Upload an object */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>UPLOAD OBJECT</label>
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              onChange={e => {
                const f = e.target.files?.[0] || null
                setFile(f); setDone('')
                if (f && !ulKey.trim()) setUlKey(f.name)
              }} />
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>File</span>
              <button onClick={() => fileRef.current?.click()} disabled={busy} style={{ ...chipStyle(false), padding: '7px 12px' }}>
                Choose file…
              </button>
              <span style={{ fontSize: 11, color: file ? 'var(--mz-text)' : 'var(--mz-text-faint)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1, minWidth: 0 }}>
                {file ? `${file.name} (${fmtBytes(file.size)})` : 'no file chosen'}
              </span>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>Key</span>
              <input
                value={ulKey}
                disabled={busy}
                onChange={e => setUlKey(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); upload() } }}
                placeholder={file ? file.name : 'uploads/name.ext'}
                spellCheck={false}
                style={inputStyle}
              />
              <button onClick={upload} disabled={busy || !file || !ulKey.trim()}
                style={btnStyle(busy || !file || !ulKey.trim())}>{ulBusy ? 'Uploading…' : 'Upload'}</button>
            </div>
            <span style={noteStyle}>Uploads to <code>{bucket}/&lt;key&gt;</code>. Existing keys are overwritten.</span>
          </div>

          {/* Status */}
          {done && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--mz-ok)',
              background: alpha('var(--mz-ok)', 10), border: `1px solid ${alpha('var(--mz-ok)', 30)}`,
              borderRadius: 4, padding: '7px 9px', wordBreak: 'break-all',
            }}>✓ {done}</div>
          )}
          {error && (
            <div style={{
              fontSize: 11, fontFamily: 'monospace', color: 'var(--mz-danger-2)',
              background: alpha('var(--mz-danger)', 10), border: `1px solid ${alpha('var(--mz-danger)', 30)}`,
              borderRadius: 4, padding: '7px 9px', whiteSpace: 'pre-wrap', maxHeight: 140, overflow: 'auto',
            }}>{error}</div>
          )}
          {awsDemo && (
            <div style={{ fontSize: 10, color: 'rgba(var(--mz-warn-rgb), 0.7)' }}>
              demo mode - download serves mock content; upload needs live AWS.
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '10px 16px', borderTop: `1px solid ${alpha(ACCENT, 9)}`,
        }}>
          <span style={{ fontSize: 10, color: 'var(--mz-text-faint)' }}>esc · close</span>
        </div>
      </div>
    </div>
  )
}

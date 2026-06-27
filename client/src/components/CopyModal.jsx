import { useEffect, useRef, useState } from 'react'
import { alpha } from '../theme'
import { useStore } from '../store'

const ACCENT = 'var(--mz-accent-2)'
const enc = encodeURIComponent

// Human-readable byte size for the picked upload file.
function fmtBytes(n) {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / (1024 * 1024)).toFixed(1)} MB`
}

// kubectl-cp-style file transfer dialog (#108): copy a file out of a container to the browser
// (download), or push a browser-picked file into the container (upload). Mirrors the shell/debug
// dialogs - a container picker (when the pod has more than one) plus the two transfer forms. The
// server runs the real `kubectl cp`, so the target container needs `tar`.
export function CopyModal() {
  const cpModal = useStore(s => s.cpModal)
  const closeCp = useStore(s => s.closeCp)
  const demoMode = useStore(s => s.demoMode)

  const [container, setContainer] = useState('')
  const [remotePath, setRemotePath] = useState('')
  const [dlName, setDlName] = useState('')       // optional download rename (blank = path basename)
  const [dlFormat, setDlFormat] = useState('auto') // auto | tar | tgz | zip
  const [destDir, setDestDir] = useState('/tmp')
  const [file, setFile] = useState(null)
  const [ulName, setUlName] = useState('')       // optional upload rename (blank = original name)
  const [dlBusy, setDlBusy] = useState(false)
  const [ulBusy, setUlBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState('')
  const pathRef = useRef(null)
  const fileRef = useRef(null)

  // Reset the form each time the dialog opens for a new pod/container.
  useEffect(() => {
    if (!cpModal) return
    setContainer(cpModal.container || '')
    setRemotePath(''); setDlName(''); setDlFormat('auto')
    setDestDir('/tmp'); setFile(null); setUlName('')
    setDlBusy(false); setUlBusy(false)
    setError(''); setDone('')
    const t = setTimeout(() => pathRef.current?.focus(), 0)
    return () => clearTimeout(t)
  }, [cpModal])

  if (!cpModal) return null
  const { namespace, pod, containers = [], label } = cpModal

  const base = (path) => (path || '').replace(/\/+$/, '').split('/').pop() || 'download'

  const download = async () => {
    const p = remotePath.trim()
    if (!p || dlBusy) return
    setDlBusy(true); setError(''); setDone('')
    try {
      let url = `/api/cp/${enc(namespace || 'default')}/${enc(pod)}/${enc(container)}?path=${enc(p)}&format=${dlFormat}`
      if (dlName.trim()) url += `&name=${enc(dlName.trim())}`
      const res = await fetch(url) // the auth fetch wrapper adds the Bearer token (#97)
      if (!res.ok) {
        let msg = `Download failed (${res.status})`
        try { const j = await res.json(); if (j.error) msg = j.error } catch { /* non-JSON body */ }
        setError(msg); return
      }
      const blob = await res.blob()
      const cd = res.headers.get('Content-Disposition') || ''
      const m = /filename="?([^"]+)"?/.exec(cd)
      const fname = m ? m[1] : base(p)
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
    const dir = destDir.trim()
    if (!file || !dir || ulBusy) return
    const saveName = ulName.trim() || file.name   // rename on upload, or keep the original name
    setUlBusy(true); setError(''); setDone('')
    try {
      const url = `/api/cp/${enc(namespace || 'default')}/${enc(pod)}/${enc(container)}?path=${enc(dir)}&name=${enc(saveName)}`
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file, // fetch sends the File's raw bytes; express.raw stages them server-side
      })
      let data = {}
      try { data = await res.json() } catch { /* non-JSON */ }
      if (!res.ok || !data.ok) { setError(data.error || `Upload failed (${res.status})`); return }
      setDone(`Uploaded to ${data.path || `${dir}/${saveName}`}`)
    } catch (e) {
      setError(e.message || 'Upload failed')
    } finally {
      setUlBusy(false)
    }
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); closeCp() }
  }

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
  const FORMATS = ['auto', 'tar', 'tgz', 'zip']
  const dlPlaceholder = remotePath.trim() ? base(remotePath) : 'optional new name'

  return (
    <div
      onClick={closeCp}
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
            <span style={{ fontSize: 11, fontWeight: 'bold', letterSpacing: '0.12em', color: ACCENT }}>COPY</span>
            <span style={{ fontSize: 11, color: 'var(--mz-accent-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {label}
              {namespace && <span style={{ color: 'var(--mz-text-faint)' }}> · {namespace}</span>}
            </span>
          </div>
          <button onClick={closeCp}
            style={{ fontSize: 18, lineHeight: 1, color: 'var(--mz-text-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px' }}
            onMouseEnter={e => e.target.style.color = 'var(--mz-text)'}
            onMouseLeave={e => e.target.style.color = 'var(--mz-text-dim)'}
          >×</button>
        </div>

        {/* Body */}
        <div style={{ padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Container picker - only when the pod has more than one container. */}
          {containers.length > 1 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>CONTAINER</label>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                {containers.map(c => (
                  <button key={c} disabled={busy} onClick={() => setContainer(c)}
                    onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${alpha(ACCENT, 45)}`}
                    onBlur={e => e.target.style.boxShadow = 'none'}
                    style={chipStyle(container === c)}>{c}</button>
                ))}
              </div>
            </div>
          )}

          {/* Download from the container */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>DOWNLOAD FROM CONTAINER</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>Path</span>
              <input
                ref={pathRef}
                value={remotePath}
                disabled={busy}
                onChange={e => setRemotePath(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); download() } }}
                placeholder="/etc/config/app.conf"
                spellCheck={false}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>Save as</span>
              <input
                value={dlName}
                disabled={busy}
                onChange={e => setDlName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); download() } }}
                placeholder={dlPlaceholder}
                spellCheck={false}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>Format</span>
              <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', flex: 1 }}>
                {FORMATS.map(f => (
                  <button key={f} disabled={busy} onClick={() => setDlFormat(f)}
                    onFocus={e => e.target.style.boxShadow = `0 0 0 2px ${alpha(ACCENT, 45)}`}
                    onBlur={e => e.target.style.boxShadow = 'none'}
                    style={chipStyle(dlFormat === f)}>{f === 'auto' ? 'Auto' : f}</button>
                ))}
              </div>
              <button onClick={download} disabled={busy || demoMode || !remotePath.trim() || !container}
                style={btnStyle(busy || demoMode || !remotePath.trim() || !container)}>{dlBusy ? 'Downloading…' : 'Download'}</button>
            </div>
            <span style={noteStyle}>
              Folders download as an archive in the selected format.
            </span>
          </div>

          {/* Upload into the container */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <label style={{ fontSize: 10, letterSpacing: '0.1em', color: 'var(--mz-text-faint)' }}>UPLOAD TO CONTAINER</label>
            <input ref={fileRef} type="file" style={{ display: 'none' }}
              onChange={e => { setFile(e.target.files?.[0] || null); setDone('') }} />
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
              <span style={miniLabel}>Path</span>
              <input
                value={destDir}
                disabled={busy}
                onChange={e => setDestDir(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); upload() } }}
                placeholder="/tmp"
                spellCheck={false}
                style={inputStyle}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={miniLabel}>Save as</span>
              <input
                value={ulName}
                disabled={busy}
                onChange={e => setUlName(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); upload() } }}
                placeholder={file ? file.name : 'optional new name'}
                spellCheck={false}
                style={inputStyle}
              />
              <button onClick={upload} disabled={busy || demoMode || !file || !destDir.trim() || !container}
                style={btnStyle(busy || demoMode || !file || !destDir.trim() || !container)}>{ulBusy ? 'Uploading…' : 'Upload'}</button>
            </div>
            <span style={noteStyle}>
              The file is copied into the destination directory under the chosen name.
            </span>
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
          {demoMode && (
            <div style={{ fontSize: 10, color: 'rgba(var(--mz-warn-rgb), 0.7)' }}>
              demo mode - file copy needs a live cluster.
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

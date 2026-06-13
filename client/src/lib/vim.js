// Pure vim-ish motions and operators over (text, pos).
//
// `pos` is a character offset into `text`; by the block-cursor convention it is the
// character the cursor sits *on*. Motions return a new pos. Operators return
// `{ text, pos, yank?, linewise? }`. Everything here is pure — ActionModal owns the
// React state (editContent / editCursor / register) and just applies these results.

// ── Line geometry ─────────────────────────────────────────────────────────────

export function lineStartOf(text, pos) {
  return text.lastIndexOf('\n', Math.max(0, pos - 1)) + 1
}
export function lineEndOf(text, pos) {       // index of the line's '\n', or text.length
  const e = text.indexOf('\n', pos)
  return e === -1 ? text.length : e
}
export function lineInfo(text, pos) {
  const start = lineStartOf(text, pos)
  const end   = lineEndOf(text, pos)
  return { start, end, col: pos - start, len: end - start }
}
// Clamp a position to the printable span of its line: [start, max(start, end-1)].
export function clampToLine(text, pos) {
  const { start, end } = lineInfo(text, pos)
  return Math.min(Math.max(pos, start), Math.max(start, end - 1))
}

// ── Motions ─────────────────────────────────────────────────────────────────

export function left(text, pos)  { const { start } = lineInfo(text, pos); return Math.max(start, pos - 1) }
export function right(text, pos) { const { start, end } = lineInfo(text, pos); return Math.min(Math.max(start, end - 1), pos + 1) }
export function lineStart(text, pos) { return lineStartOf(text, pos) }
export function lineEnd(text, pos)   { const { start, end } = lineInfo(text, pos); return Math.max(start, end - 1) }

export function firstNonBlank(text, pos) {
  const { start, end } = lineInfo(text, pos)
  let i = start
  while (i < end && (text[i] === ' ' || text[i] === '\t')) i++
  return Math.min(i, Math.max(start, end - 1))
}

export function up(text, pos) {
  const { start, col } = lineInfo(text, pos)
  if (start === 0) return pos
  const prevEnd   = start - 1
  const prevStart = lineStartOf(text, prevEnd)
  return Math.min(prevStart + col, Math.max(prevStart, prevEnd - 1))
}
export function down(text, pos) {
  const { end, col } = lineInfo(text, pos)
  if (end >= text.length) return pos
  const nextStart = end + 1
  const nextEnd   = lineEndOf(text, nextStart)
  return Math.min(nextStart + col, Math.max(nextStart, nextEnd - 1))
}

const isWord = c => /\w/.test(c)
export function wordForward(text, pos) {
  const n = text.length
  let i = pos
  if (i < n && isWord(text[i]))       while (i < n && isWord(text[i])) i++
  else                                while (i < n && !isWord(text[i]) && text[i] !== '\n') i++
  while (i < n && /\s/.test(text[i])) i++
  return Math.min(i, Math.max(0, n - 1))
}
export function wordBack(text, pos) {
  let i = pos - 1
  while (i > 0 && /\s/.test(text[i]))     i--
  while (i > 0 && isWord(text[i - 1]))    i--
  return Math.max(0, i)
}

export function fileStart() { return 0 }
export function fileEnd(text) { return firstNonBlank(text, lineStartOf(text, text.length)) }

// ── Operators ─────────────────────────────────────────────────────────────────

export function deleteCharAt(text, pos) {
  const { end } = lineInfo(text, pos)
  if (pos >= end) return { text, pos, yank: '', linewise: false }     // nothing under cursor
  const yank = text[pos]
  const nt   = text.slice(0, pos) + text.slice(pos + 1)
  return { text: nt, pos: clampToLine(nt, pos), yank, linewise: false }
}

export function deleteToLineEnd(text, pos) {
  const { end } = lineInfo(text, pos)
  const yank = text.slice(pos, end)
  const nt   = text.slice(0, pos) + text.slice(end)
  return { text: nt, pos: clampToLine(nt, pos), yank, linewise: false }
}

export function deleteLine(text, pos) {
  const { start, end } = lineInfo(text, pos)
  const yank   = text.slice(start, end) + '\n'
  let delStart = start
  let delEnd   = end < text.length ? end + 1 : end       // swallow trailing newline if present
  if (delEnd === text.length && start > 0) delStart = start - 1   // last line: take preceding newline
  const nt = text.slice(0, delStart) + text.slice(delEnd)
  return { text: nt, pos: firstNonBlank(nt, Math.min(delStart, Math.max(0, nt.length - 1))), yank, linewise: true }
}

export function yankLine(text, pos) {
  const { start, end } = lineInfo(text, pos)
  return { text: text.slice(start, end) + '\n', linewise: true }
}

// Inclusive char range [a..b] (used by visual mode).
export function rangeText(text, a, b) {
  const lo = Math.min(a, b), hi = Math.min(Math.max(a, b) + 1, text.length)
  return text.slice(lo, hi)
}
export function deleteRange(text, a, b) {
  const lo = Math.min(a, b), hi = Math.min(Math.max(a, b) + 1, text.length)
  const yank = text.slice(lo, hi)
  const nt   = text.slice(0, lo) + text.slice(hi)
  return { text: nt, pos: clampToLine(nt, Math.min(lo, Math.max(0, nt.length - 1))), yank, linewise: false }
}

// Paste register `reg = { text, linewise }`. `before` = P, else p.
export function put(text, pos, reg, before) {
  if (!reg || !reg.text) return { text, pos }
  if (reg.linewise) {
    const { start, end } = lineInfo(text, pos)
    if (before) {
      const nt = text.slice(0, start) + reg.text + text.slice(start)
      return { text: nt, pos: firstNonBlank(nt, start) }
    }
    if (end >= text.length) {                       // last line, no trailing newline
      const body = reg.text.replace(/\n$/, '')
      const nt = text.slice(0, end) + '\n' + body + text.slice(end)
      return { text: nt, pos: firstNonBlank(nt, end + 1) }
    }
    const at = end + 1
    const nt = text.slice(0, at) + reg.text + text.slice(at)
    return { text: nt, pos: firstNonBlank(nt, at) }
  }
  const at = before ? pos : Math.min(pos + 1, text.length)
  const nt = text.slice(0, at) + reg.text + text.slice(at)
  return { text: nt, pos: at + reg.text.length - 1 }
}

// `o` / `O` — open a new line (with the current line's indentation) and return the
// caret position to start inserting at.
export function openBelow(text, pos) {
  const { start, end } = lineInfo(text, pos)
  const indent = (text.slice(start, end).match(/^[ \t]*/) || [''])[0]
  const nt = text.slice(0, end) + '\n' + indent + text.slice(end)
  return { text: nt, pos: end + 1 + indent.length }
}
export function openAbove(text, pos) {
  const { start, end } = lineInfo(text, pos)
  const indent = (text.slice(start, end).match(/^[ \t]*/) || [''])[0]
  const nt = text.slice(0, start) + indent + '\n' + text.slice(start)
  return { text: nt, pos: start + indent.length }
}

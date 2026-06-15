export const STATUS_COLORS = {
  Running:     '#00ffaa',
  Pending:     '#ffcc00',
  Failed:      '#ff4455',
  Succeeded:   '#4488ff',
  Available:   '#00ffaa',
  Degraded:    '#ff4455',
  Progressing: '#44aaff',
  'Scaled Down':'#667788',
  Active:      '#00d4ff',
  Complete:    '#4488ff',
  Completed:   '#4488ff',
  Bound:       '#00ffaa',
  Ready:       '#00ffaa',
  Released:    '#aa55ff',
  NotReady:    '#ff4455',
  Suspended:   '#ffcc00',
  Deployed:    '#00ffaa',
  Superseded:  '#667788',
  Terminating: '#ffcc00',
  ContainerCreating: '#ffcc00',
  Unknown:     '#667788',
  Normal:      '#00d4ff',
  Warning:     '#ffcc00',
  Blocking:    '#ff4455',
}

// Resolve a color for a status string. Falls back to pattern-matching so dynamic
// kubectl-style statuses (ImagePullBackOff, CrashLoopBackOff, ErrImagePull, OOMKilled,
// Init:…, Evicted, etc.) still surface the right severity color.
export function statusColor(status) {
  if (!status) return STATUS_COLORS.Unknown
  if (STATUS_COLORS[status]) return STATUS_COLORS[status]
  if (/BackOff|Err|Error|Fail|Evicted|OOM|Lost|Unreachable|CrashLoop/i.test(status)) return '#ff4455'
  if (/Creating|Pending|Init|Waiting|Progress|Terminating|NotReady|Scaling/i.test(status)) return '#ffcc00'
  if (/Completed|Succeeded|Bound|Ready|Running|Active|Available|Deployed/i.test(status)) return '#00ffaa'
  return STATUS_COLORS.Unknown
}

export const NS_COLORS = [
  '#00d4ff', '#aa55ff', '#ffaa00', '#00ffaa',
  '#ff4488', '#44aaff', '#ffdd00', '#88ffaa',
  '#ff8844', '#55ddff', '#cc88ff', '#66ffcc',
]

// Stable per-name color: a given namespace always maps to the same hue regardless of which
// other namespaces happen to be present. (The old positional indexing made a namespace's
// color shift whenever the set of namespaces changed — that's the "random colors" in #69.)
export function getNsColor(namespace) {
  if (!namespace) return '#2a4a6a'
  let h = 0
  for (let i = 0; i < namespace.length; i++) h = (Math.imul(31, h) + namespace.charCodeAt(i)) | 0
  return NS_COLORS[Math.abs(h) % NS_COLORS.length]
}

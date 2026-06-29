import { ACTIVE } from './theme'

// Status colors are theme-driven: the active theme maps each status to a semantic
// token (ok/warn/danger/info/…) and we resolve that token to its hex. These return
// real hex strings (not CSS vars) because callers do `${color}<alpha>` math.

function tok(name) {
  return ACTIVE.tokens[name] || ACTIVE.tokens['text-dim']
}

// Resolve a color for a status string. Known statuses go through the theme's status
// map; unknown/dynamic kubectl statuses (ImagePullBackOff, CrashLoopBackOff, Init:…,
// Evicted, OOMKilled, …) fall back to pattern-matching for the right severity.
export function statusColor(status) {
  if (!status) return tok('neutral')
  const mapped = ACTIVE.status[status]
  if (mapped) return tok(mapped)
  // ...Terminated covers EC2 'terminated' (distinct from k8s 'Terminating', which is warn below).
  if (/BackOff|Err|Error|Fail|Evicted|OOM|Lost|Unreachable|CrashLoop|Terminated/i.test(status)) return tok('danger')
  // ...Stopping/ShuttingDown EC2; Modifying RDS; Unassociated EIP (idle, costs money). Checked
  // before the ok line so 'Unassociated' wins over the 'Associated' substring there.
  if (/Creating|Pending|Init|Waiting|Progress|Terminating|NotReady|Scaling|Stopping|ShuttingDown|Modifying|Unassociated/i.test(status)) return tok('warn')
  // ...In-use (EBS attached) and Associated (EIP attached) are healthy AWS states.
  if (/Completed|Succeeded|Bound|Ready|Running|Active|Available|Deployed|In-use|Associated/i.test(status)) return tok('ok')
  return tok('neutral')
}

// Stable per-name namespace color: a given namespace always maps to the same hue from
// the active theme's palette regardless of which other namespaces are present (#69).
export function getNsColor(namespace) {
  if (!namespace) return tok('text-faint')
  const palette = ACTIVE.ns
  let h = 0
  for (let i = 0; i < namespace.length; i++) h = (Math.imul(31, h) + namespace.charCodeAt(i)) | 0
  return palette[Math.abs(h) % palette.length]
}

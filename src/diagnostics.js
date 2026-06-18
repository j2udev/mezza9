// Cluster Health scanner (#78) - pure heuristics over already-fetched resource state, no I/O.
// Reuses the kubectl-style status strings k8s.js already derives (podStatus/deployStatus/
// applyWorkloadHealth) rather than re-deriving health from raw container statuses.

const POD_BAD_STATUSES = new Set([
  'CrashLoopBackOff', 'ImagePullBackOff', 'ErrImagePull', 'OOMKilled', 'Error', 'Pending',
])
const HIGH_RESTART_THRESHOLD = 5

// `status` mirrors severity through one of the existing recognized status strings
// (statusColor()'s map / regex fallback in constants.js) so the row's status dot and the
// severity column resolve to the same danger/warn color without a special case there.
function mkFinding(resource, item, severity, title, detail, checkId) {
  return {
    id: `${resource}/${item.namespace}/${item.name}/${checkId}`,
    resource, namespace: item.namespace, name: item.name, severity, title, detail,
    status: severity === 'critical' ? 'Failed' : 'Warning',
  }
}

export function scanCluster(latest) {
  const findings = []

  for (const p of latest.pods || []) {
    if (p.status?.startsWith('Init:') || POD_BAD_STATUSES.has(p.status)) {
      const severity = p.status === 'Pending' ? 'warning' : 'critical'
      findings.push(mkFinding('pods', p, severity, p.status,
        `Pod ${p.name} is in status ${p.status}.`, 'status'))
    } else if (p.restarts >= HIGH_RESTART_THRESHOLD) {
      findings.push(mkFinding('pods', p, 'warning', 'High restart count',
        `Pod ${p.name} has restarted ${p.restarts} times.`, 'restarts'))
    }
  }

  for (const resource of ['deployments', 'statefulsets', 'daemonsets']) {
    for (const w of latest[resource] || []) {
      if (w.status === 'Degraded') {
        findings.push(mkFinding(resource, w, 'warning', 'Degraded',
          `${w.name} is Degraded - fewer replicas ready/available than desired.`, 'degraded'))
      }
    }
  }

  for (const pvc of latest.pvcs || []) {
    if (pvc.status === 'Pending') {
      findings.push(mkFinding('pvcs', pvc, 'warning', 'Pending',
        `PVC ${pvc.name} is stuck Pending - check for a matching StorageClass/PV.`, 'pending'))
    }
  }

  return findings
}

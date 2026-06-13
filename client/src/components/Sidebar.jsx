import { useState } from 'react'
import { useStore } from '../store'

const GROUPS = [
  {
    label: 'WORKLOADS',
    items: [
      { key: 'pods',         label: 'Pods',         color: '#00d4ff' },
      { key: 'deployments',  label: 'Deployments',  color: '#aa55ff' },
      { key: 'replicasets',  label: 'ReplicaSets',  color: '#aa55ff' },
      { key: 'statefulsets', label: 'StatefulSets', color: '#aa55ff' },
      { key: 'daemonsets',   label: 'DaemonSets',   color: '#aa55ff' },
      { key: 'jobs',         label: 'Jobs',         color: '#ffaa00' },
      { key: 'cronjobs',     label: 'CronJobs',     color: '#ffaa00' },
      { key: 'hpa',          label: 'HPA',          color: '#ffaa00' },
      { key: 'pdb',          label: 'PDB',          color: '#ffaa00' },
    ],
  },
  {
    label: 'NETWORK',
    items: [
      { key: 'services',        label: 'Services',         color: '#ffaa00' },
      { key: 'ingresses',       label: 'Ingresses',        color: '#ffaa00' },
      { key: 'networkpolicies', label: 'Network Policies', color: '#ff4488' },
    ],
  },
  {
    label: 'CONFIG',
    items: [
      { key: 'configmaps',     label: 'ConfigMaps',      color: '#44aaff' },
      { key: 'secrets',        label: 'Secrets',         color: '#ff4488' },
      { key: 'serviceaccounts',label: 'Svc Accounts',    color: '#44aaff' },
      { key: 'resourcequotas', label: 'Resource Quotas', color: '#44aaff' },
    ],
  },
  {
    label: 'STORAGE',
    items: [
      { key: 'pvcs',          label: 'PVCs',               color: '#88ffaa' },
      { key: 'pvs',           label: 'Persistent Volumes', color: '#88ffaa' },
      { key: 'storageclasses',label: 'Storage Classes',    color: '#88ffaa' },
    ],
  },
  {
    label: 'RBAC',
    items: [
      { key: 'roles',               label: 'Roles',                color: '#ff8844' },
      { key: 'clusterroles',        label: 'Cluster Roles',        color: '#ff8844' },
      { key: 'rolebindings',        label: 'Role Bindings',        color: '#ff8844' },
      { key: 'clusterrolebindings', label: 'Cluster Role Bindings',color: '#ff8844' },
    ],
  },
  {
    label: 'CLUSTER',
    items: [
      { key: 'nodes',      label: 'Nodes',      color: '#00d4ff' },
      { key: 'namespaces', label: 'Namespaces', color: '#00d4ff' },
      { key: 'events',     label: 'Events',     color: '#ffcc44' },
    ],
  },
  {
    label: 'HELM',
    items: [
      { key: 'helmreleases', label: 'Releases', color: '#00ffaa' },
    ],
  },
]

function SidebarItem({ isActive, color, label, count, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', height: 28,
        paddingLeft: 16, paddingRight: 8, cursor: 'pointer',
        borderLeft: `2px solid ${isActive ? color : 'transparent'}`,
        background: isActive ? `${color}12` : 'transparent',
        transition: 'background 0.12s', userSelect: 'none',
      }}
      onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
      onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
    >
      <span style={{ flex: 1, fontSize: 11, color: isActive ? color : '#5a8aaa', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: isActive ? `${color}99` : '#3a6a8a', fontFamily: 'inherit', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
        {count ?? 0}
      </span>
    </div>
  )
}

function SectionLabel({ children, collapsed, onToggle }) {
  return (
    <div
      onClick={onToggle}
      style={{
        padding: '6px 8px 4px', fontSize: 9, letterSpacing: '0.14em',
        color: '#4a8aaa', fontWeight: 'bold', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        background: 'rgba(0,212,255,0.04)',
        borderTop: '1px solid rgba(0,212,255,0.07)',
        borderBottom: '1px solid rgba(0,212,255,0.05)',
        marginTop: 2,
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#6aaac8'}
      onMouseLeave={e => e.currentTarget.style.color = '#4a8aaa'}
    >
      <span>{children}</span>
      <span style={{ fontSize: 8, opacity: 0.6 }}>{collapsed ? '›' : '˅'}</span>
    </div>
  )
}

export function Sidebar() {
  const activeResource    = useStore(s => s.activeResource)
  const collapsed         = useStore(s => s.sidebarCollapsed)
  const toggleSidebar     = useStore(s => s.toggleSidebar)
  const setActiveResource = useStore(s => s.setActiveResource)
  const crds              = useStore(s => s.crds)
  const fetchCrdResources = useStore(s => s.fetchCrdResources)

  const [groupCollapsed, setGroupCollapsed] = useState({})
  const toggleGroup = label =>
    setGroupCollapsed(prev => ({ ...prev, [label]: !prev[label] }))

  const counts = {
    pods:                useStore(s => s.pods.length),
    deployments:         useStore(s => s.deployments.length),
    replicasets:         useStore(s => s.replicasets.length),
    statefulsets:        useStore(s => s.statefulsets.length),
    daemonsets:          useStore(s => s.daemonsets.length),
    jobs:                useStore(s => s.jobs.length),
    cronjobs:            useStore(s => s.cronjobs.length),
    hpa:                 useStore(s => s.hpa.length),
    pdb:                 useStore(s => s.pdb.length),
    services:            useStore(s => s.services.length),
    ingresses:           useStore(s => s.ingresses.length),
    networkpolicies:     useStore(s => s.networkpolicies.length),
    configmaps:          useStore(s => s.configmaps.length),
    secrets:             useStore(s => s.secrets.length),
    serviceaccounts:     useStore(s => s.serviceaccounts.length),
    resourcequotas:      useStore(s => s.resourcequotas.length),
    pvcs:                useStore(s => s.pvcs.length),
    pvs:                 useStore(s => s.pvs.length),
    storageclasses:      useStore(s => s.storageclasses.length),
    roles:               useStore(s => s.roles.length),
    clusterroles:        useStore(s => s.clusterroles.length),
    rolebindings:        useStore(s => s.rolebindings.length),
    clusterrolebindings: useStore(s => s.clusterrolebindings.length),
    nodes:               useStore(s => s.nodes.length),
    namespaces:          useStore(s => s.namespaces.length),
    events:              useStore(s => s.events.length),
    helmreleases:        useStore(s => s.helmreleases.length),
  }

  return (
    <div style={{
      position: 'absolute', top: 44, bottom: 36, left: 0,
      width: collapsed ? 36 : 200,
      background: 'rgba(2, 8, 24, 0.97)',
      borderRight: '1px solid rgba(0, 212, 255, 0.07)',
      display: 'flex', flexDirection: 'column',
      transition: 'width 0.18s ease', overflow: 'hidden',
      zIndex: 5, flexShrink: 0,
    }}>
      {/* Collapse toggle — top */}
      <div
        onClick={toggleSidebar}
        style={{
          height: 30, display: 'flex', alignItems: 'center',
          justifyContent: collapsed ? 'center' : 'flex-end',
          paddingRight: collapsed ? 0 : 10,
          cursor: 'pointer', borderBottom: '1px solid rgba(0,212,255,0.06)',
          color: '#3a5a7a', fontSize: 14, lineHeight: 1,
          flexShrink: 0, transition: 'color 0.12s', userSelect: 'none',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#00d4ff'}
        onMouseLeave={e => e.currentTarget.style.color = '#3a5a7a'}
        title={collapsed ? 'Expand sidebar (ctrl+b)' : 'Collapse sidebar (ctrl+b)'}
      >
        {collapsed ? '›' : '‹'}
      </div>

      {!collapsed && (
        <div style={{ overflowY: 'auto', flex: 1, paddingBottom: 4 }}>
          {GROUPS.map(group => {
            const isGroupCollapsed = !!groupCollapsed[group.label]
            return (
              <div key={group.label}>
                <SectionLabel collapsed={isGroupCollapsed} onToggle={() => toggleGroup(group.label)}>
                  {group.label}
                </SectionLabel>
                {!isGroupCollapsed && group.items.map(({ key, label, color }) => (
                  <SidebarItem
                    key={key}
                    isActive={activeResource === key}
                    color={color} label={label} count={counts[key]}
                    onClick={() => setActiveResource(key)}
                  />
                ))}
              </div>
            )
          })}

          {crds.length > 0 && (
            <div>
              <SectionLabel
                collapsed={!!groupCollapsed['CUSTOM']}
                onToggle={() => toggleGroup('CUSTOM')}
              >
                CUSTOM ({crds.length})
              </SectionLabel>
              {!groupCollapsed['CUSTOM'] && crds.map(crd => {
                const crKey = `cr:${crd.group}/${crd.version}/${crd.plural}`
                const isActive = activeResource === crKey
                return (
                  <div
                    key={crd.id}
                    onClick={() => fetchCrdResources(crd.group, crd.version, crd.plural)}
                    style={{
                      display: 'flex', alignItems: 'center', height: 28,
                      paddingLeft: 16, paddingRight: 8, cursor: 'pointer',
                      borderLeft: `2px solid ${isActive ? '#aa55ff' : 'transparent'}`,
                      background: isActive ? '#aa55ff12' : 'transparent',
                      transition: 'background 0.12s', userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ flex: 1, fontSize: 11, color: isActive ? '#aa55ff' : '#5a8aaa', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {crd.kind}
                    </span>
                    <span style={{ fontSize: 9, color: '#3a6a8a', fontFamily: 'monospace', flexShrink: 0 }}>
                      {crd.group.split('.')[0]}
                    </span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

    </div>
  )
}

import { useState } from 'react'
import { useStore } from '../store'

// One accent color per section — color now encodes the resource *category* instead of
// being seemingly-random per item (#69). The highlight/active color a row gets is its
// group's color, so clicking around the sidebar reads as a coherent scheme.
const CUSTOM_COLOR = '#cc88ff'
const GROUPS = [
  {
    label: 'WORKLOADS', color: '#00d4ff',
    items: [
      { key: 'pods',         label: 'Pods'         },
      { key: 'deployments',  label: 'Deployments'  },
      { key: 'replicasets',  label: 'ReplicaSets'  },
      { key: 'statefulsets', label: 'StatefulSets' },
      { key: 'daemonsets',   label: 'DaemonSets'   },
      { key: 'jobs',         label: 'Jobs'         },
      { key: 'cronjobs',     label: 'CronJobs'     },
      { key: 'hpa',          label: 'HPA'          },
      { key: 'pdb',          label: 'PDB'          },
    ],
  },
  {
    label: 'NETWORK', color: '#ffaa00',
    items: [
      { key: 'services',        label: 'Services'         },
      { key: 'ingresses',       label: 'Ingresses'        },
      { key: 'networkpolicies', label: 'Network Policies' },
    ],
  },
  {
    label: 'CONFIG', color: '#aa55ff',
    items: [
      { key: 'configmaps',     label: 'ConfigMaps'      },
      { key: 'secrets',        label: 'Secrets'         },
      { key: 'serviceaccounts',label: 'Svc Accounts'    },
      { key: 'resourcequotas', label: 'Resource Quotas' },
    ],
  },
  {
    label: 'STORAGE', color: '#88ffaa',
    items: [
      { key: 'pvcs',          label: 'PVCs'               },
      { key: 'pvs',           label: 'Persistent Volumes' },
      { key: 'storageclasses',label: 'Storage Classes'    },
    ],
  },
  {
    label: 'RBAC', color: '#ff8844',
    items: [
      { key: 'roles',               label: 'Roles'                },
      { key: 'clusterroles',        label: 'Cluster Roles'        },
      { key: 'rolebindings',        label: 'Role Bindings'        },
      { key: 'clusterrolebindings', label: 'Cluster Role Bindings'},
    ],
  },
  {
    label: 'CLUSTER', color: '#44aaff',
    items: [
      { key: 'nodes',      label: 'Nodes'      },
      { key: 'namespaces', label: 'Namespaces' },
      { key: 'events',     label: 'Events'     },
    ],
  },
  {
    label: 'HELM', color: '#00ffaa',
    items: [
      { key: 'helmreleases', label: 'Releases' },
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
      <span style={{ flex: 1, fontSize: 11, color: isActive ? color : '#84b0ce', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      <span style={{ fontSize: 10, color: isActive ? `${color}99` : '#6298ba', fontFamily: 'inherit', minWidth: 20, textAlign: 'right', flexShrink: 0 }}>
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
        color: '#72b0d0', fontWeight: 'bold', userSelect: 'none',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        cursor: 'pointer',
        background: 'rgba(0,212,255,0.04)',
        borderTop: '1px solid rgba(0,212,255,0.07)',
        borderBottom: '1px solid rgba(0,212,255,0.05)',
        marginTop: 2,
      }}
      onMouseEnter={e => e.currentTarget.style.color = '#6aaac8'}
      onMouseLeave={e => e.currentTarget.style.color = '#72b0d0'}
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
      background: 'rgba(12,20,36,0.97)',
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
          color: '#5e88aa', fontSize: 14, lineHeight: 1,
          flexShrink: 0, transition: 'color 0.12s', userSelect: 'none',
        }}
        onMouseEnter={e => e.currentTarget.style.color = '#00d4ff'}
        onMouseLeave={e => e.currentTarget.style.color = '#5e88aa'}
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
                {!isGroupCollapsed && group.items.map(({ key, label }) => (
                  <SidebarItem
                    key={key}
                    isActive={activeResource === key}
                    color={group.color} label={label} count={counts[key]}
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
                      borderLeft: `2px solid ${isActive ? CUSTOM_COLOR : 'transparent'}`,
                      background: isActive ? `${CUSTOM_COLOR}12` : 'transparent',
                      transition: 'background 0.12s', userSelect: 'none',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'rgba(255,255,255,0.04)' }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
                  >
                    <span style={{ flex: 1, fontSize: 11, color: isActive ? CUSTOM_COLOR : '#84b0ce', fontFamily: 'inherit', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {crd.kind}
                    </span>
                    <span style={{ fontSize: 9, color: '#6298ba', fontFamily: 'monospace', flexShrink: 0 }}>
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

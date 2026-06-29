// AWS provider resource registry (client side) - the intra-AWS extensibility core. Each AWS
// resource type declares its presentation ONCE here: label, after-name column specs, drill target,
// aliases. The shared shell components (ResourceList header, ResourceRow, Sidebar, store) read from
// this instead of hardcoding S3/EC2 into their switch statements, so adding RDS / Lambda / IAM /
// VPC / ... later is ONE entry here (+ one backend SERVICES entry) and nothing else. This registry
// is also a scoped first draft of the eventual cross-provider plugin contract (see modules.md).

import { statusColor } from '../constants'

const dim = 'var(--mz-text-dim)'
const alt = 'var(--mz-alt)'
const a2 = 'var(--mz-accent-2)'
const accent = 'var(--mz-accent)'
const faint = 'var(--mz-text-faint)'

// A column spec carries everything BOTH consumers need: ResourceList's header row (header + w) and
// ResourceRow's cells (value + color + w + mono/right). `color` may be a constant token or a
// function of the item (e.g. status-driven). NAME is rendered first by both components, so these
// are the columns AFTER name.
export const AWS_RESOURCES = {
  s3buckets: {
    label: 'S3 Buckets',
    drill: 's3objects',          // Enter -> async store.drillIntoBucket() (objects are fetched, not embedded)
    // No REGION column: the shared scope column (the region axis) already shows it in flat mode.
    columns: [
      { header: 'SIZE',    w: 90,  value: i => i.size,    color: dim, mono: true },
      { header: 'OBJECTS', w: 80,  value: i => i.objects, color: a2 },
      { header: 'AGE',     w: 55,  value: i => i.age,     color: dim, right: true },
    ],
  },
  ec2instances: {
    label: 'EC2 Instances',
    columns: [
      { header: 'STATE',      w: 96,  value: i => i.status,         color: i => statusColor(i.status) },
      { header: 'TYPE',       w: 104, value: i => i.type,           color: alt, mono: true },
      { header: 'ZONE',       w: 104, value: i => i.az,             color: dim },
      { header: 'PRIVATE-IP', w: 120, value: i => i.privateIp,      color: a2, mono: true },
      { header: 'PUBLIC-IP',  w: 120, value: i => i.publicIp || '', color: i => (i.publicIp ? accent : faint), mono: true },
      { header: 'AGE',        w: 55,  value: i => i.age,            color: dim, right: true },
    ],
  },
  s3objects: {
    label: 'Objects',
    drillOnly: true,             // reachable only by drilling into a bucket - no alias, no sidebar entry
    columns: [
      { header: 'SIZE',          w: 90,  value: i => i.size,         color: dim, mono: true },
      { header: 'STORAGE-CLASS', w: 130, value: i => i.storageClass, color: alt },
      { header: 'AGE',           w: 55,  value: i => i.age,          color: dim, right: true },
    ],
  },

  // ── COMPUTE ──────────────────────────────────────────────
  ebsvolumes: {
    label: 'EBS Volumes',
    columns: [
      { header: 'STATE',       w: 90,  value: i => i.status,            color: i => statusColor(i.status) },
      { header: 'SIZE',        w: 80,  value: i => i.size,              color: dim, mono: true },
      { header: 'TYPE',        w: 70,  value: i => i.volType,           color: alt },
      { header: 'ZONE',        w: 104, value: i => i.az,                color: dim },
      { header: 'ATTACHED-TO', w: 160, value: i => i.attachedTo || '-', color: i => (i.attachedTo ? a2 : faint), mono: true },
      { header: 'AGE',         w: 55,  value: i => i.age,               color: dim, right: true },
    ],
  },
  lambdafunctions: {
    label: 'Lambda',
    columns: [
      { header: 'RUNTIME', w: 110, value: i => i.runtime, color: alt },
      { header: 'MEMORY',  w: 80,  value: i => i.memory,  color: dim },
      { header: 'TIMEOUT', w: 70,  value: i => i.timeout, color: dim },
      { header: 'STATE',   w: 90,  value: i => i.status,  color: i => statusColor(i.status) },
      { header: 'AGE',     w: 55,  value: i => i.age,     color: dim, right: true },
    ],
  },

  // ── NETWORK ──────────────────────────────────────────────
  vpcs: {
    label: 'VPCs',
    columns: [
      { header: 'STATE',   w: 90,  value: i => i.status,    color: i => statusColor(i.status) },
      { header: 'CIDR',    w: 130, value: i => i.cidr,      color: a2, mono: true },
      { header: 'DEFAULT', w: 70,  value: i => i.isDefault, color: i => (i.isDefault ? accent : faint) },
      { header: 'TENANCY', w: 90,  value: i => i.tenancy,   color: dim },
      { header: 'VPC-ID',  w: 200, value: i => i.vpcId,     color: dim, mono: true },
    ],
  },
  securitygroups: {
    label: 'Security Groups',
    columns: [
      { header: 'GROUP-ID',    w: 200, value: i => i.groupId,       color: a2, mono: true },
      { header: 'VPC-ID',      w: 200, value: i => i.vpcId,         color: dim, mono: true },
      { header: 'INBOUND',     w: 80,  value: i => `${i.inbound}`,  color: i => (i.inbound ? alt : faint) },
      { header: 'OUTBOUND',    w: 80,  value: i => `${i.outbound}`, color: i => (i.outbound ? alt : faint) },
      { header: 'DESCRIPTION', w: 280, value: i => i.description,   color: dim },
    ],
  },
  elasticips: {
    label: 'Elastic IPs',
    columns: [
      { header: 'STATUS',        w: 110, value: i => i.status,              color: i => statusColor(i.status) },
      { header: 'ALLOCATION-ID', w: 200, value: i => i.allocationId,        color: dim, mono: true },
      { header: 'ASSOCIATED',    w: 180, value: i => i.associatedTo || '-', color: i => (i.associatedTo ? a2 : faint), mono: true },
      { header: 'PRIVATE-IP',    w: 120, value: i => i.privateIp || '-',    color: dim, mono: true },
      { header: 'SCOPE',         w: 60,  value: i => i.scope,               color: alt },
    ],
  },
}

export const AWS_RESOURCE_KEYS = new Set(Object.keys(AWS_RESOURCES))

// `:` command + autocomplete aliases. Folded into the store's RESOURCE_ALIASES, so typing :s3 / :ec2
// works and auto-switches the provider. s3objects has NO alias on purpose (drill-only).
export const AWS_ALIASES = {
  s3: 's3buckets', bucket: 's3buckets', buckets: 's3buckets', s3buckets: 's3buckets',
  ec2: 'ec2instances', instance: 'ec2instances', instances: 'ec2instances', ec2instances: 'ec2instances',
  vol: 'ebsvolumes', volume: 'ebsvolumes', volumes: 'ebsvolumes', ebs: 'ebsvolumes', ebsvolumes: 'ebsvolumes',
  lambda: 'lambdafunctions', fn: 'lambdafunctions', func: 'lambdafunctions', function: 'lambdafunctions', functions: 'lambdafunctions', lambdas: 'lambdafunctions', lambdafunctions: 'lambdafunctions',
  vpc: 'vpcs', vpcs: 'vpcs',
  sg: 'securitygroups', securitygroup: 'securitygroups', securitygroups: 'securitygroups', secgroup: 'securitygroups', secgroups: 'securitygroups',
  eip: 'elasticips', eips: 'elasticips', elasticip: 'elasticips', elasticips: 'elasticips', address: 'elasticips', addresses: 'elasticips',
}

// Sidebar groups for the AWS provider (same shape as the k8s GROUPS in Sidebar.jsx). Mirrors the
// AWS Console's service categories, flattened so each service's resource types are peer list items.
export const AWS_GROUPS = [
  { label: 'COMPUTE', color: 'var(--mz-orange)', items: [
    { key: 'ec2instances',    label: 'EC2 Instances' },
    { key: 'ebsvolumes',      label: 'EBS Volumes' },
    { key: 'lambdafunctions', label: 'Lambda' },
  ] },
  { label: 'STORAGE', color: 'var(--mz-ok)', items: [
    { key: 's3buckets', label: 'S3 Buckets' },
  ] },
  { label: 'NETWORK', color: 'var(--mz-accent)', items: [
    { key: 'vpcs',           label: 'VPCs' },
    { key: 'securitygroups', label: 'Security Groups' },
    { key: 'elasticips',     label: 'Elastic IPs' },
  ] },
]

// ── Shared-shell adapters: turn a column spec into what each component expects ──
export const awsHeaders = (resource) => (AWS_RESOURCES[resource]?.columns || []).map(c => c.header)
export const awsWidths  = (resource) => (AWS_RESOURCES[resource]?.columns || []).map(c => c.w)
export const awsRowFields = (item, resource) =>
  (AWS_RESOURCES[resource]?.columns || []).map(c => ({
    value: c.value(item),
    color: typeof c.color === 'function' ? c.color(item) : c.color,
    w: c.w, mono: !!c.mono, right: !!c.right,
  }))

// AWS provider data layer - the structural twin of src/k8s.js, but built around an internal
// SERVICES registry so that adding RDS / Lambda / IAM / VPC / ... later is ONE table entry
// instead of a fork through every switch. (mezza9 "module #2": see modules.md for the running
// friction log this build is generating toward an eventual cross-provider plugin interface.)
//
// 3-tier fallback, mirroring k8s.js: live AWS (default credential chain) -> mock (MEZZ_AWS_DEMO)
// -> empty. The AWS SDK v3 is imported LAZILY (dynamic import inside loadSdk), so a build/run with
// neither the deps installed nor credentials present still boots cleanly and serves empty/mock.

import { getMockAwsResources, getMockS3Objects, getMockS3Object } from './aws-mock.js'

// Demo gate is SEPARATE from k8s MEZZ_DEMO on purpose: the two providers have independent
// connection/health state (you may run live k8s + mock AWS, or vice versa). One global demoMode
// boolean cannot express that - flagged in modules.md as a provider-boundary requirement.
const DEMO = !!process.env.MEZZ_AWS_DEMO &&
  process.env.MEZZ_AWS_DEMO !== '0' && process.env.MEZZ_AWS_DEMO !== 'false'

// Single-region first (decided with the user): one AWS_REGION, no region picker yet. EC2 is
// strictly per-region; S3 ListBuckets is global but each bucket has a home region. The absent
// region axis is the cleanest entry in the friction log - it points straight at the future
// provider "scope axis" abstraction (the generic replacement for k8s 'namespace').
const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || 'us-east-1'

// Only touch AWS at all when it is plausibly configured - otherwise the 5s refresh would hammer
// STS on every tick in a pure-k8s devcontainer. Enabled by demo, an explicit opt-in, or any of the
// standard credential-source env vars (so real deployments auto-enable).
const AWS_ENABLED = DEMO ||
  (!!process.env.MEZZ_AWS && process.env.MEZZ_AWS !== '0' && process.env.MEZZ_AWS !== 'false') ||
  !!(process.env.AWS_ACCESS_KEY_ID || process.env.AWS_PROFILE || process.env.AWS_ROLE_ARN ||
     process.env.AWS_WEB_IDENTITY_TOKEN_FILE || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI)

// Resource keys this module contributes to the shared data stream (peer of k8s RESOURCE_KEYS).
// s3objects is intentionally NOT here: it is a lazy drilldown (fetchS3Objects), never broadcast.
export const RESOURCE_KEYS = [
  's3buckets', 'ec2instances', 'ebsvolumes', 'lambdafunctions',
  'vpcs', 'securitygroups', 'elasticips',
]

const MAX_OBJECTS = 2000   // cap a single bucket listing (friction: huge buckets need a prefix UI)

let cachedClients = null
let identity = null
let lastError = null

function emptyAwsResources(err) {
  const out = { awsConnected: false, awsDemo: false, awsRegion: REGION, awsIdentity: null, awsError: err || null }
  for (const k of RESOURCE_KEYS) out[k] = []
  return out
}

// Lazy SDK import. Failure here (deps not installed) is caught by getClients() and degrades to
// mock/empty - which is exactly why demo mode works with no @aws-sdk/* present.
let sdk = null
async function loadSdk() {
  if (sdk) return sdk
  const [s3, ec2, sts, lambda] = await Promise.all([
    import('@aws-sdk/client-s3'),
    import('@aws-sdk/client-ec2'),
    import('@aws-sdk/client-sts'),
    import('@aws-sdk/client-lambda'),
  ])
  sdk = { s3, ec2, sts, lambda }
  return sdk
}

// Mirror k8s.js getClient(): build the clients from the default credential chain, validate with a
// 5s-capped STS GetCallerIdentity, cache on success, return null (and remember lastError) on any
// failure. Unlike kc.getCurrentCluster() (a server URL), AWS identity is an ARN + account id.
async function getClients() {
  if (!AWS_ENABLED) { lastError = 'AWS not configured'; return null }
  if (cachedClients) return cachedClients
  try {
    const { s3, ec2, sts } = await loadSdk()
    const cfg = { region: REGION }
    const stsClient = new sts.STSClient(cfg)
    identity = await Promise.race([
      stsClient.send(new sts.GetCallerIdentityCommand({})),
      new Promise((_, reject) => setTimeout(() => reject(new Error('AWS STS timeout after 5s')), 5000)),
    ])
    cachedClients = {
      s3: new s3.S3Client(cfg), ec2: new ec2.EC2Client(cfg), sts: stsClient,
      lambda: new lambda.LambdaClient(cfg), region: REGION,
    }
    lastError = null
    console.log(`  ✓ AWS connected: ${identity.Arn} (account ${identity.Account}, region ${REGION})`)
    return cachedClients
  } catch (err) {
    lastError = err.message
    cachedClients = null
    identity = null
    return null
  }
}

// ── Internal AWS service registry ────────────────────────────────────────────
// One entry per AWS resource type. list(clients) returns normalized FLAT TABLE ROWS (not raw API
// shapes), each carrying a synthetic `status` string so the shared ResourceRow can call
// statusColor(item.status) unconditionally. To add a service (RDS, Lambda, ...) add one entry here
// plus its presentation entry in the client registry (client/src/aws/resources.js). Nothing else.
const SERVICES = [
  {
    key: 's3buckets',
    async list(clients) {
      const { s3 } = await loadSdk()
      const out = await clients.s3.send(new s3.ListBucketsCommand({}))
      const buckets = out.Buckets || []
      return Promise.all(buckets.map(async (b) => {
        let region = REGION
        try {
          const loc = await clients.s3.send(new s3.GetBucketLocationCommand({ Bucket: b.Name }))
          region = loc.LocationConstraint || 'us-east-1'   // '' constraint == us-east-1 by API contract
        } catch { /* listing buckets you can't locate is fine - keep the default region */ }
        return {
          id: b.Name, name: b.Name, region,
          created: b.CreationDate ? b.CreationDate.toISOString() : '',
          age: age(b.CreationDate),
          objects: '-', size: '-',     // counting objects/size is a per-bucket scan; deferred (lazy drill shows them)
          status: 'Active',
        }
      }))
    },
  },
  {
    key: 'ec2instances',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeInstancesCommand({ NextToken: token }))
        for (const r of out.Reservations || []) {
          for (const i of r.Instances || []) {
            const nameTag = (i.Tags || []).find(t => t.Key === 'Name')?.Value
            const state = i.State?.Name || 'unknown'
            rows.push({
              id: i.InstanceId, name: nameTag || i.InstanceId, region: REGION,
              state, status: ec2StatusLabel(state),
              type: i.InstanceType || '', az: i.Placement?.AvailabilityZone || '',
              privateIp: i.PrivateIpAddress || '', publicIp: i.PublicIpAddress || '',
              launchTime: i.LaunchTime ? i.LaunchTime.toISOString() : '',
              age: age(i.LaunchTime),
            })
          }
        }
        token = out.NextToken
      } while (token)
      return rows
    },
  },
  // ── COMPUTE ──────────────────────────────────────────────
  {
    key: 'ebsvolumes',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeVolumesCommand({ NextToken: token }))
        for (const v of out.Volumes || []) {
          const nameTag = (v.Tags || []).find(t => t.Key === 'Name')?.Value
          rows.push({
            id: v.VolumeId, name: nameTag || v.VolumeId, region: REGION,
            state: v.State || '', status: titleCase(v.State),
            size: `${v.Size ?? 0} GiB`, volType: v.VolumeType || '',
            az: v.AvailabilityZone || '', attachedTo: (v.Attachments || [])[0]?.InstanceId || '',
            age: age(v.CreateTime),
          })
        }
        token = out.NextToken
      } while (token)
      return rows
    },
  },
  {
    key: 'lambdafunctions',
    async list(clients) {
      const { lambda } = await loadSdk()
      const rows = []
      let marker
      do {
        const out = await clients.lambda.send(new lambda.ListFunctionsCommand({ Marker: marker, MaxItems: 50 }))
        for (const f of out.Functions || []) {
          rows.push({
            id: f.FunctionArn || f.FunctionName, name: f.FunctionName, region: REGION,
            runtime: f.Runtime || (f.PackageType === 'Image' ? 'image' : ''),
            memory: `${f.MemorySize ?? 0} MB`, timeout: `${f.Timeout ?? 0}s`,
            handler: f.Handler || '', state: f.State || 'Active', status: f.State || 'Active',
            age: age(f.LastModified),
          })
        }
        marker = out.NextMarker
      } while (marker)
      return rows
    },
  },
  // ── NETWORK ──────────────────────────────────────────────
  {
    key: 'vpcs',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeVpcsCommand({ NextToken: token }))
        for (const v of out.Vpcs || []) {
          const nameTag = (v.Tags || []).find(t => t.Key === 'Name')?.Value
          rows.push({
            id: v.VpcId, name: nameTag || v.VpcId, region: REGION,
            vpcId: v.VpcId, cidr: v.CidrBlock || '', state: v.State || '',
            status: titleCase(v.State), isDefault: v.IsDefault ? 'default' : '',
            tenancy: v.InstanceTenancy || '',
          })
        }
        token = out.NextToken
      } while (token)
      return rows
    },
  },
  {
    key: 'securitygroups',
    async list(clients) {
      const { ec2 } = await loadSdk()
      const rows = []
      let token
      do {
        const out = await clients.ec2.send(new ec2.DescribeSecurityGroupsCommand({ NextToken: token }))
        for (const g of out.SecurityGroups || []) {
          const nameTag = (g.Tags || []).find(t => t.Key === 'Name')?.Value
          rows.push({
            id: g.GroupId, name: nameTag || g.GroupName || g.GroupId, region: REGION,
            groupId: g.GroupId, vpcId: g.VpcId || '',
            inbound: (g.IpPermissions || []).length, outbound: (g.IpPermissionsEgress || []).length,
            description: g.Description || '', status: 'Active',
          })
        }
        token = out.NextToken
      } while (token)
      return rows
    },
  },
  {
    key: 'elasticips',
    async list(clients) {
      const { ec2 } = await loadSdk()
      // DescribeAddresses is not paginated - it returns every allocation in one call.
      const out = await clients.ec2.send(new ec2.DescribeAddressesCommand({}))
      return (out.Addresses || []).map(a => {
        const nameTag = (a.Tags || []).find(t => t.Key === 'Name')?.Value
        const assoc = a.InstanceId || a.NetworkInterfaceId || ''
        return {
          id: a.AllocationId || a.PublicIp, name: nameTag || a.PublicIp, region: REGION,
          publicIp: a.PublicIp || '', allocationId: a.AllocationId || '',
          associatedTo: assoc, privateIp: a.PrivateIpAddress || '', scope: a.Domain || '',
          status: assoc ? 'Associated' : 'Unassociated',
        }
      })
    },
  },
]

// Normalize an EC2 state to a capitalized status label so it resolves through the theme status map
// (Running->ok, Stopped/Pending/Stopping/ShuttingDown->warn, Terminated->danger).
function ec2StatusLabel(state) {
  switch (state) {
    case 'running':       return 'Running'
    case 'pending':       return 'Pending'
    case 'stopping':      return 'Stopping'
    case 'stopped':       return 'Stopped'
    case 'shutting-down': return 'ShuttingDown'
    case 'terminated':    return 'Terminated'
    default: return state ? state[0].toUpperCase() + state.slice(1) : 'Unknown'
  }
}

// Title-case a hyphenated AWS state ('in-use' -> 'In-use', 'available' -> 'Available') so it
// resolves through the shared statusColor map.
function titleCase(s) {
  if (!s) return ''
  return s.split('-').map(w => (w ? w[0].toUpperCase() + w.slice(1) : w)).join('-')
}

// Top-level fetch folded into the server's data stream (peer of k8s fetchResources). Each service
// lists independently via Promise.allSettled so one failing IAM permission doesn't blank the rest.
export async function fetchAwsResources() {
  const clients = await getClients()
  if (!clients) {
    if (DEMO) return { ...getMockAwsResources(), awsConnected: false, awsDemo: true, awsRegion: REGION, awsIdentity: 'arn:aws:iam::123456789012:user/demo', awsError: null }
    return emptyAwsResources(lastError)
  }
  const out = { awsConnected: true, awsDemo: false, awsRegion: REGION, awsIdentity: identity?.Arn || null, awsError: null }
  const settled = await Promise.allSettled(SERVICES.map(s => s.list(clients)))
  SERVICES.forEach((s, i) => {
    const r = settled[i]
    out[s.key] = r.status === 'fulfilled' ? r.value : []
    if (r.status === 'rejected') {
      console.warn(`AWS ${s.key} list failed:`, r.reason?.message)
      out.awsError = out.awsError || r.reason?.message
    }
  })
  return out
}

// ── Lazy drilldown: a bucket's objects ───────────────────────────────────────
// S3 objects are NOT embedded in the bucket row (unlike pod.containers), so the drill is async and
// paginated - a key friction point vs the k8s synchronous-drill model (see modules.md).
export async function fetchS3Objects(bucket) {
  const clients = await getClients()
  if (!clients) return DEMO ? getMockS3Objects(bucket) : []
  const { s3 } = await loadSdk()
  const rows = []
  let token
  try {
    do {
      const out = await clients.s3.send(new s3.ListObjectsV2Command({
        Bucket: bucket, ContinuationToken: token, MaxKeys: 1000,
      }))
      for (const o of out.Contents || []) rows.push(s3ObjectRow(bucket, o))
      token = (out.IsTruncated && rows.length < MAX_OBJECTS) ? out.NextContinuationToken : undefined
    } while (token)
  } catch (err) {
    console.warn(`S3 list objects failed (${bucket}):`, err.message)
  }
  return rows
}

function s3ObjectRow(bucket, o) {
  return {
    id: `${bucket}/${o.Key}`, name: o.Key, bucket,
    size: humanSize(o.Size), sizeBytes: o.Size ?? 0,
    storageClass: o.StorageClass || 'STANDARD',
    modified: o.LastModified ? o.LastModified.toISOString() : '',
    age: age(o.LastModified), status: 'Active',
  }
}

// ── Write ops ─────────────────────────────────────────────────────────────────
// These replace kubectl exec/cp/delete entirely (friction: AWS has no exec/cp primitive). Reads
// work in demo; writes refuse in demo, matching the k8s posture (describe works, edit/delete don't).

// EC2 state transitions. Fire-and-forget like kubectl delete - the next refresh reflects the new
// state (pending -> running). region is carried because /:resource/:namespace/:name can't address it.
export async function ec2Action(op, region, ids) {
  const clients = await getClients()
  if (!clients) return { ok: false, error: DEMO ? 'EC2 actions are not available in demo mode.' : 'No AWS connection.' }
  const { ec2 } = await loadSdk()
  const client = (region && region !== REGION) ? new ec2.EC2Client({ region }) : clients.ec2
  const InstanceIds = Array.isArray(ids) ? ids : [ids]
  const make = {
    start:     () => new ec2.StartInstancesCommand({ InstanceIds }),
    stop:      () => new ec2.StopInstancesCommand({ InstanceIds }),
    reboot:    () => new ec2.RebootInstancesCommand({ InstanceIds }),
    terminate: () => new ec2.TerminateInstancesCommand({ InstanceIds }),
  }[op]
  if (!make) return { ok: false, error: `Unknown EC2 op: ${op}` }
  try { await client.send(make()); return { ok: true } }
  catch (err) { return { ok: false, error: err.message } }
}

// S3 object DOWNLOAD. Returns { body, contentType, contentLength } where body is a Node Readable
// (live) or a Buffer (mock). The "local" side is the browser, exactly like the kubectl-cp CopyModal.
export async function s3GetObject(bucket, key) {
  const clients = await getClients()
  if (!clients) return DEMO ? getMockS3Object(bucket, key) : null
  const { s3 } = await loadSdk()
  const out = await clients.s3.send(new s3.GetObjectCommand({ Bucket: bucket, Key: key }))
  return { body: out.Body, contentType: out.ContentType || 'application/octet-stream', contentLength: out.ContentLength }
}

// S3 object UPLOAD (raw bytes from the browser).
export async function s3PutObject(bucket, key, body) {
  const clients = await getClients()
  if (!clients) return { ok: false, error: DEMO ? 'Upload is not available in demo mode.' : 'No AWS connection.' }
  const { s3 } = await loadSdk()
  try {
    await clients.s3.send(new s3.PutObjectCommand({ Bucket: bucket, Key: key, Body: body }))
    return { ok: true, path: `${bucket}/${key}` }
  } catch (err) { return { ok: false, error: err.message } }
}

// ── small local formatters (kept here so aws.js has no dep on k8s.js internals) ──
function age(d) {
  if (!d) return ''
  const t = (d instanceof Date ? d : new Date(d)).getTime()
  if (!Number.isFinite(t)) return ''
  const secs = Math.floor((Date.now() - t) / 1000)
  if (secs < 0) return '0s'
  if (secs < 60) return `${secs}s`
  const mins = Math.floor(secs / 60); if (mins < 60) return `${mins}m`
  const hrs = Math.floor(mins / 60);  if (hrs < 24) return `${hrs}h`
  return `${Math.floor(hrs / 24)}d`
}

function humanSize(n) {
  if (n == null) return ''
  if (n < 1024) return `${n} B`
  const units = ['KiB', 'MiB', 'GiB', 'TiB']
  let v = n / 1024, i = 0
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++ }
  return `${v.toFixed(1)} ${units[i]}`
}

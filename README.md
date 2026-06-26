# mezza9

**The best seat in the house for your container orchestration.**

> **mezza9** is _Mezzanine_, stylized. The trailing **9** is a tip of the hat to
> [k9s](https://k9scli.io/), the keyboard-driven Kubernetes TUI that inspired
> its home-row navigation.

In a premier concert hall, the absolute best seat isn't right up against the
stage. It's in the front row of the mezzanine. Up there, elevated above the
stage, the individual instruments perfectly blend into a single, cohesive
masterpiece. You get the ultimate vantage point: total clarity, perfect balance,
and a complete view of the entire performance. Inspired by the terminal-velocity
efficiency of tools like K9s and the visual approachability of traditional k8s
dashboards, Mezzanine bridges both worlds. Keep your hands on the home row with
comprehensive, keyboard-driven CLI keybinds, or grab the mouse to click through
a beautifully fluid, and visually stunning dashboard. Take your seat in the
mezzanine, and manage your containers from the best seat in the house.

---

## Highlights

- **Keyboard-first, k9s-style navigation.** `j/k` to move, `/` to filter, `:`
  for command mode (`:pods`, `:ns`), `Enter` to drill in, `[`/`]` to walk your
  history. Your hands never leave the home row.
- **One unified inspect modal.** `d`/`y`/`e` open the same view — `describe`,
  `yaml`, and `json` are a `Tab` apart, each fetched once and cached. `e` drops
  you straight into a vim-style editor (NORMAL/INSERT/VISUAL, real block cursor,
  `/` search) that applies with `kubectl apply`.
- **Live logs.** Stream a single pod or aggregate across every pod behind a
  Deployment, StatefulSet, or DaemonSet.
- **First-class Helm.** Browse releases and peek `values` (user **or**
  computed), rendered manifest, notes, and revision history — and roll back to
  any revision.
- **Port-forwarding from the UI.** `Shift+F` on a pod / service / deployment /
  statefulset, with port suggestions pulled straight off the object.
- **Secrets, decoded in place.** `x` opens a secret pre-decoded; toggle back to
  the encoded view without leaving the modal.
- **Multi-select & bulk ops.** `Space` to mark rows, then delete (`ctrl+d`, with
  a confirmation) or instantly kill (`ctrl+k`) everything at once.
- **Sorting, fault-filtering, and owner-jumps.** Sort by name/age/status, hide
  the healthy with `ctrl+z`, and `Shift+J` from a pod/replicaset/job to its
  controller.
- **Custom resources.** CRDs and their instances are first-class citizens in the
  list.
- **No cluster? No problem.** Set `MEZZ_DEMO=1` and Mezzanine boots a built-in
  demo cluster so you can explore everything offline.

## Quick start

```bash
# 1. Install dependencies (root + client)
npm install && npm --prefix client install

# 2. Build the frontend and start the server (everything on one port)
npm run build
npm start

# 3. Take your seat
open http://localhost:3001
```

That's it — the Express server serves both the API and the built frontend on
**port 3001**. Point it at a cluster by having a valid kubeconfig in your
environment; with none, you'll get a "not connected" screen — set `MEZZ_DEMO=1`
to explore the built-in demo cluster instead.

> Health check: `curl http://localhost:3001/api/health` →
> `{"ok":true,"demoMode":<bool>}`

### Live development

```bash
npm run dev   # rebuilds the client on change + restarts the server (node --watch)
```

### Stopping the server

The server runs on **port 3001**. To stop it (e.g. before running the container,
which would otherwise hit `EADDRINUSE`):

```bash
kill "$(lsof -ti:3001)"
```

## Running in a container

Mezzanine ships as a container image that bundles `node`, the app, and pinned
`kubectl` + `helm` — so the host needs neither binary, just a kubeconfig.

```bash
# Build (rebuild the frontend first — the image copies in client/dist)
bash scripts/safe-build.sh
docker build -t mezzanine:dev .
```

Run it against your cluster by mounting a kubeconfig:

```bash
# Standard cluster — map the port and mount your kubeconfig read-only
docker run --rm -p 3001:3001 \
  -v "$HOME/.kube/config:/home/node/.kube/config:ro" \
  mezzanine:dev
```

**kind / minikube** kubeconfigs point at `127.0.0.1:<port>`, which a bridged
container can't reach — use host networking and pass the port via `PORT`:

```bash
docker run --rm --network host -e PORT=3001 -e KUBECONFIG=/kube/config \
  -v "$HOME/.kube/config:/kube/config:ro" \
  mezzanine:dev
```

Then open <http://localhost:3001>.

> **Free port 3001 first.** With `--network host` the container binds 3001 on the
> host, so any local dev server must be stopped first or the container exits with
> `EADDRINUSE` — see [Stopping the server](#stopping-the-server).

### Demo mode

Mock data is **off by default** — with no reachable cluster you get a "not
connected" screen rather than fake resources. Set `MEZZ_DEMO=1` to explore the
built-in demo cluster offline (works for both `npm start` and the container):

```bash
docker run --rm -p 3001:3001 -e MEZZ_DEMO=1 mezzanine:dev
```

## Security

> **Read this before exposing Mezzanine to anything but your own laptop.**

Mezzanine talks to your cluster with the kubeconfig or in-cluster ServiceAccount
it is given, and the UI can delete, edit (apply), exec into pods, port-forward,
and roll back Helm releases. By default there is **no authentication**: anyone
who can reach the port has that same full control of the cluster. On loopback
(`localhost`) that is fine. Anywhere else, you must put a gate in front of it.

There are two supported ways to do that.

### 1. Built-in shared-token gate (`MEZZ_TOKEN`)

Set `MEZZ_TOKEN` to any secret string and Mezzanine requires it on **every**
`/api` request and on both WebSocket upgrades (the data stream and the pod
shell). The browser shows a login screen; the token is then stored locally and
sent automatically.

```bash
# Local / container
MEZZ_TOKEN="$(openssl rand -hex 32)" npm start
docker run --rm -p 3001:3001 -e MEZZ_TOKEN="a-long-random-string" mezzanine:dev

# Or let the server mint one for you and print it (Jupyter-style). The startup log
# shows the token and a one-click URL (http://localhost:3001/?token=...) that logs
# you straight in. The token changes on every restart.
MEZZ_TOKEN=auto npm start

# Read the token from a file instead (e.g. a mounted Kubernetes Secret). When
# MEZZ_TOKEN_FILE is set it takes precedence and any MEZZ_TOKEN env var is ignored.
MEZZ_TOKEN_FILE=/etc/mezza9/auth/token npm start
```

Clients can present the token three ways: `Authorization: Bearer <token>`, HTTP
Basic auth with the token as the **password** (`curl -u any-username:<token>`;
`curl -u <token>:` also works), or a `?token=` query parameter (used by the
browser for the WebSocket, which cannot send headers). The server compares
tokens in constant time.

> If a token is **configured but resolves empty** - an unreadable Secret mount,
> the wrong Secret key, or a blank value - the server refuses to start rather
> than silently run unauthenticated. To run with no gate, leave the variable
> unset entirely.

This is a single **shared** identity - everyone who has the token is treated the
same and acts as the one kubeconfig/ServiceAccount. It is the right size for a
solo operator or a small trusted team. It is **not** per-user access control.

> When no token is set, the server logs a loud warning at startup. Keep the bind
> on loopback (`127.0.0.1`) until a token or a proxy is in place.

### 2. Front it with an auth proxy + TLS (recommended for teams)

For real multi-user access - where each person logs in with their own identity
and you want encryption in transit - run Mezzanine behind a dedicated
authenticating reverse proxy and terminate TLS there:

- **[oauth2-proxy](https://github.com/oauth2-proxy/oauth2-proxy)** in front of
  the Service / Ingress, wired to your identity provider (Google, Okta, Azure
  AD, GitHub, any OIDC). The proxy authenticates the user and only then forwards
  to Mezzanine.
- **Istio `RequestAuthentication` + `AuthorizationPolicy`** if you run a mesh:
  validate a JWT at the sidecar and deny unauthenticated requests before they
  reach the pod.
- Terminate **TLS** at the Ingress / gateway / proxy. Never serve an
  unauthenticated dashboard over plain HTTP off-host.

You can combine both: set `MEZZ_TOKEN` *and* front it with a proxy for defense
in depth.

> **Per-user Kubernetes RBAC** (each person limited by their own cluster
> permissions via impersonation / OIDC) is not built in yet - it is the planned
> next step. Until then, the proxy path above is how you get per-user login.

### Helm chart

The chart exposes the token gate directly. It stores the token in a Secret,
mounts it into the pod as a file, and points `MEZZ_TOKEN_FILE` at it (so the
token never appears in the pod's env or `kubectl describe`). Configure it via
`auth.*`, not an `extraEnv: MEZZ_TOKEN` - the mounted file takes precedence.

```yaml
# values.yaml
auth:
  # Easiest: let the chart mint a token for you (printed in the install NOTES).
  autoGenerate: true
  # Or pin your own:
  token: "a-long-random-string"   # stored in a generated Secret, mounted as a file
  # Or reference your own Secret instead (its key must equal secretKey below):
  existingSecret: "mezza9-token"
  secretKey: token
```

```bash
# Install with an auto-generated token, then read it from the printed NOTES:
helm install mezza9 ./charts/mezza9 --set auth.autoGenerate=true

# Fetch the generated token anytime:
kubectl get secret -n <namespace> mezza9-auth \
  -o jsonpath="{.data.token}" | base64 -d ; echo
```

`autoGenerate` is **stable across `helm upgrade`** - the chart reads the existing
Secret back (via `lookup`) and reuses it, so upgrades don't rotate the token.
(`helm template` / `--dry-run` can't read the cluster, so they show a throwaway
value; the real install/upgrade is what persists.)

If you point `existingSecret` at a Secret whose key is **not** `secretKey`, the
mounted file is missing and the pod refuses to start (fail closed) rather than
coming up unauthenticated - so a key mismatch surfaces as a crash-loop, not a
silent open door.

Also note `rbac.readOnly`: it defaults to `false`, which grants the write verbs
the UI needs (delete / edit / port-forward / rollback) - effectively
cluster-admin for an app with no built-in per-user auth. Set it to `true` for a
strictly read-only viewer, and never expose a `readOnly: false` install without
auth **and** TLS in front.

## Keyboard navigation

The full cheatsheet is always one keypress away — hit `?` in the app. The
essentials:

| Key                 | Action                                                   |
| ------------------- | -------------------------------------------------------- |
| `j` / `k`           | Move down / up                                           |
| `gg` / `G`          | Jump to first / last                                     |
| `/`                 | Filter the current list                                  |
| `:`                 | Command mode (`:pods`, `:deployments`, `:ns`, …)         |
| `Enter`             | Drill into the selected resource                         |
| `[` / `]`           | Navigate back / forward through history                  |
| `l`                 | Logs                                                     |
| `d` / `y` / `e`     | Describe / YAML / edit (one unified modal)               |
| `x`                 | Decode a secret in place                                 |
| `v` `m` `n` `h`     | Helm: values / manifest / notes / history                |
| `Shift+F`           | Port-forward the selection                               |
| `Shift+J`           | Jump to the owning controller                            |
| `a`                 | Actions palette — everything applicable to the selection |
| `Space`             | Toggle multi-select on the current row                   |
| `ctrl+d` / `ctrl+k` | Delete (with confirm) / kill (multi-select aware)        |
| `Esc`               | Step back                                                |

## Resource coverage

- **Workloads** — pods, deployments, replicasets, statefulsets, daemonsets,
  jobs, cronjobs, HPAs, PDBs
- **Network** — services, ingresses, network policies
- **Config** — configmaps, secrets, service accounts, resource quotas
- **Storage** — PVCs, PVs, storage classes
- **RBAC** — roles, cluster roles, role bindings, cluster role bindings
- **Cluster** — nodes, namespaces, events
- **Extensions** — CRDs and their custom resources, plus Helm releases

## Architecture

```
src/
  server.js   Express + WebSocket server — all /api/* endpoints + static frontend
  k8s.js      fetchResources() — Kubernetes client, falls back to the demo cluster
  mock.js     the built-in demo cluster (resources, logs, describe, yaml)
client/
  src/
    store.js      Zustand store — all application state
    actions.js    OBJECT_ACTIONS registry — single source of truth for per-object actions
    App.jsx       root layout: sidebar + list + detail panel
    components/   HUD, ResourceList, DetailPanel, ActionModal, ActionMenu, …
    hooks/        useWS (live updates) + useKeys (keyboard shortcuts)
```

A single Express process serves the API **and** the static React/Vite bundle,
and pushes live resource updates over a WebSocket — so the whole thing runs on
one port with nothing else to stand up. Mezzanine shells out to your local
`kubectl` and `helm` for live operations, so it respects your existing
kubeconfig and contexts.

### REST API

| Method   | Path                                                          | Description                                    |
| -------- | ------------------------------------------------------------- | ---------------------------------------------- |
| `GET`    | `/api/logs/:namespace/:pod`                                   | Pod logs (`tail`, `sinceSeconds`, `container`) |
| `GET`    | `/api/logs-multi/:resource/:namespace/:name`                  | Aggregated multi-pod logs                      |
| `GET`    | `/api/describe/:resource/:namespace/:name`                    | `kubectl describe`                             |
| `GET`    | `/api/yaml\|json/:resource/:namespace/:name`                  | Object as YAML / JSON                          |
| `POST`   | `/api/edit`                                                   | Apply edited YAML (`kubectl apply -f -`)       |
| `DELETE` | `/api/delete/:resource/:namespace/:name`                      | Delete (`--wait=false`)                        |
| `GET`    | `/api/helm/values\|manifest\|notes\|history/:namespace/:name` | Helm release inspection                        |
| `POST`   | `/api/helm/rollback/:namespace/:name/:revision`               | Roll back a release                            |
| `*`      | `/api/port-forward/…`                                         | List / start / stop port-forwards              |
| `GET`    | `/api/crd/:group/:version/:plural`                            | List custom resources for a CRD                |
| `GET`    | `/api/health`                                                 | Liveness + demo-mode flag                      |

## Requirements

- **Node.js** 18+
- **kubectl** on your `PATH` (for live clusters)
- **helm** (optional — only for the Helm release features)
- A reachable Kubernetes cluster (optional — demo mode covers everything else)

## The name

In a premier concert hall, the front row of the mezzanine is the seat
acousticians fight over: elevated above the stage, the individual instruments
blend into one coherent performance. Kubernetes is _container orchestration_ —
so Mezzanine is your seat above the orchestra, where the whole cluster resolves
into a single, legible view.

The wordmark, **mezza9**, pays homage to [k9s](https://k9scli.io/): the **9** is
borrowed straight from the tool whose terminal-velocity, keyboard-first workflow
this dashboard is built around. Mezzanine keeps that k9s muscle memory (`j/k`,
`/`, `:`, `Shift+J`, …) and gives it a front-row seat with a visual UI.

## License

MIT

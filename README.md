# Mezzanine

**The best seat in the house for your container orchestration.**

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

- **Keyboard-first, k9s-style navigation.** `j/k` to move, `/` to filter, `:` for
  command mode (`:pods`, `:ns`), `Enter` to drill in, `[`/`]` to walk your history.
  Your hands never leave the home row.
- **One unified inspect modal.** `d`/`y`/`e` open the same view — `describe`, `yaml`,
  and `json` are a `Tab` apart, each fetched once and cached. `e` drops you straight
  into a vim-style editor (NORMAL/INSERT/VISUAL, real block cursor, `/` search) that
  applies with `kubectl apply`.
- **Live logs.** Stream a single pod or aggregate across every pod behind a Deployment,
  StatefulSet, or DaemonSet.
- **First-class Helm.** Browse releases and peek `values` (user **or** computed),
  rendered manifest, notes, and revision history — and roll back to any revision.
- **Port-forwarding from the UI.** `Shift+F` on a pod / service / deployment /
  statefulset, with port suggestions pulled straight off the object.
- **Secrets, decoded in place.** `x` opens a secret pre-decoded; toggle back to the
  encoded view without leaving the modal.
- **Multi-select & bulk ops.** `Space` to mark rows, then delete (`ctrl+d`, with a
  confirmation) or instantly kill (`ctrl+k`) everything at once.
- **Sorting, fault-filtering, and owner-jumps.** Sort by name/age/status, hide the
  healthy with `ctrl+z`, and `Shift+J` from a pod/replicaset/job to its controller.
- **Custom resources.** CRDs and their instances are first-class citizens in the list.
- **No cluster? No problem.** With no reachable Kubernetes API, Mezzanine boots a
  built-in demo cluster so you can explore everything offline.

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
environment; with none, it falls back to the demo cluster automatically.

> Health check: `curl http://localhost:3001/api/health` → `{"ok":true,"demoMode":<bool>}`

### Live development

```bash
npm run dev   # rebuilds the client on change + restarts the server (node --watch)
```

## Keyboard navigation

The full cheatsheet is always one keypress away — hit `?` in the app. The essentials:

| Key | Action |
|-----|--------|
| `j` / `k` | Move down / up |
| `gg` / `G` | Jump to first / last |
| `/` | Filter the current list |
| `:` | Command mode (`:pods`, `:deployments`, `:ns`, …) |
| `Enter` | Drill into the selected resource |
| `[` / `]` | Navigate back / forward through history |
| `l` | Logs |
| `d` / `y` / `e` | Describe / YAML / edit (one unified modal) |
| `x` | Decode a secret in place |
| `v` `m` `n` `h` | Helm: values / manifest / notes / history |
| `Shift+F` | Port-forward the selection |
| `Shift+J` | Jump to the owning controller |
| `a` | Actions palette — everything applicable to the selection |
| `Space` | Toggle multi-select on the current row |
| `ctrl+d` / `ctrl+k` | Delete (with confirm) / kill (multi-select aware) |
| `Esc` | Step back |

## Resource coverage

- **Workloads** — pods, deployments, replicasets, statefulsets, daemonsets, jobs,
  cronjobs, HPAs, PDBs
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

A single Express process serves the API **and** the static React/Vite bundle, and
pushes live resource updates over a WebSocket — so the whole thing runs on one port
with nothing else to stand up. Mezzanine shells out to your local `kubectl` and `helm`
for live operations, so it respects your existing kubeconfig and contexts.

### REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/logs/:namespace/:pod` | Pod logs (`tail`, `sinceSeconds`, `container`) |
| `GET` | `/api/logs-multi/:resource/:namespace/:name` | Aggregated multi-pod logs |
| `GET` | `/api/describe/:resource/:namespace/:name` | `kubectl describe` |
| `GET` | `/api/yaml\|json/:resource/:namespace/:name` | Object as YAML / JSON |
| `POST` | `/api/edit` | Apply edited YAML (`kubectl apply -f -`) |
| `DELETE` | `/api/delete/:resource/:namespace/:name` | Delete (`--wait=false`) |
| `GET` | `/api/helm/values\|manifest\|notes\|history/:namespace/:name` | Helm release inspection |
| `POST` | `/api/helm/rollback/:namespace/:name/:revision` | Roll back a release |
| `*` | `/api/port-forward/…` | List / start / stop port-forwards |
| `GET` | `/api/crd/:group/:version/:plural` | List custom resources for a CRD |
| `GET` | `/api/health` | Liveness + demo-mode flag |

## Requirements

- **Node.js** 18+
- **kubectl** on your `PATH` (for live clusters)
- **helm** (optional — only for the Helm release features)
- A reachable Kubernetes cluster (optional — demo mode covers everything else)

## The name

In a premier concert hall, the front row of the mezzanine is the seat acousticians
fight over: elevated above the stage, the individual instruments blend into one
coherent performance. Kubernetes is *container orchestration* — so Mezzanine is your
seat above the orchestra, where the whole cluster resolves into a single, legible view.

## License

MIT

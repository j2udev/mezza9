# #78 — AI Assistant ("Ask AI") for Mezza9

## Context

todo.md #78 asks to explore a **"BYOA" (bring-your-own-AI-agent)** or free self-hosted AI
capability — an in-app modal that behaves like a **stripped-down Claude Code specialized for
Kubernetes**: you ask it a question ("why is this deployment degraded?"), it inspects the
cluster and explains/suggests fixes.

Key insight that shaped the design: because the agent's "tools" (list/describe/yaml/logs/
events/helm) already exist as server-side functions, and because the LLM call runs
server-side too, **the API key never has to touch the browser**, and **"free self-host" is
just a config of the same BYOA build** (point an OpenAI-compatible client at a local Ollama
instead of a cloud API). So this is one provider-agnostic feature, not two.

### Locked decisions (from the user)
- **Providers:** provider-agnostic adapter — OpenAI-compatible path (covers OpenAI/OpenRouter/
  Together + **free local Ollama/LM Studio** by changing baseURL) **and** native Anthropic.
- **Capability:** **read-only diagnostics** for v1. The agent inspects and suggests; any
  mutation routes through the app's existing confirm dialogs (out of scope for the agent).
- **Key handling (SECURITY CRITICAL):** key comes **only** from a server-side env var /
  mounted k8s Secret. **No in-app key entry, no localStorage, key never reaches the browser,
  never logged.** Frontend only learns "is AI configured?" via a capability flag.
- **Primary target:** in-cluster via the Helm chart at **`charts/mezza9`** (chart dir is
  `mezza9`, verified — not `mezzanine`). Local env-var path documented too.
- **UX:** full-screen chat modal opened by a global shortcut + an `actions.js` "Ask AI about
  this" entry that seeds the chat with the selected object. Streaming via SSE.

### Verified facts
- `src/server.js:82` — `/api/health` returns `{ ok, demoMode }`. KUBECTL/HELM from env
  (`server.js:21-22`). HTTP read endpoints use `execAsync` with **template-string
  interpolation** (e.g. `:197`) — a shell-injection surface the agent must avoid by using
  `spawn(argv)` for model-supplied args.
- `src/k8s.js:341` — secrets snapshot stores only `keys: Object.keys(s.data||{}).length`,
  **never decoded values**. Decoded values only ever appear via `/api/yaml -o yaml` + client
  `atob`. This is the redaction boundary the agent must respect.
- `client/src/store.js` — `openModal(type,opts)` (requires `selectedId`), `closeModal`,
  `modal` field. `useKeys.js` is a capture-phase window keydown handler that early-returns +
  handles Esc-close when `s.modal` is truthy; bound ctrl combos are only b/z/g/k/d (`ctrl+i`
  is free). `actions.js` `OBJECT_ACTIONS` entries auto-surface in DetailPanel chips, the `a`
  palette, and as keyed shortcuts via `actionForKey`.
- Node v22 (native `fetch`/`ReadableStream`/`AbortController`). No AI deps in root
  `package.json` yet.

## Plan

### 1. Config — `src/agent/config.js` (new), read once at startup
| Env var | Default | Notes |
|---|---|---|
| `MEZZ_AI_PROVIDER` | `''` (off) | `anthropic` \| `openai`; empty disables the feature |
| `MEZZ_AI_API_KEY` | `''` | server-only; optional for local Ollama |
| `MEZZ_AI_BASE_URL` | provider default | OpenAI path → OpenAI/OpenRouter/Ollama (`http://localhost:11434/v1`)/LM Studio |
| `MEZZ_AI_MODEL` | `claude-opus-4-8` / `gpt-4o-mini` | per provider |
| `MEZZ_AI_MAX_TOKENS` | `4096` | |

`isConfigured()` = provider set AND (apiKey present OR baseUrl present) — the baseUrl-without-key
case is what enables free local Ollama.

### 2. Backend — new `src/agent/` module + routes in `src/server.js`
- **`providers.js`** — official SDKs, **lazily `await import()`ed** (mirrors `server.js:92` /
  k8s lazy load) so the app loads zero AI deps when off. Add `@anthropic-ai/sdk` + `openai` to
  root `package.json`. One async-generator interface both satisfy, yielding
  `{type:'token'|'tool_call'|'done'|'error'}`. A `toTools()` translator emits Anthropic
  `input_schema` vs OpenAI `function.parameters`. OpenAI gotcha: buffer fragmented streamed
  `delta.tool_calls` by index before JSON-parsing; Anthropic sends whole `tool_use` blocks.
  Anthropic path uses `messages.stream({thinking:{type:'adaptive'}})` per the claude-api skill
  (not an OpenAI shim).
- **`tools.js`** — read-only registry `{name,description,parameters,readOnly:true,run}` mapping
  1:1 to existing reads: `list_resources` (compact projection of `latest`/`fetchResources()`),
  `get_yaml` (**piped through redaction**), `describe`, `get_logs` (tail-capped), `get_events`,
  `helm_values|manifest|history|notes`. **Two-layer read-only guard:** (1) no write tool ever
  registered; (2) dispatcher throws unless `readOnly===true`. kubectl/helm-backed tools use
  `spawn(KUBECTL,[argv])` with kind/ns/name validated against known kinds — not the
  template-string `execAsync` the HTTP endpoints use.
- **`prompt.js`** — k8s/SRE expert, read-only persona: explains + suggests fixes the user
  applies via the dashboard's own confirm dialogs; never claims to have mutated anything;
  never reveals Secret values (keys by name only). Inject a **compact** snapshot summary
  (per-type counts + faulted objects), not the whole cluster. Selected-object context becomes
  the opening user turn (keeps the byte-stable system+tools prefix cache-friendly).
- **`redactSecrets(text, kind)`** — for Secret objects / any `data:`/`stringData:` block,
  replace values with `<redacted: N bytes>` (mirror `transformSecretDataSection` detection in
  ActionModal but redact instead of decode). No agent path ever calls `atob`. Assert it.
- **`POST /api/agent` (SSE)** — POST + fetch/ReadableStream (EventSource is GET-only, can't
  carry history/context). Body `{ messages, context? }`. `503` if `!isConfigured()`. Headers
  `text/event-stream`, `no-cache`, `X-Accel-Buffering:no`; `:keepalive` every ~15s. Frames:
  `event:token {text}`, `event:tool {name,status}` (tool **output** goes only to the model,
  never to the client), `event:done`, `event:error` (sanitized — strip key/Authorization).
  `req.on('close')` → `AbortController.abort()`; cap the tool loop at ~8 iterations.
- **Capability flag** — extend `/api/health` (`server.js:82`) →
  `{ ok, demoMode, ai:{ enabled:isConfigured(), provider, model } }`. Key/baseUrl never exposed.
- **demoMode** — allow the agent over mock data (tools already have demo fallbacks); enables a
  free, no-key, no-cluster test path (demo + local Ollama). Still gated on `isConfigured()`.

### 3. Frontend
- **`store.js`** — add `aiEnabled/aiProvider/aiModel` (from `/api/health`), `aiMessages`,
  `aiStreaming`, `aiToolActivity`. Add `openAIChat(opts)` (like `openModal` but **does not
  require `selectedId`**; sets `modal:{type:'ai-chat',...}`, optionally seeds `context` from the
  selected item) and `sendAIMessage(text)` (drives the SSE consumer, appends tokens). Clear
  messages on close (v1).
- **`client/src/lib/agentStream.js`** (new) — `fetch('/api/agent',{method:'POST',signal})` →
  `res.body.getReader()` + `TextDecoder`, split on `\n\n`, parse `event:`/`data:`, dispatch
  `{onToken,onTool,onDone,onError}`; handle `!res.ok` (503).
- **`client/src/components/AIChatModal.jsx`** (new) — reuse ActionModal chrome (backdrop
  `inset:0` + `onClick={closeModal}`, inner `stopPropagation`, header "ASK AI" + model +
  `ESC · close` + `×`). Message list (reuse ActionModal code-block styling — no heavy markdown
  dep), live-appended streaming bubble, tool/thinking chip from `aiToolActivity`, bottom
  textarea (Enter send, Shift+Enter newline, Stop while streaming). Textarea `onKeyDown`
  `stopPropagation` so global keys don't fire. Mount in `App.jsx` next to `<DeleteModal/>`,
  rendering only when `modal?.type==='ai-chat'`.
- **`useKeys.js`** — add a block (before the `filterActive` early-return so it works with no
  selection) bound to **`ctrl+i`**, guarded on `aiEnabled`: no-selection → `openAIChat()`;
  with-selection case is owned by `actionForKey` (below) to avoid double-fire.
- **`actions.js`** — one entry:
  `{ id:'ask-ai', label:'Ask AI about this', hint:'⌃i', group:'Inspect', color:'var(--mz-accent)',
  when: r => useStore.getState().aiEnabled && isStd(r), key: e => e.ctrlKey && e.key==='i',
  run: s => s.openAIChat({ seedSelected:true }) }`. Auto-surfaces in chips/palette/shortcut and
  hides when AI is off.

### 4. Chart wiring — `charts/mezza9`
- **`values.yaml`** — add `ai:` block: `enabled`, `provider`, `model`, `baseUrl`, `maxTokens`,
  `apiKey` (inline → chart-managed Secret) and `existingSecret`/`existingSecretKey` (preferred
  for prod).
- **new `templates/ai-secret.yaml`** — `kind: Secret` rendered when
  `ai.enabled && ai.apiKey && not ai.existingSecret`, `stringData.api-key`.
- **`templates/deployment.yaml`** — extend the env block (after the existing PORT/MEZZ_DEMO env)
  with `MEZZ_AI_PROVIDER/MODEL/MAX_TOKENS`, conditional `MEZZ_AI_BASE_URL`, and
  `MEZZ_AI_API_KEY` via `secretKeyRef` (existingSecret or the chart's `<fullname>-ai`). Key
  reaches the container only as an env var from a Secret — never in the image, never to browser.
- **RBAC** — no change; agent is read-only, needs only existing `get/list/watch` (works even
  with `rbac.readOnly=true` — a selling point).
- **Local run** — `MEZZ_AI_PROVIDER=openai MEZZ_AI_BASE_URL=http://localhost:11434/v1
  MEZZ_AI_MODEL=llama3.1 npm start` (Ollama, no key) or `MEZZ_AI_PROVIDER=anthropic
  MEZZ_AI_API_KEY=… MEZZ_AI_MODEL=claude-opus-4-8 npm start`.

## Risks / edge cases
- **Secret leakage** (core invariant): server-side `redactSecrets` + snapshot never holds
  decoded values; assert redaction strips `data:` values; agent never calls `atob`.
- **Read-only guarantee:** two-layer guard + `spawn(argv)` for model-supplied args.
- **Key safety:** env/Secret only; absent from `/api/health`, error frames, and logs.
- **SSE through ingress:** `X-Accel-Buffering:no` + heartbeats; nginx may need
  `proxy_buffering off` for true token streaming (else degrades to whole-answer).
- **Context/token size:** never dump the cluster — compact projections, tail-capped logs,
  counts+faults summary, per-tool truncation cap.
- **Runaway loops/cost:** one stream per chat, Stop + `req.on('close')` abort, capped tool
  iterations.

## Verification
- **Zero-key e2e:** run Ollama; `MEZZ_AI_PROVIDER=openai MEZZ_AI_BASE_URL=http://localhost:11434/v1
  MEZZ_AI_MODEL=llama3.1 MEZZ_DEMO=1` + `bash scripts/safe-build.sh` + `bash start.sh`;
  `curl /api/health` shows `ai.enabled:true`; `curl -N -XPOST /api/agent -d
  '{"messages":[{"role":"user","content":"which pods are unhealthy?"}]}'` streams token/tool
  frames; grep the stream for base64 secret values → none.
- **Anthropic path:** provider=anthropic + key + `claude-opus-4-8`; verify streaming + tool
  loop; key never appears in any response or log.
- **Read-only:** registry has no write tool; dispatcher rejects non-readOnly; "delete pod X"
  yields a "use the UI" explanation, no `kubectl delete`.
- **Playwright (required, CLAUDE.md):** navigate :3001; select a deployment, `ctrl+i` (or
  `a`→"Ask AI about this"), screenshot the modal; send a question, screenshot streaming + tool
  chip; Esc closes; restart without `MEZZ_AI_*` → feature hidden + `ctrl+i` no-op;
  `browser_close` + delete screenshots. Build with `scripts/safe-build.sh` (browser closed).

## Critical files
- `src/server.js` — `POST /api/agent` SSE route, extend `/api/health`
- `src/agent/{config,providers,tools,prompt}.js` (new) — adapter, read-only registry,
  redaction, system prompt
- `client/src/components/AIChatModal.jsx` + `client/src/lib/agentStream.js` (new)
- `client/src/store.js`, `client/src/hooks/useKeys.js`, `client/src/actions.js`
- `charts/mezza9/values.yaml`, `charts/mezza9/templates/deployment.yaml`,
  `charts/mezza9/templates/ai-secret.yaml` (new)
- root `package.json` — `@anthropic-ai/sdk`, `openai`

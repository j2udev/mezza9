# Mezzanine container image.
#
# Bundles node + the app + pinned kubectl & helm (Mezzanine shells out to both for
# describe/yaml/edit/delete/port-forward and helm get/history/rollback — the same pattern
# Lens uses). The React frontend is built on the host via scripts/safe-build.sh and copied
# in as client/dist (an in-image vite build spikes all cores; we avoid that here).
#
# Build:  bash scripts/safe-build.sh   # refresh client/dist first
#         docker build -t mezzanine:dev .
# Run (local):     docker run --rm -p 3001:3001 -v $HOME/.kube/config:/home/node/.kube/config:ro mezzanine:dev
# Run (demo):      docker run --rm -p 3001:3001 -e MEZZ_DEMO=1 mezzanine:dev

# ── Stage 1: fetch pinned kubectl + helm for the target arch ──
FROM node:22-slim AS bins
ARG TARGETARCH
ARG KUBECTL_VERSION=v1.36.1
ARG HELM_VERSION=v3.20.2
RUN apt-get update && apt-get install -y --no-install-recommends curl ca-certificates \
 && curl -fsSL "https://dl.k8s.io/release/${KUBECTL_VERSION}/bin/linux/${TARGETARCH}/kubectl" -o /usr/local/bin/kubectl \
 && curl -fsSL "https://get.helm.sh/helm-${HELM_VERSION}-linux-${TARGETARCH}.tar.gz" | tar xz -C /tmp \
 && mv "/tmp/linux-${TARGETARCH}/helm" /usr/local/bin/helm \
 && chmod +x /usr/local/bin/kubectl /usr/local/bin/helm

# ── Stage 2: runtime ──
FROM node:22-slim
WORKDIR /app

COPY --from=bins /usr/local/bin/kubectl /usr/local/bin/helm /usr/local/bin/

# Server deps only (no dev deps; concurrently is dev-only).
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY src/ ./src/
COPY client/dist ./client/dist

ENV PORT=3001
# MEZZ_DEMO unset → demo/mock disabled. kubectl/helm resolve from PATH (/usr/local/bin).
EXPOSE 3001
USER node
CMD ["node", "src/server.js"]

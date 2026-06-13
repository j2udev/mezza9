#!/usr/bin/env bash
# Populate the kind cluster with workloads that exercise every dashboard section.
# Idempotent — safe to re-run.
set -euo pipefail

KUBECTL=${KUBECTL:-kubectl}
HELM=${HELM:-helm}

info()  { echo "  → $*"; }
ok()    { echo "  ✓ $*"; }

echo ""
echo "  JARVIS / K8S  ·  cluster setup"
echo "  ──────────────────────────────"

# ── Helm repos ──────────────────────────────────────────────────────────────
info "Adding Helm repos..."
$HELM repo add ingress-nginx https://kubernetes.github.io/ingress-nginx 2>/dev/null || true
$HELM repo add bitnami       https://charts.bitnami.com/bitnami         2>/dev/null || true
$HELM repo add podinfo       https://stefanprodan.github.io/podinfo      2>/dev/null || true
$HELM repo update > /dev/null 2>&1
ok "Repos ready"

# ── ingress-nginx ────────────────────────────────────────────────────────────
info "Installing ingress-nginx..."
if ! $HELM status ingress-nginx -n ingress-nginx &>/dev/null; then
  $HELM install ingress-nginx ingress-nginx/ingress-nginx \
    --namespace ingress-nginx --create-namespace \
    --set controller.service.type=NodePort \
    --set controller.admissionWebhooks.enabled=false \
    --wait --timeout 3m
  ok "ingress-nginx installed"
else
  ok "ingress-nginx already installed"
fi

# ── Redis (StatefulSet, Services, Secrets, ConfigMaps) ───────────────────────
info "Installing redis..."
if ! $HELM status redis -n redis &>/dev/null; then
  $HELM install redis bitnami/redis \
    --namespace redis --create-namespace \
    --set auth.enabled=false \
    --set replica.replicaCount=1 \
    --wait --timeout 3m
  ok "redis installed"
else
  ok "redis already installed"
fi

# ── podinfo (lightweight demo app) ───────────────────────────────────────────
info "Installing podinfo..."
if ! $HELM status podinfo -n podinfo &>/dev/null; then
  $HELM install podinfo podinfo/podinfo \
    --namespace podinfo --create-namespace \
    --wait --timeout 2m
  ok "podinfo installed"
else
  ok "podinfo already installed"
fi

# ── Demo namespace — exercises remaining resource types ──────────────────────
info "Applying demo namespace resources..."
$KUBECTL apply -f - <<'YAML'
---
apiVersion: v1
kind: Namespace
metadata:
  name: demo
---
# CronJob → exercises Jobs + CronJobs views
apiVersion: batch/v1
kind: CronJob
metadata:
  name: demo-cleanup
  namespace: demo
spec:
  schedule: "*/5 * * * *"
  jobTemplate:
    spec:
      template:
        spec:
          restartPolicy: OnFailure
          containers:
          - name: cleanup
            image: busybox:1.36
            command: [sh, -c, "echo 'cleanup run at' $(date) && sleep 2"]
            resources:
              requests: { cpu: 10m, memory: 16Mi }
---
# PVC → exercises Storage view
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: demo-data
  namespace: demo
spec:
  accessModes: [ReadWriteOnce]
  resources:
    requests:
      storage: 100Mi
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: demo-config
  namespace: demo
data:
  app.env: production
  log.level: info
  max.connections: "100"
  feature.flags: "dark-mode=true,beta-api=false"
---
apiVersion: v1
kind: Secret
metadata:
  name: demo-creds
  namespace: demo
type: Opaque
stringData:
  db-password: s3cr3t-demo
  api-key: demo-api-key-12345
---
# Multi-container Deployment → exercises drill-down to containers
apiVersion: apps/v1
kind: Deployment
metadata:
  name: demo-api
  namespace: demo
spec:
  replicas: 2
  selector:
    matchLabels:
      app: demo-api
  template:
    metadata:
      labels:
        app: demo-api
    spec:
      containers:
      - name: api
        image: nginx:1.25-alpine
        ports:
        - containerPort: 80
        resources:
          requests: { cpu: 50m, memory: 64Mi }
          limits:   { cpu: 200m, memory: 128Mi }
        envFrom:
        - configMapRef:
            name: demo-config
      - name: metrics
        image: busybox:1.36
        command: [sh, -c, "while true; do echo metrics $(date); sleep 30; done"]
        resources:
          requests: { cpu: 10m, memory: 16Mi }
---
apiVersion: v1
kind: Service
metadata:
  name: demo-api
  namespace: demo
spec:
  selector:
    app: demo-api
  ports:
  - port: 80
    targetPort: 80
---
# Ingress → exercises Network/Ingresses view
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: podinfo
  namespace: podinfo
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  rules:
  - host: podinfo.local
    http:
      paths:
      - path: /
        pathType: Prefix
        backend:
          service:
            name: podinfo
            port:
              number: 9898
YAML
ok "Demo resources applied"

# ── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo "  Helm releases:"
$HELM list -A | tail -n +2 | awk '{printf "    %-20s %-15s %s\n", $1, $2, $6}'
echo ""
echo "  Pods:"
$KUBECTL get pods -A --no-headers | awk '{printf "    %-22s %-42s %s\n", $1, $2, $4}'
echo ""
echo "  ✓  Done — open http://localhost:3001 to explore"
echo ""

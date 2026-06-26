{{/*
Expand the name of the chart.
*/}}
{{- define "mezza9.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Create a default fully qualified app name.
*/}}
{{- define "mezza9.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/*
Chart name and version, for the chart label.
*/}}
{{- define "mezza9.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/*
Common labels.
*/}}
{{- define "mezza9.labels" -}}
helm.sh/chart: {{ include "mezza9.chart" . }}
{{ include "mezza9.selectorLabels" . }}
{{- if .Chart.AppVersion }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
{{- end }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/*
Selector labels.
*/}}
{{- define "mezza9.selectorLabels" -}}
app.kubernetes.io/name: {{ include "mezza9.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/*
Name of the service account to use.
*/}}
{{- define "mezza9.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "mezza9.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/*
Image reference (tag falls back to chart appVersion).
*/}}
{{- define "mezza9.image" -}}
{{- $tag := .Values.image.tag | default .Chart.AppVersion -}}
{{- printf "%s:%s" .Values.image.repository $tag -}}
{{- end }}

{{/*
Auth gate (task 97). authEnabled = "true" when a token gate is configured (inline token, an
existing Secret, or autoGenerate); empty (falsy) otherwise.
*/}}
{{- define "mezza9.authEnabled" -}}
{{- if or .Values.auth.token .Values.auth.existingSecret .Values.auth.autoGenerate -}}true{{- end -}}
{{- end }}

{{/*
Name of the Secret holding the auth token: the user's existingSecret, else the generated one.
*/}}
{{- define "mezza9.authSecretName" -}}
{{- .Values.auth.existingSecret | default (printf "%s-auth" (include "mezza9.fullname" .)) -}}
{{- end }}

{{/*
Resolve the auth token VALUE for the generated Secret. Used ONLY by secret.yaml (the single
source of truth). Priority: inline auth.token, else autoGenerate -> reuse the existing Secret's
value if one is already in the cluster (so `helm upgrade` does NOT rotate the token), else mint a
fresh random one. (NOTES.txt deliberately never calls this - on a first install each template
invocation of randAlphaNum would differ, so NOTES prints a kubectl retrieval command instead.)
*/}}
{{- define "mezza9.authToken" -}}
{{- if .Values.auth.token -}}
{{- .Values.auth.token -}}
{{- else if .Values.auth.autoGenerate -}}
{{- $name := printf "%s-auth" (include "mezza9.fullname" .) -}}
{{- $existing := lookup "v1" "Secret" .Release.Namespace $name -}}
{{- if and $existing (index ($existing.data | default dict) .Values.auth.secretKey) -}}
{{- index $existing.data .Values.auth.secretKey | b64dec -}}
{{- else -}}
{{- randAlphaNum 32 -}}
{{- end -}}
{{- end -}}
{{- end }}

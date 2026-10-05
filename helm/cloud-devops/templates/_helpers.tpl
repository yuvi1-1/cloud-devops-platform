{{/* ──────────────────────────── Names ──────────────────────────── */}}
{{- define "cloud-devops.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{- define "cloud-devops.fullname" -}}
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

{{- define "cloud-devops.web.fullname" -}}{{ include "cloud-devops.fullname" . | trunc 59 }}-web{{- end }}
{{- define "cloud-devops.api.fullname" -}}{{ include "cloud-devops.fullname" . | trunc 59 }}-api{{- end }}
{{- define "cloud-devops.postgresql.fullname" -}}{{ include "cloud-devops.fullname" . | trunc 52 }}-postgresql{{- end }}

{{- define "cloud-devops.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* ──────────────────────────── Labels ─────────────────────────── */}}
{{- define "cloud-devops.labels" -}}
helm.sh/chart: {{ include "cloud-devops.chart" . }}
app.kubernetes.io/name: {{ include "cloud-devops.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Values.global.imageTag | default .Chart.AppVersion | trunc 63 | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: cloud-devops-platform
{{- end }}

{{/* Selector labels for a component: (dict "root" $ "component" "web") */}}
{{- define "cloud-devops.selectorLabels" -}}
app.kubernetes.io/name: {{ include "cloud-devops.name" .root }}
app.kubernetes.io/instance: {{ .root.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{- define "cloud-devops.componentLabels" -}}
{{ include "cloud-devops.labels" .root }}
app.kubernetes.io/component: {{ .component }}
{{- end }}

{{/* ──────────────────────────── Images ─────────────────────────── */}}
{{- define "cloud-devops.imageTag" -}}
{{- .image.tag | default .root.Values.global.imageTag | default .root.Chart.AppVersion -}}
{{- end }}

{{/* Full image reference; a digest (from CI) wins over the tag for immutability. */}}
{{- define "cloud-devops.image" -}}
{{- if .image.digest -}}
{{ .image.repository }}@{{ .image.digest }}
{{- else -}}
{{ .image.repository }}:{{ include "cloud-devops.imageTag" . }}
{{- end -}}
{{- end }}

{{- define "cloud-devops.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "cloud-devops.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* ──────────────────────────── Secrets ────────────────────────── */}}
{{- define "cloud-devops.ingestSecretName" -}}
{{- if .Values.api.ingestToken.existingSecret -}}
{{ .Values.api.ingestToken.existingSecret }}
{{- else -}}
{{ include "cloud-devops.fullname" . }}-ingest
{{- end -}}
{{- end }}

{{- define "cloud-devops.ingestEnabled" -}}
{{- if or .Values.api.ingestToken.existingSecret .Values.api.ingestToken.value (and .Values.externalSecrets.enabled .Values.externalSecrets.ingestTokenKey) -}}true{{- end -}}
{{- end }}

{{- define "cloud-devops.dbSecretName" -}}
{{- if .Values.database.existingSecret -}}
{{ .Values.database.existingSecret }}
{{- else -}}
{{ include "cloud-devops.fullname" . }}-db
{{- end -}}
{{- end }}

{{- define "cloud-devops.dbHost" -}}
{{- if eq .Values.database.mode "internal" -}}
{{ include "cloud-devops.postgresql.fullname" . }}
{{- else -}}
{{ required "database.external.host is required when database.mode=external" .Values.database.external.host }}
{{- end -}}
{{- end }}

{{/* ──────────────────────────── API env ────────────────────────── */}}
{{- define "cloud-devops.api.env" -}}
- name: NODE_ENV
  value: production
- name: PORT
  value: {{ .Values.api.containerPort | quote }}
- name: LOG_LEVEL
  value: {{ .Values.api.logLevel | quote }}
- name: APP_VERSION
  value: {{ include "cloud-devops.imageTag" (dict "root" . "image" .Values.api.image) | quote }}
- name: DEPLOY_ENVIRONMENT
  value: {{ .Values.environment | quote }}
- name: SEED_DEMO_DATA
  value: {{ .Values.api.seedDemoData | quote }}
- name: ENABLE_LOAD_ENDPOINT
  value: {{ .Values.api.enableLoadEndpoint | quote }}
- name: RATE_LIMIT_PER_MINUTE
  value: {{ .Values.api.rateLimitPerMinute | quote }}
- name: SHUTDOWN_DELAY_MS
  value: {{ .Values.api.shutdownDelayMs | quote }}
- name: POD_NAME
  valueFrom:
    fieldRef:
      fieldPath: metadata.name
- name: NODE_NAME
  valueFrom:
    fieldRef:
      fieldPath: spec.nodeName
{{- if include "cloud-devops.ingestEnabled" . }}
- name: INGEST_TOKEN
  valueFrom:
    secretKeyRef:
      name: {{ include "cloud-devops.ingestSecretName" . }}
      key: {{ .Values.api.ingestToken.key }}
{{- end }}
{{- if ne .Values.database.mode "none" }}
- name: PGHOST
  value: {{ include "cloud-devops.dbHost" . | quote }}
- name: PGPORT
  value: {{ (eq .Values.database.mode "internal") | ternary 5432 .Values.database.external.port | quote }}
- name: PGDATABASE
  value: {{ .Values.database.name | quote }}
- name: PGUSER
  value: {{ .Values.database.user | quote }}
- name: PGPASSWORD
  valueFrom:
    secretKeyRef:
      name: {{ include "cloud-devops.dbSecretName" . }}
      key: {{ .Values.database.passwordKey }}
{{- if and (eq .Values.database.mode "external") .Values.database.external.ssl }}
- name: DATABASE_SSL
  value: "true"
{{- if .Values.database.external.caConfigMap }}
- name: DATABASE_SSL_CA_FILE
  value: /etc/ssl/database/{{ .Values.database.external.caKey }}
{{- end }}
{{- end }}
{{- end }}
{{- with .Values.api.extraEnv }}
{{ toYaml . }}
{{- end }}
{{- end }}

{{/* Topology spread: spread replicas across zones first, then nodes. */}}
{{- define "cloud-devops.topologySpread" -}}
{{- if .root.Values.topologySpread.enabled }}
topologySpreadConstraints:
  - maxSkew: {{ .root.Values.topologySpread.maxSkew }}
    topologyKey: topology.kubernetes.io/zone
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        {{- include "cloud-devops.selectorLabels" (dict "root" .root "component" .component) | nindent 8 }}
  - maxSkew: {{ .root.Values.topologySpread.maxSkew }}
    topologyKey: kubernetes.io/hostname
    whenUnsatisfiable: ScheduleAnyway
    labelSelector:
      matchLabels:
        {{- include "cloud-devops.selectorLabels" (dict "root" .root "component" .component) | nindent 8 }}
{{- end }}
{{- end }}

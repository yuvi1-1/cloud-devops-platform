{{/* match block for Pods in the given namespaces */}}
{{- define "platform.match" -}}
match:
  any:
    - resources:
        kinds: [Pod]
        namespaces:
          {{- toYaml . | nindent 10 }}
{{- end }}

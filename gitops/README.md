# GitOps

Argo CD reconciles the cluster from this directory.

```text
gitops/
├── bootstrap/            Helm chart → AppProjects + one Argo CD Application per add-on and environment
│   ├── values.yaml       EKS profile (cluster facts injected by Terraform)
│   └── values-kind.yaml  local kind profile
├── platform/
│   ├── values/<addon>.yaml          values for each upstream chart (+ <addon>.<provider>.yaml overrides)
│   └── config/                      Gateway, EnvoyProxy, ClusterIssuer, ClusterSecretStore, Kyverno policies
└── environments/
    ├── dev/values.yaml   image tag bumped automatically by CI
    └── prod/values.yaml  changed only through the "Promote to prod" pull request
```

* **Add an add-on:** add an entry under `addons:` in `bootstrap/values.yaml` and a values file in `platform/values/`.
* **Change an environment:** edit `environments/<env>/values.yaml` (any chart value) and open a PR.
* **Roll back:** `git revert` the commit that changed the image tag.

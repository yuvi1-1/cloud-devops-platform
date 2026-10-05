# Live demo guide (≈15 minutes)

A scripted walkthrough for the project viva. Run it on the local kind cluster (no AWS cost, works offline once images are built) or on EKS.

**Prepare (before the session):**

```bash
make kind-full                 # app + Argo Rollouts + Prometheus/Grafana, ≈8 min
kubectl -n monitoring port-forward svc/kube-prometheus-stack-grafana 3001:80 &   # admin / prom-operator
kubectl -n argo-rollouts port-forward svc/argo-rollouts-dashboard 3100:3100 &
```

Open tabs: dashboard (http://cloud-devops.localtest.me), Grafana dashboard "Cloud DevOps Platform — API", Rollouts dashboard (http://localhost:3100), the GitHub Actions page, and the repository README.

---

## 1. The problem and the product (2 min)

* Show the dashboard: the four DORA metrics with performance levels, daily deployments, the release matrix.
* Switch environments and time windows — data comes from the API and PostgreSQL.
* *Point:* "Teams are judged on how safely and often they change production; this platform both measures that and is built to score well on it."

## 2. The delivery pipeline (3 min)

* Open a recent CI run: tests → manifests → Terraform → security → signed images → e2e on kind → dev deploy → deployment tracking.
* Show the *Security* tab (Trivy/CodeQL), an image's signature and SBOM:

  ```bash
  cosign verify ghcr.io/yuvi1-1/cloud-devops-platform/api:<sha> \
    --certificate-identity-regexp '^https://github.com/yuvi1-1/cloud-devops-platform/' \
    --certificate-oidc-issuer https://token.actions.githubusercontent.com | jq '.[0].optional.Subject'
  ```

* Show `gitops/environments/dev/values.yaml` history — every deployment is a commit.

## 3. Kubernetes resilience (3 min)

```bash
kubectl -n cloud-devops get pods -o wide             # replicas spread across nodes/zones
kubectl -n cloud-devops delete pod -l app.kubernetes.io/component=api --wait=false
watch kubectl -n cloud-devops get pods               # self-healing; dashboard keeps working
```

* Refresh the dashboard repeatedly: the **Platform → Served by pod** value changes — load balancing across replicas.
* NetworkPolicy:

  ```bash
  # a pod outside the allowed sources cannot reach the API (default deny)
  kubectl -n default run probe --rm -it --image=curlimages/curl:8.15.0 --restart=Never -- \
    curl -m 5 http://cloud-devops-api.cloud-devops/healthz        # → timeout
  ```

## 4. Autoscaling (3 min)

```bash
./scripts/hpa-demo.sh cloud-devops 180
```

* Watch `TARGETS` climb above 70% and `REPLICAS` grow from 2 → up to 10 within a minute.
* In Grafana, "Requests per pod" gains new series as pods join. After the load stops, replicas scale back down after the 2-minute stabilisation window.

## 5. Automated canary rollback (4 min)

Simulate a bad release by enabling fault injection on a new version of the API:

```bash
helm upgrade cloud-devops helm/cloud-devops -n cloud-devops --reuse-values \
  --set api.chaosErrorRate=0.5 --set api.podAnnotations.release=bad-$(date +%s)
kubectl argo rollouts get rollout cloud-devops-api -n cloud-devops --watch
```

In a second terminal generate traffic so the analysis has data:

```bash
for i in $(seq 1 600); do curl -s -o /dev/null http://cloud-devops.localtest.me/api/v1/dora; sleep 0.2; done
```

* The canary receives 20% of traffic; ~50% of its requests fail.
* Within 1–2 minutes the `success-rate` measurement fails twice (`< 0.95`) → the rollout is **Degraded/Aborted** and 100% of traffic returns to the stable version automatically. Show this in the Rollouts dashboard and the Grafana 5xx panel.
* Recover with a good release:

  ```bash
  helm upgrade cloud-devops helm/cloud-devops -n cloud-devops --reuse-values \
    --set api.chaosErrorRate=0 --set api.podAnnotations.release=good-$(date +%s)
  ```

> On EKS the same demo is a Git change: set `api.chaosErrorRate: 0.5` in `gitops/environments/dev/values.yaml`, commit, and watch Argo CD + Argo Rollouts react — then `git revert`.

## 6. Infrastructure as code (1 min)

* Walk through `infra/terraform` (VPC → EKS → Pod Identity → OIDC → Argo CD bootstrap).
* Run the offline tests: `make tf-test` — planning the full stack with mocked AWS in seconds.

## Closing line

"From a `git push`, the change is tested, scanned, signed, deployed by GitOps, released by a metrics-gated canary that rolls itself back, and recorded as a DORA data point — with no static credentials anywhere."

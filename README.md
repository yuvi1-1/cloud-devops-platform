# Cloud DevOps Platform

A production-oriented **cloud-native deployment platform** demonstrating how to containerize, deploy, scale, secure, and continuously deliver a React application using **Docker, Kubernetes, Helm, Amazon EKS, GitHub Actions, GitHub Container Registry, and AWS IAM OIDC**.

The project was built to simulate a real-world DevOps workflow in which a developer pushes code to GitHub, an automated CI pipeline builds and publishes a Docker image, and a CD pipeline deploys the corresponding version to an Amazon EKS cluster using Helm.

---

## Overview

This project implements an end-to-end DevOps and Kubernetes deployment workflow:

```text
Developer
    │
    │ git push
    ▼
GitHub Repository
    │
    ▼
GitHub Actions — CI
    │
    ├── Install dependencies
    ├── Build React application
    ├── Build Docker image
    └── Push image to GHCR
            │
            ▼
GitHub Container Registry
            │
            ▼
GitHub Actions — CD
            │
            ├── Authenticate using AWS OIDC
            ├── Verify AWS identity
            ├── Verify EKS cluster
            ├── Configure kubeconfig
            └── Deploy using Helm
                    │
                    ▼
              Amazon EKS
                    │
             ┌──────┴──────┐
             │             │
          Pod 1          Pod 2
             │             │
             └──────┬──────┘
                    │
              Kubernetes Service
                    │
                    ▼
             NGINX Ingress
                    │
                    ▼
          AWS Load Balancer
                    │
                    ▼
             React Application
```

---

# Key Features

* Dockerized React application
* Multi-stage Docker build
* NGINX-based production container
* GitHub Container Registry integration
* Kubernetes deployment on Amazon EKS
* Managed EKS node group
* Helm-based Kubernetes deployment
* Rolling update strategy
* Zero unavailable pods during rolling deployment
* Readiness and liveness probes
* Kubernetes resource requests and limits
* Kubernetes security context
* Non-root container execution
* Linux capability dropping
* Pod Disruption Budget
* Horizontal Pod Autoscaler configuration
* NGINX Ingress Controller
* AWS Load Balancer integration
* GitHub Actions CI/CD
* AWS IAM OIDC authentication
* EKS access entries for GitHub Actions
* Deployment verification and rollout checks

---

# Technology Stack

| Category                  | Technology                          |
| ------------------------- | ----------------------------------- |
| Frontend                  | React                               |
| Build Tool                | Vite                                |
| Containerization          | Docker                              |
| Container Runtime         | NGINX                               |
| Container Registry        | GitHub Container Registry           |
| Orchestration             | Kubernetes                          |
| Kubernetes Distribution   | Amazon EKS                          |
| Package Management        | Helm                                |
| Ingress                   | NGINX Ingress Controller            |
| Cloud Provider            | AWS                                 |
| Compute                   | Amazon EC2 / EKS Managed Node Group |
| CI/CD                     | GitHub Actions                      |
| Authentication            | AWS IAM OIDC                        |
| Infrastructure Management | eksctl                              |
| Application Validation    | kubectl / curl                      |

---

# Project Architecture

## Application Layer

The application is a React frontend built using Vite.

For production, the generated static files are served using NGINX rather than running the Vite development server.

The Docker image uses a multi-stage build to keep the final production image smaller and separate the build environment from the runtime environment.

---

# Docker Architecture

The Dockerfile uses two stages.

### Stage 1 — Build

```text
node:22-alpine
       │
       ├── Install dependencies
       ├── Copy source code
       └── npm run build
              │
              ▼
            /dist
```

### Stage 2 — Runtime

```text
nginx:alpine
      │
      └── Copy /dist
             │
             ▼
     /usr/share/nginx/html
```

This approach avoids shipping Node.js, npm, and development dependencies in the production image.

### Build locally

```bash
docker build -t cloud-devops-platform .
```

Run locally:

```bash
docker run -p 8080:80 cloud-devops-platform
```

The application can then be accessed through port `8080`.

---

# Kubernetes Architecture

The application is deployed using the following Kubernetes resources:

```text
PodDisruptionBudget
        │
        ▼
Deployment
        │
        ├── Pod
        └── Pod
        │
        ▼
Service
        │
        ▼
Ingress
```

The Helm chart manages these resources so the deployment can be reproduced consistently across environments.

---

# Kubernetes Deployment

The application runs with:

* 2 replicas
* RollingUpdate deployment strategy
* `maxUnavailable: 0`
* `maxSurge: 1`

This means Kubernetes creates a replacement pod before terminating an existing pod, helping maintain availability during deployments.

Example strategy:

```yaml
strategy:
  type: RollingUpdate
  rollingUpdate:
    maxUnavailable: 0
    maxSurge: 1
```

---

# Health Checks

The application uses Kubernetes readiness and liveness probes.

### Readiness Probe

The readiness probe checks whether the application is ready to receive traffic.

```text
HTTP GET /
Port: 80
Initial delay: 5 seconds
Period: 10 seconds
```

Traffic is only routed to pods that successfully pass the readiness check.

### Liveness Probe

The liveness probe allows Kubernetes to detect an unhealthy application container and restart it when necessary.

This improves application resilience during runtime failures.

---

# Resource Management

The Kubernetes deployment defines CPU and memory requests and limits.

This provides Kubernetes with information about the application's resource requirements and prevents a container from consuming unlimited resources.

Resource definitions also allow the Horizontal Pod Autoscaler to make scaling decisions based on CPU utilization.

---

# Container Security

The deployment uses Kubernetes security controls including:

```yaml
runAsNonRoot: true
```

and:

```yaml
allowPrivilegeEscalation: false
```

The container also drops Linux capabilities:

```yaml
capabilities:
  drop:
    - ALL
```

Additionally, the pod uses the default runtime seccomp profile.

These controls reduce the container's privileges and follow container security best practices.

---

# Helm

Helm is used to package and deploy the Kubernetes application.

The chart contains configurable Kubernetes templates for:

* Deployment
* Service
* Ingress
* HorizontalPodAutoscaler
* PodDisruptionBudget

The deployment image can be overridden during installation:

```bash
helm upgrade --install cloud-devops helm/cloud-devops \
  --set image.repository=ghcr.io/<github-username>/cloud-devops-platform \
  --set image.tag=latest
```

Validate the chart:

```bash
helm lint helm/cloud-devops
```

Render the templates locally:

```bash
helm template cloud-devops helm/cloud-devops
```

Check the installed release:

```bash
helm list
```

---

# Amazon EKS

The Kubernetes cluster is hosted on Amazon Elastic Kubernetes Service.

The cluster uses:

```text
Cluster:
cloud-devops-cluster

Region:
ap-south-1

Managed Node Group:
cloud-devops-nodes

Instance Type:
t3.small
```

The cluster uses an EKS managed node group with one worker node for the current deployment.

The node is responsible for running the application workloads and Kubernetes system components.

---

# EKS Networking

The cluster uses the Amazon VPC CNI plugin.

The VPC CNI provides Kubernetes pods with networking integrated with the AWS VPC.

During development, the node initially entered the `NotReady` state because the CNI was not initialized.

The issue was investigated using:

```bash
kubectl describe node <node-name>
```

The key error was:

```text
NetworkPluginNotReady
cni plugin not initialized
```

The EKS VPC CNI addon was then verified and brought into a healthy state.

Final verification:

```bash
kubectl get nodes
```

Result:

```text
STATUS
Ready
```

This troubleshooting experience demonstrated the importance of checking:

* Node conditions
* EKS addons
* DaemonSets
* Kubernetes events
* CloudFormation events
* EC2 instance health

rather than assuming that a running EC2 instance automatically means a healthy Kubernetes node.

---

# NGINX Ingress

The application is exposed through the NGINX Ingress Controller.

The architecture is:

```text
Internet
   │
   ▼
AWS Load Balancer
   │
   ▼
NGINX Ingress Controller
   │
   ▼
cloud-devops-ingress
   │
   ▼
cloud-devops-service
   │
   ▼
Application Pods
```

The Ingress routes requests for:

```text
cloud-devops.local
```

to the Kubernetes service.

The NGINX Ingress Controller itself is exposed through an AWS Load Balancer.

---

# External Application Verification

After deploying the application, the ingress was verified using the AWS Load Balancer endpoint.

Example:

```bash
curl -H "Host: cloud-devops.local" \
  http://<load-balancer-dns-name>
```

The response returned the React application's generated HTML.

This verified the complete networking path:

```text
AWS Load Balancer
        ↓
NGINX Ingress
        ↓
Kubernetes Service
        ↓
React Pods
        ↓
NGINX
        ↓
React Application
```

---

# Horizontal Pod Autoscaling

The Helm deployment includes a Horizontal Pod Autoscaler.

Current configuration:

```text
Minimum replicas: 2
Maximum replicas: 4
CPU target: 70%
```

The HPA allows Kubernetes to increase the number of application pods when CPU utilization increases.

Example:

```text
Normal load
    ↓
2 pods

High CPU utilization
    ↓
3 pods
    ↓
4 pods
```

For CPU-based HPA metrics to report actual utilization, the cluster must have a metrics provider such as Metrics Server installed.

---

# Pod Disruption Budget

A Pod Disruption Budget is configured to maintain application availability during voluntary disruptions.

Current configuration:

```text
Minimum available pods: 1
```

This prevents Kubernetes from voluntarily disrupting all application replicas simultaneously.

Combined with the rolling deployment strategy, this provides additional availability protection.

---

# CI Pipeline

The CI pipeline is triggered when code is pushed to the `main` branch or when a pull request targets `main`.

The pipeline performs:

```text
Checkout
   ↓
Setup Node.js
   ↓
npm ci
   ↓
npm run build
   ↓
Docker login
   ↓
Docker build
   ↓
Push image to GHCR
```

Two Docker image tags are generated:

```text
<commit-sha>
latest
```

The commit SHA tag provides immutable versioning while `latest` provides a convenient reference to the most recent build.

Example:

```text
ghcr.io/<github-username>/cloud-devops-platform:<commit-sha>
ghcr.io/<github-username>/cloud-devops-platform:latest
```

---

# CD Pipeline

The CD pipeline deploys the application to EKS.

The deployment workflow performs:

```text
GitHub Actions
      │
      ▼
AWS IAM OIDC
      │
      ▼
Assume GitHubActions-CloudDevOps role
      │
      ▼
Verify AWS identity
      │
      ▼
Verify EKS cluster
      │
      ▼
Update kubeconfig
      │
      ▼
Helm upgrade --install
      │
      ▼
Wait for rollout
      │
      ▼
Verify deployment and pods
```

The Helm deployment uses the commit SHA generated by the CI workflow so that the deployment corresponds to a specific source revision rather than relying only on the mutable `latest` tag.

---

# AWS Authentication from GitHub Actions

The CD workflow does not use long-lived AWS access keys.

Instead, GitHub Actions uses **AWS IAM OIDC federation**.

The flow is:

```text
GitHub Actions
      │
      │ OIDC token
      ▼
AWS IAM
      │
      │ AssumeRole
      ▼
GitHubActions-CloudDevOps
      │
      ▼
AWS APIs
```

This avoids storing permanent AWS access keys inside GitHub repository secrets.

The IAM role is configured with permissions required to interact with the EKS environment.

---

# EKS Access Control for CI/CD

AWS authentication and Kubernetes authorization are separate concepts.

The GitHub Actions role can successfully authenticate to AWS, but it must also be authorized to access the Kubernetes API.

The EKS cluster uses:

```text
API_AND_CONFIG_MAP
```

authentication mode.

The GitHub Actions IAM role is therefore configured as an EKS access entry and associated with the appropriate EKS access policy.

This allows the CD workflow to execute commands such as:

```bash
kubectl get pods
helm upgrade --install ...
kubectl rollout status ...
```

against the EKS cluster.

This distinction was an important part of troubleshooting the CI/CD pipeline:

```text
AWS authentication
        ↓
Successful

EKS API authorization
        ↓
Required separately
```

---

# Deployment Verification

The CD workflow verifies that the deployment completed successfully.

Rollout verification:

```bash
kubectl rollout status deployment/cloud-devops-app --timeout=180s
```

Deployment verification:

```bash
kubectl get deployment cloud-devops-app
```

Pod verification:

```bash
kubectl get pods -l app=cloud-devops-app
```

Ingress verification:

```bash
kubectl get ingress
```

---

# Production-Style Deployment Features

The project intentionally incorporates several production-oriented Kubernetes practices.

### Availability

* Multiple replicas
* Rolling updates
* `maxUnavailable: 0`
* Pod Disruption Budget
* Readiness probes

### Reliability

* Liveness probes
* Rollout verification
* Health checks
* Kubernetes-managed restart behavior

### Security

* Non-root containers
* No privilege escalation
* Dropped Linux capabilities
* Seccomp runtime profile
* IAM OIDC instead of static AWS credentials

### Scalability

* Horizontal Pod Autoscaler
* Resource requests and limits
* Kubernetes scheduling

### Deployment Automation

* GitHub Actions
* Docker image versioning
* GHCR
* Helm
* EKS

---

# Project Structure

```text
cloud-devops-platform/
│
├── .github/
│   └── workflows/
│       ├── ci.yml
│       └── deploy.yml
│
├── helm/
│   └── cloud-devops/
│       ├── Chart.yaml
│       ├── values.yaml
│       └── templates/
│           ├── deployment.yaml
│           ├── service.yaml
│           ├── ingress.yaml
│           ├── hpa.yaml
│           └── pdb.yaml
│
├── public/
│
├── src/
│
├── Dockerfile
├── package.json
├── package-lock.json
└── README.md
```

---

# Local Development

Install dependencies:

```bash
npm ci
```

Start the development server:

```bash
npm run dev
```

Build the application:

```bash
npm run build
```

---

# Kubernetes Deployment from Local Machine

Verify the EKS cluster:

```bash
aws eks describe-cluster \
  --name cloud-devops-cluster \
  --region ap-south-1 \
  --query 'cluster.status' \
  --output text
```

Configure kubectl:

```bash
aws eks update-kubeconfig \
  --region ap-south-1 \
  --name cloud-devops-cluster
```

Verify nodes:

```bash
kubectl get nodes
```

Deploy using Helm:

```bash
helm upgrade --install cloud-devops helm/cloud-devops \
  --set image.repository=ghcr.io/<github-username>/cloud-devops-platform \
  --set image.tag=latest
```

Verify:

```bash
kubectl get pods
kubectl get deployment
kubectl get svc
kubectl get ingress
```

---

# Troubleshooting Experience

A significant part of this project involved diagnosing real AWS and Kubernetes deployment issues.

## 1. EKS node group stuck in CREATING

The managed node group initially remained in:

```text
CREATE_IN_PROGRESS
```

CloudFormation eventually reported:

```text
NodeCreationFailure
Unhealthy nodes in the kubernetes cluster
```

Investigation involved:

```bash
aws cloudformation describe-stack-events
aws eks describe-nodegroup
kubectl get nodes
kubectl describe node <node-name>
```

The node was found to be:

```text
NotReady
```

with:

```text
NetworkPluginNotReady
cni plugin not initialized
```

The VPC CNI configuration was investigated and corrected.

The final node state became:

```text
Ready
```

---

## 2. Kubernetes API authentication failure in GitHub Actions

The CD workflow initially failed with:

```text
Kubernetes cluster unreachable:
the server has asked for the client to provide credentials
```

AWS authentication itself was successful.

The issue was that the GitHub Actions IAM role did not have an EKS access entry.

This demonstrated an important distinction:

```text
IAM authentication ≠ Kubernetes authorization
```

The GitHub Actions IAM role was subsequently configured as an EKS access entry with an appropriate access policy.

---

## 3. Cluster connectivity failure during EKS creation

During an earlier EKS creation attempt, the local network disconnected.

The error included:

```text
dial tcp:
lookup cloudformation.ap-south-1.amazonaws.com:
no such host
```

The cluster and CloudFormation resources were subsequently inspected rather than blindly recreating everything.

This helped identify which resources had actually been created and which resources required cleanup.

---

# Useful Debugging Commands

Check cluster:

```bash
aws eks describe-cluster \
  --name cloud-devops-cluster \
  --region ap-south-1
```

Check node groups:

```bash
aws eks list-nodegroups \
  --cluster-name cloud-devops-cluster \
  --region ap-south-1
```

Check nodes:

```bash
kubectl get nodes -o wide
```

Inspect a node:

```bash
kubectl describe node <node-name>
```

Check system pods:

```bash
kubectl get pods -n kube-system -o wide
```

Check Helm releases:

```bash
helm list
```

Check deployment:

```bash
kubectl get deployment
```

Check rollout:

```bash
kubectl rollout status deployment/cloud-devops-app
```

Check ingress:

```bash
kubectl get ingress
```

Check HPA:

```bash
kubectl get hpa
```

Check PDB:

```bash
kubectl get pdb
```

---

# Security Considerations

The project avoids several common insecure practices.

### No static AWS credentials in GitHub Actions

AWS authentication uses OIDC and IAM roles.

### Container runs without root privileges

The Kubernetes security context specifies:

```text
runAsNonRoot: true
```

### Privilege escalation disabled

```text
allowPrivilegeEscalation: false
```

### Linux capabilities dropped

```text
drop:
  - ALL
```

### Immutable image versioning

CI publishes an image using the Git commit SHA.

This allows a deployment to identify exactly which source revision is running.

---

# Deployment Lifecycle

A normal application change follows this lifecycle:

```text
1. Developer modifies application
             ↓
2. git push
             ↓
3. GitHub Actions CI starts
             ↓
4. Dependencies installed
             ↓
5. React application built
             ↓
6. Docker image created
             ↓
7. Image pushed to GHCR
             ↓
8. CD workflow starts
             ↓
9. GitHub authenticates with AWS using OIDC
             ↓
10. EKS cluster is verified
             ↓
11. kubeconfig is configured
             ↓
12. Helm upgrades the application
             ↓
13. Kubernetes performs rolling update
             ↓
14. Readiness probes validate new pods
             ↓
15. Rollout status is verified
             ↓
16. Application remains accessible
```

---

# Why This Project Is Relevant to DevOps Roles

This project demonstrates practical knowledge of:

* Linux-based containers
* Docker image construction
* Container registries
* Kubernetes fundamentals
* Kubernetes networking
* Kubernetes health checks
* Kubernetes scaling
* Kubernetes security
* Helm
* Amazon EKS
* AWS IAM
* AWS OIDC
* GitHub Actions
* CI/CD
* Infrastructure troubleshooting
* Cloud networking
* Production deployment practices

Rather than only deploying Kubernetes resources locally, the project uses a real managed Kubernetes cluster and AWS networking infrastructure.

---

# Interview Discussion Points

The project can be discussed through the following key areas.

### Why Kubernetes?

Kubernetes provides automated scheduling, service discovery, health management, rolling deployments, scaling, and self-healing for containerized applications.

### Why Helm?

Helm packages Kubernetes resources into a reusable deployment unit and makes configuration easier to manage across environments.

### Why EKS?

EKS provides managed Kubernetes control-plane infrastructure while allowing applications to run on AWS-managed worker nodes.

### Why GitHub Actions?

GitHub Actions provides native CI/CD integration with the source repository and can automatically build, publish, and deploy application changes.

### Why GHCR?

GitHub Container Registry provides a convenient registry tightly integrated with GitHub Actions.

### Why OIDC?

OIDC avoids storing long-lived AWS access keys in GitHub and allows GitHub Actions to assume a restricted IAM role temporarily.

### Why readiness probes?

A pod can be running while the application is not ready to serve traffic. Readiness probes prevent traffic from being routed to unhealthy or initializing pods.

### Why liveness probes?

Liveness probes allow Kubernetes to detect containers that have become unhealthy and restart them automatically.

### Why rolling updates?

Rolling updates allow new versions to be introduced gradually while keeping the application available.

### Why PDB?

A Pod Disruption Budget protects application availability during voluntary disruptions such as node maintenance.

### Why HPA?

HPA allows Kubernetes to automatically adjust the number of replicas based on resource utilization.

---

# Future Improvements

Potential future enhancements include:

* Add Metrics Server for fully functional CPU-based HPA
* Add HTTPS/TLS using AWS Certificate Manager
* Configure a custom domain
* Add Route 53 DNS
* Add automated Helm chart testing
* Add image vulnerability scanning
* Add Trivy container scanning
* Add Dependabot
* Add separate development and production environments
* Add Terraform for infrastructure as code
* Add Prometheus and Grafana monitoring
* Add centralized logging
* Add deployment notifications
* Add canary or blue-green deployments
* Add automated rollback on failed deployments

---

# Cleanup

AWS resources can incur charges when left running.

When the project is no longer needed, remove the Kubernetes resources and AWS infrastructure according to the resources created during deployment.

For example, remove the Helm release:

```bash
helm uninstall cloud-devops
```

Remove the ingress controller if it is no longer required:

```bash
helm uninstall ingress-nginx \
  --namespace ingress-nginx
```

The EKS cluster and associated AWS resources should also be removed when the project is no longer being demonstrated.

---

# Final Validation

A healthy deployment should show:

```bash
kubectl get nodes
```

with:

```text
Ready
```

Application pods:

```bash
kubectl get pods
```

with:

```text
2/2 Running
```

Deployment:

```bash
kubectl rollout status deployment/cloud-devops-app
```

with:

```text
deployment "cloud-devops-app" successfully rolled out
```

Ingress:

```bash
kubectl get ingress
```

with an AWS Load Balancer address.

Helm:

```bash
helm list
```

with:

```text
cloud-devops    deployed
```

---

# Conclusion

Cloud DevOps Platform demonstrates a complete cloud-native application delivery workflow, starting from source code and ending with a production-style deployment on Amazon EKS.

The project combines containerization, Kubernetes orchestration, Helm packaging, AWS infrastructure, secure IAM authentication, GitHub Actions CI/CD, ingress networking, health checks, autoscaling, availability controls, and real-world troubleshooting.

The primary goal was not simply to deploy an application, but to understand and implement the complete lifecycle:

```text
Code
 ↓
Build
 ↓
Containerize
 ↓
Publish
 ↓
Authenticate
 ↓
Deploy
 ↓
Orchestrate
 ↓
Expose
 ↓
Monitor
 ↓
Scale
 ↓
Update
```

This provides practical experience with the core technologies and workflows used in modern DevOps and cloud engineering environments.

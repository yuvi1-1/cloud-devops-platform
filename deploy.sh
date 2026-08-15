#!/bin/bash

set -e

IMAGE="ghcr.io/yuvi1-1/cloud-devops-platform:latest"

echo "Deploying Cloud DevOps Platform..."

echo "Pulling image..."
docker pull "$IMAGE"

echo "Loading image into Kind..."
kind load docker-image "$IMAGE" --name tws-cluster

echo "Deploying with Helm..."
helm upgrade --install cloud-devops helm/cloud-devops \
  --set image.repository="ghcr.io/yuvi1-1/cloud-devops-platform" \
  --set image.tag="latest"

echo "Waiting for deployment..."
kubectl rollout status deployment/cloud-devops-app

echo "Deployment successful!"

kubectl get pods -l app=cloud-devops-app
#!/usr/bin/env bash
# Delete the local kind cluster created by kind-up.sh.
set -euo pipefail
kind delete cluster --name cloud-devops

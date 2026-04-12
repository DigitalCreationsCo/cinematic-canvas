#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
IMAGE_NAME="cinematic-canvas:monolith"
ENV_FILE="${1:-$SCRIPT_DIR/../.env}"

if [[ ! -f "$ENV_FILE" ]]; then
    echo "Error: env file not found: $ENV_FILE"
    exit 1
fi

docker run --rm \
  --env-file "$(realpath "$ENV_FILE")" \
  -p 8000:8000 \
  "$IMAGE_NAME"
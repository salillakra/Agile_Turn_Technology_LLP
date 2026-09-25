#!/usr/bin/env bash
# Start the full stack in Docker (app, worker, postgres, redis, AI).
# Usage: bash start-dev.sh
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$DIR"

for sock in /var/run/docker.sock /run/docker.sock "$HOME/.docker/desktop/docker.sock" "/run/user/$(id -u)/docker.sock"; do
  if [[ -S "$sock" ]]; then
    export DOCKER_HOST="unix://$sock"
    break
  fi
done

if ! docker info &>/dev/null; then
  echo "Docker daemon is not running."
  exit 1
fi

if [[ ! -f .env ]]; then
  echo "No .env found — copying from .env.example"
  cp .env.example .env
fi

echo "Starting stack (docker compose)..."
docker compose up --build

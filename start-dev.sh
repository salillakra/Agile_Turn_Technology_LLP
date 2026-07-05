#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# start-dev.sh — Start the Docker infrastructure for local development.
#
# Starts: PostgreSQL (with pgvector), Redis, AI service
# Then runs: Prisma migrations, then npm run dev:all (Next.js + monitor)
#
# Usage: bash start-dev.sh
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

COMPOSE_FILE="docker-compose.dev.yml"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

cd "$DIR"

# ── Detect Docker socket ──────────────────────────────────────────────────────
# Try sockets in order of preference
for sock in /var/run/docker.sock /run/docker.sock "$HOME/.docker/desktop/docker.sock" "/run/user/$(id -u)/docker.sock"; do
  if [[ -S "$sock" ]]; then
    export DOCKER_HOST="unix://$sock"
    break
  fi
done

if ! docker info &>/dev/null; then
  echo ""
  echo "╔══════════════════════════════════════════════════════════════════════╗"
  echo "║  Docker daemon is NOT running. Please start it first:              ║"
  echo "║                                                                    ║"
  echo "║  Option A (Docker Desktop):  Open Docker Desktop app              ║"
  echo "║  Option B (systemd):         sudo systemctl start docker          ║"
  echo "╚══════════════════════════════════════════════════════════════════════╝"
  echo ""
  exit 1
fi

echo "🐳  Using DOCKER_HOST=$DOCKER_HOST"

# ── Load .env ─────────────────────────────────────────────────────────────────
if [[ ! -f .env ]]; then
  echo "📋  No .env found — copying from .env.example (edit values as needed)"
  cp .env.example .env
fi

# Export vars for docker compose
set -a
source .env
set +a

# ── Start infra containers ────────────────────────────────────────────────────
echo ""
echo "🚀  Starting infrastructure (Postgres, Redis, AI service)..."
DOCKER_HOST="$DOCKER_HOST" docker compose -f "$COMPOSE_FILE" up -d --build

# ── Wait for Postgres to be healthy ──────────────────────────────────────────
echo ""
echo "⏳  Waiting for PostgreSQL to be ready..."
for i in $(seq 1 30); do
  if DOCKER_HOST="$DOCKER_HOST" docker compose -f "$COMPOSE_FILE" exec -T postgres \
      pg_isready -U "${POSTGRES_USER:-atsuser}" -d "${POSTGRES_DB:-atsdb}" &>/dev/null; then
    echo "✅  PostgreSQL is ready."
    break
  fi
  echo "   ...still waiting ($i/30)"
  sleep 2
done

# ── Run Prisma migrations ─────────────────────────────────────────────────────
echo ""
echo "🗄️   Running Prisma migrations..."
DATABASE_URL="postgresql://${POSTGRES_USER:-atsuser}:${POSTGRES_PASSWORD:-atspassword}@localhost:${POSTGRES_PORT:-5432}/${POSTGRES_DB:-atsdb}?sslmode=disable" \
  npx prisma migrate deploy

echo ""
echo "────────────────────────────────────────────────────────────────────────"
echo "🎉  Infrastructure running. Services:"
echo "     PostgreSQL : localhost:${POSTGRES_PORT:-5432}"
echo "     Redis      : localhost:${REDIS_PORT:-6379}"
echo "     AI Service : http://localhost:${AI_SERVICE_PORT:-8000}"
echo ""
echo "👉  Now starting Next.js dev server + queue monitor..."
echo "────────────────────────────────────────────────────────────────────────"
echo ""

# ── Start Next.js + monitor ───────────────────────────────────────────────────
npm run dev:all

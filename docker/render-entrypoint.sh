#!/bin/sh
# Render.com all-in-one startup: migrate → AI service → worker → Next.js
set -eu

PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
AI_PORT="${AI_SERVICE_PORT:-8000}"
AI_HOST="${AI_SERVICE_BIND:-127.0.0.1}"
AI_URL="http://${AI_HOST}:${AI_PORT}"
START_WORKER="${START_WORKER:-true}"

mkdir -p uploads/resumes /var/cache/aiservice/huggingface /var/cache/aiservice/sentence-transformers

echo "[render] Running Prisma migrations..."
npx prisma migrate deploy

echo "[render] Starting AI service on ${AI_URL}..."
(
  cd /app/ai-service
  export HOST="${AI_HOST}"
  export PORT="${AI_PORT}"
  export RESUME_FILES_BASE_PATH="${RESUME_FILES_BASE_PATH:-/app/uploads/resumes}"
  export HF_HOME="${HF_HOME:-/var/cache/aiservice/huggingface}"
  export TRANSFORMERS_CACHE="${TRANSFORMERS_CACHE:-/var/cache/aiservice/huggingface}"
  export SENTENCE_TRANSFORMERS_HOME="${SENTENCE_TRANSFORMERS_HOME:-/var/cache/aiservice/sentence-transformers}"
  exec /opt/ai-venv/bin/uvicorn app.main:create_app --factory --host "${AI_HOST}" --port "${AI_PORT}"
) &
AI_PID=$!

if [ "${START_WORKER}" = "true" ] || [ "${START_WORKER}" = "1" ]; then
  if [ -n "${REDIS_URL:-}" ] || [ -n "${REDIS_HOST:-}" ]; then
    echo "[render] Starting BullMQ worker..."
    node ./node_modules/.bin/tsx workers/index.ts &
    WORKER_PID=$!
  else
    echo "[render] REDIS_URL unset — skipping worker (queues disabled)."
    WORKER_PID=""
  fi
else
  WORKER_PID=""
fi

echo "[render] Waiting for AI health..."
i=0
until curl -sf "${AI_URL}/health" >/dev/null 2>&1; do
  i=$((i + 1))
  if [ "$i" -ge 90 ]; then
    echo "[render] AI service failed to become healthy" >&2
    exit 1
  fi
  sleep 2
done
echo "[render] AI service is healthy."

export AI_SERVICE_URL="${AI_SERVICE_URL:-${AI_URL}}"

shutdown() {
  echo "[render] Shutting down..."
  [ -n "${WORKER_PID:-}" ] && kill "$WORKER_PID" 2>/dev/null || true
  kill "$AI_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap shutdown INT TERM

echo "[render] Starting Next.js on ${HOSTNAME}:${PORT}..."
export PORT HOSTNAME NODE_ENV=production
exec node server.js

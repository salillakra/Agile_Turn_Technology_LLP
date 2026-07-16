#!/bin/sh
# All-in-one startup (Render / Azure): migrate → Redis → AI → worker → Next.js
set -eu

PORT="${PORT:-3000}"
HOSTNAME="${HOSTNAME:-0.0.0.0}"
AI_PORT="${AI_SERVICE_PORT:-8000}"
AI_HOST="${AI_SERVICE_BIND:-127.0.0.1}"
AI_URL="http://${AI_HOST}:${AI_PORT}"
START_WORKER="${START_WORKER:-true}"
# When no external REDIS_URL, start redis-server in-process (Azure / single-container).
EMBEDDED_REDIS="${EMBEDDED_REDIS:-auto}"

mkdir -p uploads/resumes /var/cache/aiservice/huggingface /var/cache/aiservice/sentence-transformers /var/lib/redis

echo "[render] Running Prisma migrations..."
npx prisma migrate deploy

REDIS_PID=""
if [ -z "${REDIS_URL:-}" ] && [ -z "${REDIS_HOST:-}" ]; then
  if [ "$EMBEDDED_REDIS" = "auto" ] || [ "$EMBEDDED_REDIS" = "true" ] || [ "$EMBEDDED_REDIS" = "1" ]; then
    echo "[render] Starting embedded Redis on 127.0.0.1:6379..."
    redis-server --daemonize no --bind 127.0.0.1 --port 6379 --dir /var/lib/redis --save "" --appendonly no &
    REDIS_PID=$!
    export REDIS_URL="redis://127.0.0.1:6379"
    i=0
    until redis-cli -h 127.0.0.1 -p 6379 ping 2>/dev/null | grep -q PONG; do
      i=$((i + 1))
      if [ "$i" -ge 30 ]; then
        echo "[render] Embedded Redis failed to start" >&2
        exit 1
      fi
      sleep 1
    done
    echo "[render] Embedded Redis is ready."
  fi
fi

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
  [ -n "${REDIS_PID:-}" ] && kill "$REDIS_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap shutdown INT TERM

echo "[render] Starting Next.js on ${HOSTNAME}:${PORT}..."
export PORT HOSTNAME NODE_ENV=production
exec node server.js

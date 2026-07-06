#!/bin/sh
set -e

HF_CACHE="${HF_HOME:-/var/cache/aiservice/huggingface}"

mkdir -p "$HF_CACHE" "${SENTENCE_TRANSFORMERS_HOME:-/var/cache/aiservice/sentence-transformers}" /home/aiservice

# Seed from root build cache when the image baked models under /root/.cache
if [ -d /root/.cache/huggingface ] && [ -z "$(ls -A "$HF_CACHE" 2>/dev/null)" ]; then
  cp -a /root/.cache/huggingface/. "$HF_CACHE/" 2>/dev/null || true
fi

chown -R aiservice:aiservice /var/cache/aiservice /home/aiservice 2>/dev/null || \
  chown -R 1001:999 /var/cache/aiservice /home/aiservice

if [ "$#" -eq 0 ]; then
  set -- uvicorn app.main:create_app --factory --host 0.0.0.0 --port 8000
fi

if [ "$(id -u)" = "0" ]; then
  exec setpriv --reuid=1001 --regid=999 --init-groups -- "$@"
fi

exec "$@"

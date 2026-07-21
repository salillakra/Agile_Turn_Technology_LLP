# ─────────────────────────────────────────────────────────────────────────────
# Stage 1: deps — install node_modules (cached separately from source)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma/schema.prisma ./prisma/schema.prisma

# Coolify (and others) may inject NODE_ENV=production as a build-arg; that
# would omit @tailwindcss/postcss from npm ci and break `next build`.
# Retry once on flaky registry resets (ECONNRESET) common in CI/Coolify builds.
RUN npm ci --prefer-offline --include=dev || npm ci --include=dev

# ─────────────────────────────────────────────────────────────────────────────
# Stage 1b: migrate — deps + migrations + prisma.config (Prisma 7)
# deps alone only has schema.prisma; migrate deploy needs migrations + config.
# ─────────────────────────────────────────────────────────────────────────────
FROM deps AS migrate
COPY prisma ./prisma
COPY prisma.config.ts ./
# DATABASE_URL is supplied at runtime by docker-compose / Coolify

# ─────────────────────────────────────────────────────────────────────────────
# Stage 2: builder — compile Next.js production build
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS builder
RUN apk add --no-cache libc6-compat openssl curl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

# prisma.config.ts requires DATABASE_URL even for `generate` (not used at build time)
ENV DATABASE_URL="postgresql://build:build@127.0.0.1:5432/build?sslmode=disable"
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

# Prisma client must be generated before next build
RUN npx prisma generate

RUN node --max-old-space-size=4096 ./node_modules/next/dist/bin/next build

# ─────────────────────────────────────────────────────────────────────────────
# Stage 3: runner — minimal production image
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-alpine AS runner
RUN apk add --no-cache libc6-compat openssl curl su-exec
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser  --system --uid 1001 nextjs

# Copy only what's needed
COPY --from=builder /app/public        ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static  ./.next/static
COPY --from=builder /app/node_modules  ./node_modules
COPY --from=builder /app/prisma        ./prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY --from=builder /app/generated     ./generated
COPY --from=builder /app/src           ./src
COPY --from=builder /app/workers       ./workers
COPY --from=builder /app/monitor       ./monitor
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY --from=builder /app/package.json  ./package.json

COPY docker/app-entrypoint.sh /usr/local/bin/app-entrypoint.sh
RUN chmod +x /usr/local/bin/app-entrypoint.sh && \
    mkdir -p uploads/resumes && chown -R nextjs:nodejs uploads

EXPOSE 3000
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

ENTRYPOINT ["/usr/local/bin/app-entrypoint.sh"]
CMD ["node", "server.js"]

# ─────────────────────────────────────────────────────────────────────────────
# Stage 4: render — all-in-one for Render.com (Next.js + worker + AI service)
# Build:  docker build --target render -t ats-render .
# Render:  set dockerTarget: render in render.yaml (or build arg)
# ─────────────────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS render

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    ca-certificates \
    openssl \
    python3 \
    python3-pip \
    python3-venv \
    build-essential \
    libgomp1 \
    redis-server \
    redis-tools \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python AI microservice (CPU-only torch; models baked at build time)
COPY ai-service/requirements.txt ai-service/requirements-resume-nlp.txt ./ai-service/
RUN python3 -m venv /opt/ai-venv && \
    /opt/ai-venv/bin/pip install --no-cache-dir --upgrade pip && \
    /opt/ai-venv/bin/pip install --no-cache-dir \
      torch --index-url https://download.pytorch.org/whl/cpu && \
    /opt/ai-venv/bin/pip install --no-cache-dir -r ai-service/requirements.txt && \
    /opt/ai-venv/bin/python -m spacy download en_core_web_sm && \
    /opt/ai-venv/bin/python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY ai-service ./ai-service

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    AI_SERVICE_PORT=8000 \
    AI_SERVICE_BIND=127.0.0.1 \
    AI_SERVICE_URL=http://127.0.0.1:8000 \
    RESUME_FILES_BASE_PATH=/app/uploads/resumes \
    HF_HOME=/var/cache/aiservice/huggingface \
    TRANSFORMERS_CACHE=/var/cache/aiservice/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/var/cache/aiservice/sentence-transformers \
    START_WORKER=true \
    PATH="/opt/ai-venv/bin:${PATH}"

# Next.js standalone + worker runtime (tsx needs full src tree)
COPY --from=builder /app/public              ./public
COPY --from=builder /app/.next/standalone    ./
COPY --from=builder /app/.next/static         ./.next/static
COPY --from=builder /app/node_modules         ./node_modules
COPY --from=builder /app/prisma               ./prisma
COPY --from=builder /app/generated            ./generated
COPY --from=builder /app/src                  ./src
COPY --from=builder /app/workers              ./workers
COPY --from=builder /app/tsconfig.json        ./tsconfig.json
COPY --from=builder /app/package.json         ./package.json

COPY docker/render-entrypoint.sh /app/docker/render-entrypoint.sh
RUN chmod +x /app/docker/render-entrypoint.sh && \
    mkdir -p uploads/resumes /var/cache/aiservice

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=10s --start-period=180s --retries=5 \
  CMD sh -c 'curl -fsS "http://127.0.0.1:${PORT:-3000}/api/health" || exit 1'

CMD ["/app/docker/render-entrypoint.sh"]

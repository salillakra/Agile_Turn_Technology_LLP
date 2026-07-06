# ─────────────────────────────────────────────────────────────────────────────
# Agile Turn — AI Microservice (FastAPI + sentence-transformers + spaCy)
# ─────────────────────────────────────────────────────────────────────────────
FROM python:3.11-slim AS base

# System dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Model caches live outside /app so dev bind-mounts (./ai-service:/app) do not hide them.
ENV HF_HOME=/var/cache/aiservice/huggingface \
    TRANSFORMERS_CACHE=/var/cache/aiservice/huggingface \
    SENTENCE_TRANSFORMERS_HOME=/var/cache/aiservice/sentence-transformers

# ─────────────────────────────────────────────────────────────────────────────
# Install Python dependencies
# ─────────────────────────────────────────────────────────────────────────────
COPY requirements.txt requirements-resume-nlp.txt ./

# Install torch CPU-only first to keep image smaller (no CUDA)
RUN pip install --no-cache-dir \
        torch --index-url https://download.pytorch.org/whl/cpu && \
    pip install --no-cache-dir -r requirements.txt

# ─────────────────────────────────────────────────────────────────────────────
# Pre-download the embedding model and spaCy model at build time
# (avoids cold-start delay when container first starts)
# ─────────────────────────────────────────────────────────────────────────────
RUN mkdir -p /var/cache/aiservice/huggingface /app/uploads/resumes && \
    python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" && \
    python -m spacy download en_core_web_sm

# ─────────────────────────────────────────────────────────────────────────────
# Copy application source
# ─────────────────────────────────────────────────────────────────────────────
COPY . .

# Non-root runtime via entrypoint (root prepares cache dirs, then drops privileges)
RUN useradd --system --uid 1001 --create-home --home-dir /home/aiservice aiservice && \
    mkdir -p /var/cache/aiservice/huggingface /app/uploads/resumes && \
    chown -R aiservice:aiservice /app /var/cache/aiservice /home/aiservice

COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

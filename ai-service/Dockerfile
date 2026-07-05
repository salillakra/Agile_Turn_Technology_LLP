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
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')" && \
    python -m spacy download en_core_web_sm

# ─────────────────────────────────────────────────────────────────────────────
# Copy application source
# ─────────────────────────────────────────────────────────────────────────────
COPY . .

# Non-root user
RUN useradd --system --uid 1001 aiservice && \
    mkdir -p /app/uploads/resumes && \
    chown -R aiservice /app

USER aiservice

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=10s --start-period=60s --retries=5 \
    CMD curl -f http://localhost:8000/health || exit 1

CMD ["uvicorn", "app.main:create_app", "--factory", "--host", "0.0.0.0", "--port", "8000"]

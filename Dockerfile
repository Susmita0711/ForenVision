# ==============================================================================
# ForenVision AI Production Multi-Stage Container Image
# Stage 1: Deterministic Frontend Compilation (Node.js 20 Alpine)
# Stage 2: Hardened Unprivileged Python 3.11 Runtime with OpenCV Dependencies
# ==============================================================================

# ------------------------------------------------------------------------------
# Stage 1: Frontend Build Stage
# ------------------------------------------------------------------------------
FROM node:20-alpine AS frontend-builder

WORKDIR /build/frontend

# Leverage layer caching with deterministic package lock
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci --prefer-offline --no-audit

# Copy source and build static bundle
COPY frontend/ ./
RUN npm run build

# ------------------------------------------------------------------------------
# Stage 2: Production Python Runtime Stage
# ------------------------------------------------------------------------------
FROM python:3.11-slim AS runtime

LABEL maintainer="ForenVision AI Engineering Team"
LABEL description="ForenVision AI Production Forensic Backend Service"

# Set non-interactive environment variables
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PYTHONPATH=/app/backend \
    FLASK_ENV=production \
    PORT=5001

# Install essential system runtime dependencies for OpenCV and healthchecks
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 \
    libglib2.0-0 \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create dedicated unprivileged forensic service account
RUN groupadd -g 10001 forenvision && \
    useradd -u 10001 -g forenvision -s /sbin/nologin -d /app forenvision

# Create directory tree for application, private evidence vault, and logs
RUN mkdir -p /app /var/forenvision/evidence_vault /var/log/forenvision && \
    chown -R forenvision:forenvision /app /var/forenvision/evidence_vault /var/log/forenvision && \
    chmod 700 /var/forenvision/evidence_vault /var/log/forenvision

WORKDIR /app

# Install pinned Python dependencies
COPY --chown=forenvision:forenvision backend/requirements.txt ./backend/
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r ./backend/requirements.txt

# Copy backend application source
COPY --chown=forenvision:forenvision backend/ ./backend/

# Copy compiled frontend assets from Stage 1
COPY --from=frontend-builder --chown=forenvision:forenvision /build/frontend/dist ./frontend/dist

# Switch to unprivileged security principal
USER forenvision

# Expose WSGI port
EXPOSE 5001

# Container Liveness / Readiness Health Check
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
    CMD curl -f http://localhost:5001/api/health || exit 1

# Production WSGI Server Entrypoint
WORKDIR /app/backend
CMD ["gunicorn", "-c", "gunicorn.conf.py", "wsgi:app"]

# syntax=docker/dockerfile:1
# Production image for the OnusFit Python AI backend (FastAPI).
# Build context: ai-backend/ (contains requirements.txt, pyproject.toml, README.md, src/).
#
# Multi-stage: pinned runtime packages and the application package are installed into an isolated
# virtualenv in the build stage; the runtime stage copies only /opt/venv so no pip cache, build
# tooling, test suite, or .env* files ship.
# For strict release reproducibility, pin the base image by digest:
#   python:3.12-slim-bookworm@sha256:<digest>

FROM python:3.12-slim-bookworm AS build
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /build
RUN python -m venv /opt/venv
# 1. Pinned runtime dependencies (cached until requirements.txt changes).
COPY requirements.txt ./
RUN --mount=type=cache,target=/root/.cache/pip \
    /opt/venv/bin/pip install --no-cache-dir -r requirements.txt
# 2. The application package itself, without re-resolving dependencies, then strip installer tools.
COPY pyproject.toml README.md ./
COPY src ./src
RUN /opt/venv/bin/pip install --no-cache-dir --no-deps . \
 && /opt/venv/bin/pip uninstall -y pip setuptools wheel >/dev/null 2>&1 || true \
 && chmod -R a+rX /opt/venv

FROM python:3.12-slim-bookworm AS runtime
LABEL org.opencontainers.image.title="onusfit-ai-backend" \
      org.opencontainers.image.description="OnusFit FastAPI AI inference service" \
      org.opencontainers.image.source="https://github.com/TuneOnus/FitOnus"
# Unprivileged user: no shell, no home directory, nothing writable in the image layers.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY --from=build /opt/venv /opt/venv
# ONUSFIT_AI_ENV=production enforces fail-closed startup validation for AI_SERVICE_JWT_SECRET and GEMINI_API_KEY.
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ONUSFIT_AI_ENV=production \
    PORT=10000
WORKDIR /app
USER 10001:10001
# Render injects PORT (default 10000); container always binds 0.0.0.0:$PORT.
EXPOSE 10000
STOPSIGNAL SIGTERM
# Checks process liveness without touching Gemini or requiring secrets.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/health/live' % os.environ.get('PORT','10000'), timeout=4).status == 200 else 1)"]
# Single worker on purpose: token replay cache and Gemini model cooldown live in process memory.
CMD ["sh", "-c", "exec uvicorn onusfit_ai.main:app --host 0.0.0.0 --port ${PORT:-10000} --timeout-keep-alive 65 --no-server-header"]

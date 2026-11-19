# syntax=docker/dockerfile:1
# Production image for the OnusFit AI backend (FastAPI). Build context = this folder (ai-backend/).
#
# Multi-stage: dependencies and the package are installed into a virtualenv in the build stage; the
# runtime stage copies only that virtualenv, so no pip cache, build tools or source tree ship.
# For reproducible production builds, pin the base image by digest (python:3.12-slim-bookworm@sha256:...).
# Python 3.12 matches pyproject.toml (requires-python >= 3.12); every dependency has a prebuilt wheel, so
# no compiler is needed.

FROM python:3.12-slim-bookworm AS build
ENV PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1
WORKDIR /build
RUN python -m venv /opt/venv
# 1. Pinned runtime dependencies (cached until requirements.txt changes).
COPY requirements.txt ./
RUN /opt/venv/bin/pip install -r requirements.txt
# 2. The application itself, without re-resolving dependencies.
COPY pyproject.toml README.md ./
COPY src ./src
RUN /opt/venv/bin/pip install --no-deps .

FROM python:3.12-slim-bookworm AS runtime
# Unprivileged user: no shell, no home directory, nothing writable by it.
RUN groupadd --system --gid 10001 app \
 && useradd --system --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin app
COPY --from=build /opt/venv /opt/venv
# ONUSFIT_AI_ENV=production makes the service refuse to start with a missing or short service secret
# or without a Gemini key (a failed deploy is better than a service that answers 503 to everything).
ENV PATH="/opt/venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    ONUSFIT_AI_ENV=production
USER 10001:10001
# Render injects PORT (default 10000); the service must listen on 0.0.0.0 on that port.
EXPOSE 10000
# Not used by Render (it has its own health check path); useful for `docker run` and orchestrators.
# Needs no secrets and never calls Gemini.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["python", "-c", "import os,sys,urllib.request; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:%s/health/live' % os.environ.get('PORT','10000'), timeout=4).status == 200 else 1)"]
# One worker on purpose: the replay cache and Gemini model cooldown are per-process memory (see
# docs/render-deployment.md). Keep-alive is above the 5 s default so pooled client connections are not
# closed underneath the Node API.
CMD ["sh", "-c", "exec uvicorn onusfit_ai.main:app --host 0.0.0.0 --port ${PORT:-10000} --timeout-keep-alive 65 --no-server-header"]

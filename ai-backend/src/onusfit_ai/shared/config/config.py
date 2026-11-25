"""Process-wide settings, read from environment variables.

Secrets (the Gemini API key, the Node-to-Python signing secret) are read from the environment only,
never from code or request bodies, and are never logged.
"""

import os
from dataclasses import dataclass

# Minimum length of the shared secret used to verify Node's service tokens (HS256).
MIN_SERVICE_SECRET_LENGTH = 32


# Upper bound for one Gemini attempt; Node's own deadlines (22-27 s) are shorter anyway.
MAX_ATTEMPT_TIMEOUT_S = 60.0


@dataclass(frozen=True)
class Settings:
    environment: str
    log_level: str
    # "json": one JSON object per line (what Render and log tools want). "text": readable locally.
    log_format: str
    # Gemini
    gemini_api_key: str | None
    gemini_attempt_timeout_s: float
    # Service-to-service authentication (Node -> Python)
    service_jwt_secret: str | None
    service_jwt_issuer: str
    service_jwt_audience: str
    # Node.js API Gateway (for internal tool calls)
    node_api_url: str = "http://127.0.0.1:3000"
    # Model Context Protocol (Phase 12)
    mcp_enabled: bool = False
    mcp_transport: str = "in_process"
    mcp_server_url: str = "http://localhost:8000/internal/v1/mcp"
    mcp_discovery_ttl_seconds: int = 300
    mcp_timeout_seconds: float = 5.0
    # Multi-Agent Systems (Phase 13)
    multi_agent_enabled: bool = False
    # Streaming AI (Phase 14)
    coach_streaming_enabled: bool = False
    stream_heartbeat_interval_s: float = 5.0


_VALID_TRUE_FLAGS: frozenset[str] = frozenset({"1", "true", "yes", "on"})
_VALID_FALSE_FLAGS: frozenset[str] = frozenset({"0", "false", "no", "off", ""})


def is_valid_feature_flag(raw: str | None) -> bool:
    """Return True if an env boolean flag value is empty or syntactically valid."""
    if raw is None:
        return True
    norm = raw.strip().lower()
    return norm in _VALID_TRUE_FLAGS or norm in _VALID_FALSE_FLAGS


def parse_feature_flag(raw: str | None, *, default: bool = False) -> bool:
    """Parse a boolean feature flag failing safely to `default` when unset or invalid."""
    if raw is None:
        return default
    norm = raw.strip().lower()
    if norm in _VALID_TRUE_FLAGS:
        return True
    if norm in _VALID_FALSE_FLAGS:
        return False
    return default


def _clean(value: str | None) -> str | None:
    value = (value or "").strip()
    return value or None


def get_settings() -> Settings:
    """Read settings from the environment on every call (cheap; keeps tests simple)."""
    return Settings(
        environment=os.environ.get("ONUSFIT_AI_ENV", "development"),
        log_level=(os.environ.get("LOG_LEVEL") or "INFO").strip().upper(),
        log_format=(os.environ.get("LOG_FORMAT") or "json").strip().lower(),
        gemini_api_key=_clean(os.environ.get("GEMINI_API_KEY")),
        gemini_attempt_timeout_s=float(os.environ.get("GEMINI_ATTEMPT_TIMEOUT_S", "20")),
        service_jwt_secret=_clean(os.environ.get("AI_SERVICE_JWT_SECRET")),
        service_jwt_issuer=os.environ.get("AI_SERVICE_JWT_ISSUER", "onusfit-node-api"),
        service_jwt_audience=os.environ.get("AI_SERVICE_JWT_AUDIENCE", "onusfit-ai-backend"),
        node_api_url=os.environ.get("NODE_API_URL", "http://127.0.0.1:3000").rstrip("/"),
        mcp_enabled=(
            os.environ.get("MCP_ENABLED") or os.environ.get("AI_COACH_MCP_ENABLED", "false")
        )
        .strip()
        .lower()
        in ("1", "true", "yes", "on"),
        mcp_transport=os.environ.get("MCP_TRANSPORT", "in_process").strip().lower(),
        mcp_server_url=os.environ.get(
            "MCP_SERVER_URL", "http://localhost:8000/internal/v1/mcp"
        ).rstrip("/"),
        mcp_discovery_ttl_seconds=int(os.environ.get("MCP_DISCOVERY_TTL_SECONDS", "300")),
        mcp_timeout_seconds=float(os.environ.get("MCP_TIMEOUT_SECONDS", "5.0")),
        multi_agent_enabled=parse_feature_flag(
            os.environ.get("AI_COACH_MULTI_AGENT_ENABLED")
            or os.environ.get("COACH_MULTI_AGENT_ENABLED"),
            default=False,
        ),
        coach_streaming_enabled=parse_feature_flag(
            os.environ.get("AI_COACH_STREAMING_ENABLED")
            or os.environ.get("COACH_STREAMING_ENABLED"),
            default=False,
        ),
        stream_heartbeat_interval_s=float(
            os.environ.get("AI_STREAM_HEARTBEAT_INTERVAL_S", "5.0")
        ),
    )


def is_production(settings: Settings) -> bool:
    return settings.environment.strip().lower() == "production"


def configuration_problems() -> list[str]:
    """Everything wrong with the environment, as messages that name variables but never show values.

    Used at startup: in production any problem stops the process (so a bad deploy fails visibly
    instead of answering 503 to every request); elsewhere problems are only logged as warnings.
    """
    try:
        settings = get_settings()
    except ValueError:
        return ["GEMINI_ATTEMPT_TIMEOUT_S must be a number of seconds"]

    problems: list[str] = []
    secret = settings.service_jwt_secret
    if not secret:
        problems.append("AI_SERVICE_JWT_SECRET is not set (every request would be refused)")
    elif len(secret) < MIN_SERVICE_SECRET_LENGTH:
        problems.append(
            f"AI_SERVICE_JWT_SECRET must be at least {MIN_SERVICE_SECRET_LENGTH} characters"
        )
    if not settings.gemini_api_key:
        problems.append("GEMINI_API_KEY is not set (every AI request would fail)")
    if not 0 < settings.gemini_attempt_timeout_s <= MAX_ATTEMPT_TIMEOUT_S:
        problems.append(f"GEMINI_ATTEMPT_TIMEOUT_S must be between 0 and {MAX_ATTEMPT_TIMEOUT_S:g}")
    if not settings.service_jwt_issuer.strip():
        problems.append("AI_SERVICE_JWT_ISSUER must not be empty")
    if not settings.service_jwt_audience.strip():
        problems.append("AI_SERVICE_JWT_AUDIENCE must not be empty")
    if settings.log_level not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
        problems.append("LOG_LEVEL must be one of DEBUG, INFO, WARNING, ERROR, CRITICAL")
    if settings.log_format not in {"json", "text"}:
        problems.append("LOG_FORMAT must be json or text")
    raw_ma_flag = os.environ.get("AI_COACH_MULTI_AGENT_ENABLED") or os.environ.get(
        "COACH_MULTI_AGENT_ENABLED"
    )
    if not is_valid_feature_flag(raw_ma_flag):
        problems.append("AI_COACH_MULTI_AGENT_ENABLED must be true/false (failing closed)")
    raw_stream_flag = os.environ.get("AI_COACH_STREAMING_ENABLED") or os.environ.get(
        "COACH_STREAMING_ENABLED"
    )
    if not is_valid_feature_flag(raw_stream_flag):
        problems.append("AI_COACH_STREAMING_ENABLED must be true/false (failing closed)")
    if not 0.05 <= settings.stream_heartbeat_interval_s <= 60.0:
        problems.append("AI_STREAM_HEARTBEAT_INTERVAL_S must be between 0.05 and 60")
    return problems

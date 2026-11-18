"""Verifies the short-lived service token that Node.js sends with every internal request.

Why this exists: this service must never be callable by the mobile app or the internet. Node has
already authenticated the user; Node then signs a token saying "I (the Node API) vouch for user X
calling endpoint scope Y for the next 30 seconds". We only trust that token, never a `userId`
field in a request body.

Token claims (HS256): iss, aud, sub (user id), iat, exp, jti (unique id), scope, rid (request id).
"""

import time
from dataclasses import dataclass

import jwt
from fastapi import Depends, Header

from onusfit_ai.core.config import MIN_SERVICE_SECRET_LENGTH, Settings, get_settings
from onusfit_ai.core.errors import AiError

_CLOCK_SKEW_SECONDS = 5
_MAX_TOKEN_LIFETIME_SECONDS = 60


@dataclass(frozen=True)
class ServiceClaims:
    user_id: str  # the verified `sub`; use for logging/correlation only
    request_id: str
    jti: str


class ReplayCache:
    """Remembers token ids until they expire, so one captured token cannot be reused."""

    def __init__(self) -> None:
        self._seen: dict[str, float] = {}

    def check_and_store(self, jti: str, expires_at: float, now: float | None = None) -> bool:
        """Return True if `jti` is new (and remember it); False if it was already used."""
        now = time.time() if now is None else now
        self._seen = {k: exp for k, exp in self._seen.items() if exp > now}
        if jti in self._seen:
            return False
        self._seen[jti] = expires_at
        return True

    def clear(self) -> None:
        self._seen.clear()


replay_cache = ReplayCache()


def _unauthorized() -> AiError:
    # One deliberately vague message: never tell a caller *why* a token was rejected.
    return AiError(status_code=401, code="AUTH_INVALID_TOKEN", message="Invalid service token.")


def verify_service_token(
    settings: Settings, authorization: str | None, scope: str
) -> ServiceClaims:
    secret = settings.service_jwt_secret
    if not secret or len(secret) < MIN_SERVICE_SECRET_LENGTH:
        # Fail closed: a service without a proper secret accepts nothing.
        raise AiError(
            status_code=503,
            code="AUTH_NOT_CONFIGURED",
            message="Service authentication is not configured.",
        )
    if not authorization or not authorization.startswith("Bearer "):
        raise _unauthorized()
    token = authorization.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(
            token,
            secret,
            algorithms=["HS256"],  # never accept "none" or other algorithms
            audience=settings.service_jwt_audience,
            issuer=settings.service_jwt_issuer,
            leeway=_CLOCK_SKEW_SECONDS,
            options={"require": ["exp", "iat", "sub", "jti", "iss", "aud"]},
        )
    except jwt.PyJWTError:
        raise _unauthorized() from None

    now = time.time()
    exp = float(payload["exp"])
    if exp - float(payload["iat"]) > _MAX_TOKEN_LIFETIME_SECONDS:
        raise _unauthorized()  # tokens must be short-lived
    if payload.get("scope") != scope:
        raise _unauthorized()  # a token for one endpoint is not valid for another
    if not replay_cache.check_and_store(str(payload["jti"]), exp, now):
        raise _unauthorized()
    return ServiceClaims(
        user_id=str(payload["sub"]),
        request_id=str(payload.get("rid") or ""),
        jti=str(payload["jti"]),
    )


def require_scope(scope: str):  # type: ignore[no-untyped-def]
    """FastAPI dependency factory: `Depends(require_scope("ai:coach:chat"))`."""

    def dependency(
        authorization: str | None = Header(default=None),
        settings: Settings = Depends(get_settings),
    ) -> ServiceClaims:
        return verify_service_token(settings, authorization, scope)

    return dependency

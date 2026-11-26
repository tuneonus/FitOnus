"""Internal Tools HTTP client and dispatcher for communicating with Node.js API Gateway.

Dispatches validated tool requests with machine-to-machine JWT authentication,
applies tool argument validation, and sanitizes all errors returned to the LLM.
"""

import asyncio
import logging
import time
from collections.abc import Callable
from typing import Any

import httpx
from fastapi import Depends

from onusfit_ai.shared.auth.auth import mint_internal_tool_token
from onusfit_ai.shared.config.config import Settings, get_settings
from onusfit_ai.shared.contracts.tools import TOOL_ARG_SCHEMAS, TOOL_ENDPOINT_PATHS
from onusfit_ai.shared.llm.ports import sanitize_tool_error
from onusfit_ai.shared.logging import build_propagation_headers, start_async_span

logger = logging.getLogger("onusfit_ai.tools_client")

_DEFAULT_LIMITS = httpx.Limits(
    max_connections=50,
    max_keepalive_connections=20,
    keepalive_expiry=30.0,
)
_shared_http_client: httpx.AsyncClient | None = None
_shared_client_lock: asyncio.Lock | None = None


def _get_client_lock() -> asyncio.Lock:
    global _shared_client_lock
    if _shared_client_lock is None:
        _shared_client_lock = asyncio.Lock()
    return _shared_client_lock


async def get_shared_http_client() -> httpx.AsyncClient:
    """Return a process-wide pooled httpx.AsyncClient for internal tool calls."""
    global _shared_http_client
    if _shared_http_client is not None and not _shared_http_client.is_closed:
        return _shared_http_client
    async with _get_client_lock():
        if _shared_http_client is None or _shared_http_client.is_closed:
            _shared_http_client = httpx.AsyncClient(limits=_DEFAULT_LIMITS)
        return _shared_http_client


async def close_shared_http_client() -> None:
    """Close the process-wide pooled httpx.AsyncClient cleanly on shutdown."""
    global _shared_http_client
    client = _shared_http_client
    _shared_http_client = None
    if client is not None and not client.is_closed:
        await client.aclose()


class InternalToolsClient:
    """Dispatches tool calls to the Node.js API Gateway using signed service JWTs."""

    def __init__(
        self,
        node_api_url: str,
        service_secret: str,
        *,
        timeout_s: float = 5.0,
        http_client: httpx.AsyncClient | None = None,
        clock: Callable[[], float] = time.time,
    ) -> None:
        self._node_api_url = node_api_url.rstrip("/")
        self._service_secret = service_secret
        self._timeout_s = timeout_s
        self._client = http_client
        self._clock = clock

    async def execute_tool(
        self,
        name: str,
        args: dict[str, Any],
        user_id: str,
        request_id: str,
    ) -> dict[str, Any]:
        """Validate tool arguments, sign service JWT, invoke Node endpoint, and return result."""
        schema = TOOL_ARG_SCHEMAS.get(name)
        endpoint_path = TOOL_ENDPOINT_PATHS.get(name)

        if not schema or not endpoint_path:
            return {"error": f"Unknown tool: '{name}'"}

        # 1. Validate arguments with Pydantic schema before dispatching
        try:
            validated_args = schema.model_validate(args)
            payload = validated_args.model_dump(exclude_none=True)
        except Exception as exc:
            logger.warning(
                "Tool argument validation failed for %s: %s",
                name,
                exc,
                extra={"tool": name, "requestId": request_id},
            )
            return sanitize_tool_error(name, f"Invalid arguments for tool '{name}': {exc}")

        # 2. Mint short-lived service JWT (user ID bound cryptographically in `sub`)
        token = mint_internal_tool_token(
            secret=self._service_secret,
            user_id=user_id,
            request_id=request_id,
            clock=self._clock,
        )

        url = f"{self._node_api_url}{endpoint_path}"
        headers = {
            "X-Correlation-Id": request_id,
            **build_propagation_headers(ai_request_id=request_id),
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }

        # 3. Execute HTTP call to Node Gateway
        try:
            async with start_async_span(
                f"tools.http.{name}",
                attributes={"tool": name, "endpoint": endpoint_path},
            ) as span:
                client = (
                    self._client if self._client is not None else await get_shared_http_client()
                )
                response = await client.post(
                    url,
                    json=payload,
                    headers=headers,
                    timeout=self._timeout_s,
                )
                span.set_attribute("httpStatus", response.status_code)
                if response.status_code != 200:
                    span.mark_error(f"http_{response.status_code}")

            if response.status_code == 200:
                body = response.json()
                return body.get("data", body)  # type: ignore[no-any-return]

            logger.warning(
                "Internal tool call %s returned HTTP %s",
                name,
                response.status_code,
                extra={"tool": name, "status": response.status_code, "requestId": request_id},
            )
            return sanitize_tool_error(
                name, f"Tool '{name}' failed with status {response.status_code}"
            )

        except httpx.TimeoutException:
            logger.warning(
                "Internal tool call %s timed out after %ss",
                name,
                self._timeout_s,
                extra={"tool": name, "requestId": request_id},
            )
            return sanitize_tool_error(name, f"Tool '{name}' timed out")
        except Exception as exc:
            logger.error(
                "Internal tool call %s encountered network error: %s",
                name,
                exc,
                extra={"tool": name, "requestId": request_id},
            )
            return sanitize_tool_error(name, f"Tool '{name}' network failure")


def get_tools_client(settings: Settings = Depends(get_settings)) -> InternalToolsClient:
    """FastAPI dependency for InternalToolsClient."""
    return InternalToolsClient(
        node_api_url=settings.node_api_url,
        service_secret=settings.service_jwt_secret or "",
    )

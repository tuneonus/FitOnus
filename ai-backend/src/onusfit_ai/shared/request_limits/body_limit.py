"""Refuse an oversized request body with a 413 before FastAPI parses it.

Why: FastAPI reads and JSON-parses the whole body BEFORE it checks the service token, so without a
cap anyone who can reach the service could make it buffer an arbitrarily large body. The Pydantic
limits (15 MiB of audio base64, 10 MiB of image base64) only apply after that parse.

Pure ASGI, like the observability middleware: it looks at the `Content-Length` header and counts
bytes as they stream in, and never reads what is inside the body.
"""

from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from onusfit_ai.shared.errors.errors import AiError
from onusfit_ai.shared.observability.observability import log_ai_failure
from onusfit_ai.shared.utils.audio import MAX_AUDIO_BASE64_CHARS

# The biggest legitimate request is a voice clip: up to MAX_AUDIO_BASE64_CHARS of base64 (ASCII, so
# one byte per character) plus a few KB of JSON around it. Everything else is far smaller.
MAX_REQUEST_BODY_BYTES = MAX_AUDIO_BASE64_CHARS + 512 * 1024


class RequestBodyLimitMiddleware:
    def __init__(self, app: ASGIApp, *, max_bytes: int = MAX_REQUEST_BODY_BYTES) -> None:
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        declared = Headers(scope=scope).get("content-length")
        if declared is not None and declared.isdigit() and int(declared) > self.max_bytes:
            await self._refuse(scope, receive, send)  # cheapest case: nothing is read at all
            return

        received = 0
        refused = False

        async def limited_receive() -> Message:
            nonlocal received, refused
            message = await receive()
            if message["type"] == "http.request" and not refused:
                received += len(message.get("body", b""))
                if received > self.max_bytes:
                    # No Content-Length (chunked upload) or a lying one. FastAPI turns any exception
                    # raised while it reads the body into a generic 400, so answer 413 right here
                    # and tell the app the client is gone; whatever it sends afterwards is dropped.
                    refused = True
                    await self._refuse(scope, receive, send)
                    return {"type": "http.disconnect"}
            return message

        async def guarded_send(message: Message) -> None:
            if not refused:
                await send(message)

        try:
            await self.app(scope, limited_receive, guarded_send)
        except Exception:
            if not refused:
                raise
            # The client already got its 413. Whatever the app raised after being told "the client
            # is gone" (Starlette's ClientDisconnect) is a consequence of that, not a new problem.

    async def _refuse(self, scope: Scope, receive: Receive, send: Send) -> None:
        error = AiError(
            status_code=413,
            code="PAYLOAD_TOO_LARGE",
            message="Request body is too large.",
            dispatched=False,  # nothing was sent to Gemini
        )
        log_ai_failure(code=error.code, status=error.status_code, dispatched=False)
        await JSONResponse(status_code=error.status_code, content=error.to_body())(
            scope, receive, send
        )

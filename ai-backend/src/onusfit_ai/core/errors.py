"""One error type and one JSON error shape for every internal endpoint.

Wire format (also documented in docs/ai/PYTHON_MIGRATION_READINESS.md section 8):

    {"error": {"code": "PROVIDER_RATE_LIMITED", "message": "...",
               "retryAfterSeconds": 25, "dispatched": true}}

`dispatched` tells Node whether Gemini may already have been called. Node uses it to decide
whether it is safe to fall back to its own Gemini implementation without risking a double bill.
"""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from onusfit_ai.core.observability import log_ai_failure

_MAX_LOGGED_FIELDS = 5
_MAX_FIELD_NAME_LENGTH = 60


class AiError(Exception):
    def __init__(
        self,
        *,
        status_code: int,
        code: str,
        message: str,
        retry_after_seconds: int | None = None,
        dispatched: bool = False,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.retry_after_seconds = retry_after_seconds
        self.dispatched = dispatched

    def to_body(self) -> dict[str, object]:
        error: dict[str, object] = {
            "code": self.code,
            "message": self.message,
            "dispatched": self.dispatched,
        }
        if self.retry_after_seconds is not None:
            error["retryAfterSeconds"] = self.retry_after_seconds
        return {"error": error}


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(AiError)
    async def handle_ai_error(_request: Request, exc: AiError) -> JSONResponse:
        log_ai_failure(
            code=exc.code,
            status=exc.status_code,
            dispatched=exc.dispatched,
            retry_after_seconds=exc.retry_after_seconds,
        )
        return JSONResponse(status_code=exc.status_code, content=exc.to_body())

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        # Report WHERE and WHY validation failed, never the offending value: the value may be a
        # user's chat message or health data and must not be echoed or logged.
        fields = [
            {"field": ".".join(str(part) for part in err["loc"][1:]), "problem": err["type"]}
            for err in exc.errors()
        ]
        body = AiError(
            status_code=422, code="INVALID_REQUEST", message="Request validation failed."
        ).to_body()
        body["error"]["fields"] = fields  # type: ignore[index]
        log_ai_failure(
            code="INVALID_REQUEST",
            status=422,
            dispatched=False,
            # Field NAMES only (never values); few and short so a hostile body cannot flood the log.
            invalid_fields=[
                str(f["field"])[:_MAX_FIELD_NAME_LENGTH] for f in fields[:_MAX_LOGGED_FIELDS]
            ],
        )
        return JSONResponse(status_code=422, content=body)

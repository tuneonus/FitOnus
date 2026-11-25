"""Security guardrails, input validation, injection protection, and output sanitization for MCP.

Follows Hexagonal / Clean Architecture: Zero SDK/crypto/framework dependencies.
Pure validation and sanitization domain logic.
"""

import logging
import re
from typing import Any

from onusfit_ai.features.mcp.domain.contracts import McpConfig
from onusfit_ai.features.mcp.domain.errors import (
    McpPromptInjectionError,
    McpSchemaValidationError,
    McpSecurityError,
)
from onusfit_ai.shared.contracts.tools import TOOL_ARG_SCHEMAS

logger = logging.getLogger("onusfit_ai.mcp.security")

# Injection header directives that attempt to hijack instruction hierarchy
INJECTION_HEADER_PATTERNS = [
    re.compile(r"(?i)\b(?:system\s*instructions?|critical\s*rules?|ignore\s*(?:all\s+|any\s+)?previous\s*instructions?)\s*:?"),
    re.compile(r"(?i)\b(?:new\s*system\s*directive|override\s*rules|system\s*prompt|developer\s*(?:instruction|prompt|message))\s*:"),
    re.compile(r"(?i)\b(?:assistant\s*:|human\s*:|user\s*:)\s*"),
]

# Delimiter breakout tokens that could escape context enclosures
DELIMITER_BREAKOUT_TOKENS = [
    "</grounding_observations>",
    "<grounding_observations>",
    "</retrieved_knowledge>",
    "<retrieved_knowledge>",
    "</system>",
    "<system>",
    "</developer>",
    "<developer>",
    "</context_manifest>",
    "<context_manifest>",
    "</conversation>",
    "<conversation>",
    "<|im_start|>",
    "<|im_end|>",
    "[INST]",
    "[/INST]",
    "<<SYS>>",
    "<</SYS>>",
    "```system",
]

# Sensitive credentials and tokens to scrub from responses
SENSITIVE_PATTERNS = [
    re.compile(r"Bearer\s+[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*"),
    re.compile(r"\beyJ[A-Za-z0-9\-_=]+\.[A-Za-z0-9\-_=]+\.?[A-Za-z0-9\-_=]*"),
]


class McpSecurityGuardrails:
    """Enforces strict boundaries, input validation, user isolation, and injection defense."""

    def __init__(self, config: McpConfig | None = None) -> None:
        self.config = config or McpConfig()

    def validate_tool_allowed(self, tool_name: str) -> None:
        """Ensure tool is on the trusted allowlist."""
        if tool_name not in self.config.allowed_tools:
            logger.warning("Disallowed tool invocation attempt: '%s'", tool_name)
            raise McpSecurityError(f"Tool '{tool_name}' is not in the trusted MCP tool allowlist")

    def validate_request_size(self, payload_bytes: int) -> None:
        """Ensure payload size does not exceed configured ceiling."""
        if payload_bytes > self.config.max_request_size_bytes:
            raise McpSecurityError(
                f"Request payload size {payload_bytes} exceeds maximum of {self.config.max_request_size_bytes} bytes"
            )

    def validate_user_isolation(self, target_user_id: str, authenticated_user_id: str) -> None:
        """Prevent confused deputy: target user ID must match authenticated context."""
        if target_user_id.strip() != authenticated_user_id.strip():
            logger.warning(
                "Cross-user data leakage attempt: target=%s, auth=%s",
                target_user_id,
                authenticated_user_id,
            )
            raise McpSecurityError(
                f"User isolation violation: target user '{target_user_id}' does not match authenticated user '{authenticated_user_id}'"
            )

    def validate_tool_arguments(self, tool_name: str, args: dict[str, Any]) -> dict[str, Any]:
        """Validate input arguments against Pydantic schema and block cross-user overrides."""
        for forbidden_key in (
            "user_id",
            "userId",
            "target_user_id",
            "targetUserId",
            "account_id",
            "accountId",
            "member_id",
            "memberId",
        ):
            if forbidden_key in args:
                raise McpSecurityError(
                    f"Cross-user override argument '{forbidden_key}' is forbidden."
                )
        schema = TOOL_ARG_SCHEMAS.get(tool_name)
        if not schema:
            return args

        try:
            validated = schema.model_validate(args)
            return validated.model_dump(exclude_none=True)
        except Exception as exc:
            raise McpSchemaValidationError(tool_name, str(exc)) from exc

    def sanitize_tool_output(self, tool_name: str, raw_output: str) -> str:
        """Sanitize tool result to neutralize prompt injection attacks and delimiter breakouts."""
        from onusfit_ai.shared.utils.guardrails import (
            redact_runtime_secrets,
            strip_invisible_and_control,
        )

        sanitized = redact_runtime_secrets(strip_invisible_and_control(raw_output))
        if not self.config.enforce_prompt_injection_sanitization:
            return sanitized

        # 1. Neutralize boundary delimiter breakouts (case-insensitive)
        for token in DELIMITER_BREAKOUT_TOKENS:
            if token.lower() in sanitized.lower():
                logger.warning(
                    "Detected delimiter breakout attempt '%s' in tool '%s' output",
                    token,
                    tool_name,
                )
                safe_replacement = token.replace("<", "[").replace(">", "]").replace("`", "'")
                sanitized = re.sub(re.escape(token), safe_replacement, sanitized, flags=re.IGNORECASE)

        # 2. Neutralize injection directive headers
        for pattern in INJECTION_HEADER_PATTERNS:
            if pattern.search(sanitized):
                logger.warning(
                    "Detected potential prompt injection header in tool '%s' output",
                    tool_name,
                )
                sanitized = pattern.sub("[FILTERED_INSTRUCTION_HEADER]: ", sanitized)

        # 3. Scrub sensitive tokens / JWTs
        for pattern in SENSITIVE_PATTERNS:
            if pattern.search(sanitized):
                sanitized = pattern.sub("[REDACTED_AUTH_TOKEN]", sanitized)

        return sanitized

    def check_for_active_injection(self, text: str) -> None:
        """Check if raw text contains direct adversarial injection patterns."""
        for pattern in INJECTION_HEADER_PATTERNS:
            match = pattern.search(text)
            if match:
                raise McpPromptInjectionError(match.group(0))


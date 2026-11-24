"""Domain exceptions for Model Context Protocol (MCP) subsystem.

Pure domain definitions: No external framework or transport dependencies.
"""


class McpError(Exception):
    """Base exception for all MCP-related errors."""

    def __init__(self, message: str, code: str = "MCP_ERROR") -> None:
        super().__init__(message)
        self.message = message
        self.code = code


class McpConnectionError(McpError):
    """Raised when establishing or maintaining transport connection fails."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="MCP_CONNECTION_ERROR")


class McpCapabilityNegotiationError(McpError):
    """Raised when client/server capability negotiation fails or incompatible."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="MCP_CAPABILITY_ERROR")


class McpDiscoveryError(McpError):
    """Raised when tool, resource, or prompt discovery fails."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="MCP_DISCOVERY_ERROR")


class McpToolExecutionError(McpError):
    """Raised when tool execution fails in the server or underlying provider."""

    def __init__(self, tool_name: str, message: str) -> None:
        super().__init__(f"Tool '{tool_name}' failed: {message}", code="MCP_TOOL_EXECUTION_ERROR")
        self.tool_name = tool_name


class McpSchemaValidationError(McpError):
    """Raised when tool arguments or output fail schema validation."""

    def __init__(self, tool_name: str, message: str) -> None:
        super().__init__(
            f"Schema validation failed for tool '{tool_name}': {message}",
            code="MCP_SCHEMA_VALIDATION_ERROR",
        )
        self.tool_name = tool_name


class McpTimeoutError(McpError):
    """Raised when an MCP operation exceeds its configured deadline."""

    def __init__(self, operation: str, timeout_seconds: float) -> None:
        super().__init__(
            f"Operation '{operation}' timed out after {timeout_seconds}s",
            code="MCP_TIMEOUT_ERROR",
        )
        self.operation = operation
        self.timeout_seconds = timeout_seconds


class McpSecurityError(McpError):
    """Raised when authorization, user isolation, or untrusted access check fails."""

    def __init__(self, message: str) -> None:
        super().__init__(message, code="MCP_SECURITY_ERROR")


class McpPromptInjectionError(McpSecurityError):
    """Raised when tool output contains malicious prompt injection patterns."""

    def __init__(self, pattern: str) -> None:
        super().__init__(f"Detected potential prompt injection in tool output: {pattern}")
        self.code = "MCP_PROMPT_INJECTION_DETECTED"


class McpBudgetExceededError(McpError):
    """Raised when cumulative tool call or token budgets are exhausted."""

    def __init__(self, budget_type: str, limit: int, current: int) -> None:
        super().__init__(
            f"MCP budget '{budget_type}' exceeded: {current} >= limit of {limit}",
            code="MCP_BUDGET_EXCEEDED",
        )
        self.budget_type = budget_type
        self.limit = limit
        self.current = current


class McpApprovalRequiredError(McpError):
    """Raised when a tool operation requires human-in-the-loop approval before executing."""

    def __init__(self, tool_name: str, approval_id: str, summary: str) -> None:
        super().__init__(
            f"Tool '{tool_name}' requires human approval (id: {approval_id}): {summary}",
            code="MCP_APPROVAL_REQUIRED",
        )
        self.tool_name = tool_name
        self.approval_id = approval_id
        self.summary = summary

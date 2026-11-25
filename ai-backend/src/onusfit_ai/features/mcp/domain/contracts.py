"""Domain contracts and state models for Model Context Protocol (MCP) subsystem.

Follows Hexagonal / Clean Architecture: Zero MCP protocol or framework SDK imports.
Only standard library and Pydantic models.
"""

from collections.abc import Callable
from enum import StrEnum
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

McpTransportType = Literal["in_process", "stdio", "streamable_http"]

DEFAULT_ALLOWED_TOOLS: list[str] = [
    "get_recent_workouts",
    "get_nutrition_summary",
    "get_weight_trend",
    "search_exercises",
    "get_exercise_details",
    "get_fitness_profile",
    "retrieve_fitness_knowledge",
    "preview_workout_plan",
    "preview_workout_adaptation",
    "validate_workout_plan",
    "persist_workout_plan",
    "preview_nutrition_plan",
]


class AgentApprovalStatus(StrEnum):
    """Lifecycle status for human-in-the-loop approval tickets."""
    PENDING = "pending"
    APPROVED = "approved"
    CONSUMED = "consumed"
    REJECTED = "rejected"
    EXPIRED = "expired"


class ApprovalTicket(BaseModel):
    """Human-in-the-loop approval ticket for destructive or write operations."""

    model_config = ConfigDict(extra="forbid")

    approval_id: str = Field(description="Unique UUID for this approval request")
    tool_name: str = Field(description="Name of the tool awaiting human confirmation")
    arguments: dict[str, Any] = Field(description="Parameters proposed for execution")
    user_id: str = Field(description="Target authenticated user ID")
    request_id: str = Field(description="Correlation request ID")
    summary: str = Field(description="Human-readable explanation of proposed action and impact")
    created_at: float = Field(description="Monotonic or epoch creation timestamp")
    expires_at: float = Field(description="Expiration timestamp after which ticket is invalid")
    status: AgentApprovalStatus = Field(default=AgentApprovalStatus.PENDING)
    payload_hash: str = Field(
        default="",
        description="Canonical SHA-256 hash binding this ticket to user_id, tool_name, and arguments",
    )


class IdempotencyRecord(BaseModel):
    """Tracks executed write operations to prevent duplicate mutations."""

    model_config = ConfigDict(extra="forbid")

    key: str = Field(description="Unique idempotency key from caller")
    tool_name: str
    result: dict[str, Any]
    created_at: float
    user_id: str = Field(default="", description="Owner user ID scoping this idempotency record")
    payload_hash: str = Field(default="", description="Canonical SHA-256 hash of bound arguments")
    expires_at: float | None = Field(default=None, description="Optional expiration epoch timestamp")


class McpToolDefinition(BaseModel):
    """Declarative definition of an MCP tool."""

    model_config = ConfigDict(extra="forbid")

    name: str = Field(description="Unique tool identifier")
    description: str = Field(description="Natural language summary of tool behavior and bounds")
    input_schema: dict[str, Any] = Field(description="JSON schema for input argument validation")
    is_write: bool = Field(default=False, description="Whether this tool mutates persistent state")
    is_preview_only: bool = Field(
        default=False,
        description="Whether this tool produces non-persisted preview artifacts",
    )
    requires_auth: bool = Field(
        default=True,
        description="Whether invocation strictly requires authenticated user context",
    )


class McpToolCall(BaseModel):
    """Invocation request for an MCP tool."""

    model_config = ConfigDict(extra="forbid")

    tool_name: str
    arguments: dict[str, Any] = Field(default_factory=dict)
    user_id: str
    request_id: str
    timeout_seconds: float = Field(default=5.0, ge=0.5, le=30.0)


class McpToolResult(BaseModel):
    """Standardized response from an MCP tool invocation."""

    model_config = ConfigDict(extra="forbid")

    tool_name: str
    content: str = Field(description="Textual representation of tool result for LLM consumption")
    structured_data: dict[str, Any] = Field(
        default_factory=dict,
        description="Raw structured payload for downstream application parsing",
    )
    is_error: bool = Field(default=False)
    error_message: str | None = None
    execution_time_ms: float = Field(default=0.0)
    requires_approval: bool = Field(default=False)
    approval_ticket: ApprovalTicket | None = None


class McpResourceDefinition(BaseModel):
    """Metadata for an exposed MCP Resource."""

    model_config = ConfigDict(extra="forbid")

    uri: str = Field(description="RFC 3986 URI for the resource (e.g. fitonus://catalog/exercises)")
    name: str = Field(description="Human-readable title")
    description: str = Field(description="Summary of resource contents")
    mime_type: str = Field(default="application/json")


class McpResourceContent(BaseModel):
    """Payload retrieved from reading an MCP Resource."""

    model_config = ConfigDict(extra="forbid")

    uri: str
    mime_type: str
    text: str


class McpPromptArgument(BaseModel):
    """Argument specification for an MCP Prompt template."""

    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    required: bool = False


class McpPromptDefinition(BaseModel):
    """Definition of an MCP Prompt template."""

    model_config = ConfigDict(extra="forbid")

    name: str
    description: str
    arguments: list[McpPromptArgument] = Field(default_factory=list)


class McpPromptMessage(BaseModel):
    """Prompt template message block."""

    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant", "system"]
    content: str


class McpPromptResult(BaseModel):
    """Rendered prompt messages."""

    model_config = ConfigDict(extra="forbid")

    name: str
    messages: list[McpPromptMessage]


class McpCapabilitySummary(BaseModel):
    """Capabilities negotiated between client and server."""

    model_config = ConfigDict(extra="forbid")

    supports_tools: bool = True
    supports_resources: bool = True
    supports_prompts: bool = True
    supports_logging: bool = True
    protocol_version: str = "2024-11-05"


class McpConfig(BaseModel):
    """Subsystem configuration and safety bounds for MCP integration."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = Field(default=True, description="Master feature flag for MCP integration")
    transport: McpTransportType = Field(default="in_process")
    server_name: str = Field(default="fitonus-mcp-server")
    server_version: str = Field(default="1.0.0")
    server_url: str = Field(
        default="http://localhost:8000/internal/v1/mcp",
        description="Internal streamable HTTP URL for remote transport",
    )
    discovery_ttl_seconds: int = Field(
        default=300,
        ge=10,
        le=3600,
        description="Time-to-live for cached tool discovery results",
    )
    per_tool_timeout_seconds: float = Field(
        default=5.0,
        ge=0.5,
        le=30.0,
        description="Timeout per individual tool call",
    )
    max_request_size_bytes: int = Field(
        default=1_048_576,  # 1MB
        description="Maximum allowed request payload size in bytes",
    )
    allowed_tools: list[str] = Field(
        default_factory=lambda: list(DEFAULT_ALLOWED_TOOLS),
        description="Explicit allowlist of trusted tools callable via MCP",
    )
    max_cumulative_tool_calls: int = Field(
        default=5,
        ge=1,
        le=15,
        description="Hard ceiling for tool calls per agent turn",
    )
    enforce_prompt_injection_sanitization: bool = Field(
        default=True,
        description="Whether to sanitize injection delimiters in tool outputs",
    )
    strict_hitl_tickets: bool = Field(
        default=True,
        description="Require server-issued, single-use approval tickets for write executions",
    )


# Structural Protocols for Dependency Inversion across Feature Boundaries
class PlanGeneratorProtocol(Protocol):
    """Protocol decoupling MCP from workout_planner feature."""
    def generate_deterministic_plan(self, request: Any, context: Any) -> Any: ...


class CatalogIndexProtocol(Protocol):
    """Protocol decoupling MCP from exercise catalog index."""
    def get_all_exercises(self) -> list[Any]: ...
    def search_by_name(self, query: str, limit: int = 5) -> list[Any]: ...


ToolHandler = Callable[[dict[str, Any], str, str], Any]

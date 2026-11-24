"""CLI entrypoint to run FitOnus MCP Server over STDIO transport."""

from onusfit_ai.features.mcp.presentation.server.transports import run_stdio_server


def main() -> None:
    """Run FitOnus MCP server listening on stdin/stdout."""
    run_stdio_server()


if __name__ == "__main__":
    main()

"""LLM port (`ports`), Gemini adapter (`gemini`, `errors`), FastAPI wiring (`dependencies`), logs.

Deliberately empty of re-exports: importing `onusfit_ai.shared.llm.ports` must not load the Gemini
SDK or FastAPI (tests/test_architecture.py enforces it). Import from the module that owns the name.
"""

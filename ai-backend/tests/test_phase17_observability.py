"""Phase 17 AI Observability — offline unit tests.

Covers W3C traceparent parsing, distributed trace propagation, bounded-cardinality
AI metrics, RAG/Agent/Multimodal domain telemetry, PII redaction, operational
health evaluation, and fail-open resilience.
"""

import asyncio
import time

import pytest

# ---------------------------------------------------------------------------
# 1  W3C `traceparent` Parsing & Generation
# ---------------------------------------------------------------------------


class TestTraceparentParsing:
    """parse_traceparent accepts valid W3C headers and rejects invalid ones."""

    def test_valid_traceparent(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        ctx = parse_traceparent("00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01")
        assert ctx is not None
        assert ctx.trace_id == "0af7651916cd43dd8448eb211c80319c"
        assert ctx.parent_span_id == "b7ad6b7169203331"
        assert ctx.trace_flags == "01"
        assert len(ctx.span_id) == 16  # new child span id

    def test_rejects_none(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        assert parse_traceparent(None) is None

    def test_rejects_empty_string(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        assert parse_traceparent("") is None

    def test_rejects_zero_trace_id(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        assert parse_traceparent("00-" + "0" * 32 + "-b7ad6b7169203331-01") is None

    def test_rejects_zero_span_id(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        assert parse_traceparent("00-0af7651916cd43dd8448eb211c80319c-" + "0" * 16 + "-01") is None

    def test_rejects_malformed_format(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        assert parse_traceparent("not-a-traceparent") is None
        assert parse_traceparent("01-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01") is None

    def test_case_insensitive(self) -> None:
        from onusfit_ai.shared.logging import parse_traceparent

        ctx = parse_traceparent("00-0AF7651916CD43DD8448EB211C80319C-B7AD6B7169203331-01")
        assert ctx is not None
        assert ctx.trace_id == "0af7651916cd43dd8448eb211c80319c"


# ---------------------------------------------------------------------------
# 2  TraceContext Root & Child Creation
# ---------------------------------------------------------------------------


class TestTraceContextCreation:
    """create_root_trace_context and create_child_span_context."""

    def test_root_without_traceparent(self) -> None:
        from onusfit_ai.shared.logging import create_root_trace_context

        ctx = create_root_trace_context(correlation_id="req-123", ai_request_id="ai-456")
        assert len(ctx.trace_id) == 32
        assert len(ctx.span_id) == 16
        assert ctx.correlation_id == "req-123"
        assert ctx.ai_request_id == "ai-456"
        assert ctx.parent_span_id is None

    def test_root_with_valid_traceparent(self) -> None:
        from onusfit_ai.shared.logging import create_root_trace_context

        tp = "00-0af7651916cd43dd8448eb211c80319c-b7ad6b7169203331-01"
        ctx = create_root_trace_context(traceparent=tp, correlation_id="c1")
        assert ctx.trace_id == "0af7651916cd43dd8448eb211c80319c"
        assert ctx.correlation_id == "c1"

    def test_root_with_invalid_traceparent_generates_new(self) -> None:
        from onusfit_ai.shared.logging import create_root_trace_context

        ctx = create_root_trace_context(traceparent="garbage")
        assert len(ctx.trace_id) == 32
        assert ctx.parent_span_id is None

    def test_child_inherits_trace_id(self) -> None:
        from onusfit_ai.shared.logging import (
            bind_trace_context,
            create_child_span_context,
            create_root_trace_context,
            reset_trace_context,
        )

        root = create_root_trace_context()
        tokens = bind_trace_context(root)
        try:
            child = create_child_span_context()
            assert child.trace_id == root.trace_id
            assert child.parent_span_id == root.span_id
            assert child.span_id != root.span_id
        finally:
            reset_trace_context(tokens)

    def test_to_traceparent_format(self) -> None:
        from onusfit_ai.shared.logging import TraceContext

        ctx = TraceContext(trace_id="a" * 32, span_id="b" * 16, trace_flags="01")
        assert ctx.to_traceparent() == f"00-{'a' * 32}-{'b' * 16}-01"


# ---------------------------------------------------------------------------
# 3  BoundedSpanRecorder
# ---------------------------------------------------------------------------


class TestBoundedSpanRecorder:
    """Ring buffer evicts oldest spans and respects capacity."""

    def test_capacity_enforcement(self) -> None:
        from onusfit_ai.shared.logging import BoundedSpanRecorder, SpanRecord

        recorder = BoundedSpanRecorder(max_spans=3)
        for i in range(5):
            recorder.record(
                SpanRecord(
                    trace_id="t1",
                    span_id=f"s{i}",
                    parent_span_id=None,
                    service="test",
                    operation=f"op{i}",
                    status="ok",
                    duration_ms=1.0,
                    started_at_monotonic=time.monotonic(),
                )
            )
        assert recorder.count() == 3
        spans = recorder.recent_spans()
        ops = [s.operation for s in spans]
        assert ops == ["op2", "op3", "op4"]

    def test_filter_by_trace_id(self) -> None:
        from onusfit_ai.shared.logging import BoundedSpanRecorder, SpanRecord

        recorder = BoundedSpanRecorder()
        for tid in ("t1", "t2", "t1"):
            recorder.record(
                SpanRecord(
                    trace_id=tid,
                    span_id="s",
                    parent_span_id=None,
                    service="svc",
                    operation="op",
                    status="ok",
                    duration_ms=0.5,
                    started_at_monotonic=time.monotonic(),
                )
            )
        assert len(recorder.recent_spans(trace_id="t1")) == 2
        assert len(recorder.recent_spans(trace_id="t2")) == 1


# ---------------------------------------------------------------------------
# 4  start_span & start_async_span
# ---------------------------------------------------------------------------


class TestSpanContextManagers:
    """Synchronous and async span context managers bind and restore context."""

    def test_start_span_records_and_restores(self) -> None:
        from onusfit_ai.shared.logging import (
            BoundedSpanRecorder,
            bind_trace_context,
            create_root_trace_context,
            current_trace_context,
            reset_trace_context,
            start_span,
        )

        recorder = BoundedSpanRecorder()
        root = create_root_trace_context()
        tokens = bind_trace_context(root)
        try:
            with start_span("test.op", recorder=recorder):
                inner = current_trace_context()
                assert inner is not None
                assert inner.trace_id == root.trace_id
                assert inner.span_id != root.span_id
            assert recorder.count() == 1
            span = recorder.recent_spans()[0]
            assert span.operation == "test.op"
            assert span.status == "ok"
        finally:
            reset_trace_context(tokens)

    def test_start_span_captures_error(self) -> None:
        from onusfit_ai.shared.logging import BoundedSpanRecorder, start_span

        recorder = BoundedSpanRecorder()
        with pytest.raises(ValueError):
            with start_span("fail.op", recorder=recorder):
                raise ValueError("boom")
        span = recorder.recent_spans()[0]
        assert span.status == "error"
        assert span.error_category == "ValueError"

    @pytest.mark.asyncio
    async def test_start_async_span(self) -> None:
        from onusfit_ai.shared.logging import (
            BoundedSpanRecorder,
            bind_trace_context,
            create_root_trace_context,
            reset_trace_context,
            start_async_span,
        )

        recorder = BoundedSpanRecorder()
        root = create_root_trace_context()
        tokens = bind_trace_context(root)
        try:
            async with start_async_span("async.op", recorder=recorder) as handle:
                handle.set_attribute("key", "value")
            assert recorder.count() == 1
            assert recorder.recent_spans()[0].operation == "async.op"
        finally:
            reset_trace_context(tokens)


# ---------------------------------------------------------------------------
# 5  build_propagation_headers
# ---------------------------------------------------------------------------


class TestPropagationHeaders:
    """build_propagation_headers produces safe outbound headers."""

    def test_headers_with_active_context(self) -> None:
        from onusfit_ai.shared.logging import (
            bind_trace_context,
            build_propagation_headers,
            create_root_trace_context,
            reset_trace_context,
        )
        from onusfit_ai.shared.logging.logging import (
            ai_request_id_var,
            correlation_id_var,
        )

        root = create_root_trace_context(correlation_id="safe-corr-id", ai_request_id="safe-req-id")
        tokens = bind_trace_context(root)
        corr_tok = correlation_id_var.set("safe-corr-id")
        req_tok = ai_request_id_var.set("safe-req-id")
        try:
            headers = build_propagation_headers()
            assert "traceparent" in headers
            assert headers["X-Correlation-Id"] == "safe-corr-id"
            assert headers["X-Request-Id"] == "safe-req-id"
        finally:
            ai_request_id_var.reset(req_tok)
            correlation_id_var.reset(corr_tok)
            reset_trace_context(tokens)

    def test_headers_without_context(self) -> None:
        from onusfit_ai.shared.logging import build_propagation_headers

        headers = build_propagation_headers()
        assert "traceparent" not in headers


# ---------------------------------------------------------------------------
# 6  AiMetricsRegistry — LLM Calls
# ---------------------------------------------------------------------------


class TestAiMetricsLlm:
    """LLM call recording, success/failure counts, tokens, and latency."""

    def test_record_success_and_failure(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_llm_call(
            feature="coach_chat",
            model="gemini-2.5-flash",
            duration_ms=100,
            success=True,
            input_tokens=50,
            output_tokens=20,
            total_tokens=70,
        )
        m.record_llm_call(
            feature="coach_chat",
            model="gemini-2.5-flash",
            duration_ms=200,
            success=False,
            error_category="gemini_timeout",
            timeout=True,
        )
        snap = m.snapshot()
        ai = snap["ai"]
        assert ai["totalRequests"] == 2
        assert ai["successCount"] == 1
        assert ai["failureCount"] == 1
        assert ai["timeoutCount"] == 1
        assert ai["totalTokens"] == 70
        assert ai["estimatedCostUsd"] > 0

    def test_fallback_and_retry_tracking(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_llm_call(
            feature="coach_insights",
            model="gemini-2.5-flash-lite",
            duration_ms=300,
            success=True,
            is_fallback=True,
            retry_count=2,
        )
        snap = m.snapshot()
        assert snap["ai"]["fallbackCount"] == 1
        assert snap["ai"]["retryCount"] == 2

    def test_latency_percentiles(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        for i in range(100):
            m.record_llm_call(
                feature="coach_chat",
                model="gemini-2.5-flash",
                duration_ms=float(i + 1),
                success=True,
            )
        snap = m.snapshot()
        lat = snap["ai"]["byFeature"]["coach_chat"]["latency"]
        assert lat["count"] == 100
        assert lat["p50Ms"] > 0
        assert lat["p95Ms"] > lat["p50Ms"]
        assert lat["p99Ms"] >= lat["p95Ms"]
        assert lat["maxMs"] == 100.0


# ---------------------------------------------------------------------------
# 7  AiMetricsRegistry — Bounded Cardinality
# ---------------------------------------------------------------------------


class TestMetricsCardinality:
    """Dynamic keys overflow into the _other bucket; closed vocabularies clamp."""

    def test_unknown_feature_maps_to_other(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry
        from onusfit_ai.shared.logging.metrics import OVERFLOW_LABEL

        m = AiMetricsRegistry()
        m.record_llm_call(
            feature="totally_unknown_feature",
            model="m",
            duration_ms=10,
            success=True,
        )
        snap = m.snapshot()
        assert OVERFLOW_LABEL in snap["ai"]["byFeature"]

    def test_model_cardinality_cap(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry
        from onusfit_ai.shared.logging.metrics import OVERFLOW_LABEL

        m = AiMetricsRegistry(max_series=4)
        for i in range(10):
            m.record_llm_call(
                feature="coach_chat",
                model=f"model-{i}",
                duration_ms=1,
                success=True,
            )
        snap = m.snapshot()
        assert len(snap["ai"]["byModel"]) <= 5  # 4 + possibly _other
        assert OVERFLOW_LABEL in snap["ai"]["byModel"]


# ---------------------------------------------------------------------------
# 8  AiMetricsRegistry — Cost Estimation
# ---------------------------------------------------------------------------


class TestCostEstimation:
    """estimate_cost_usd applies per-model pricing."""

    def test_known_model(self) -> None:
        from onusfit_ai.shared.logging.metrics import estimate_cost_usd

        cost = estimate_cost_usd("gemini-2.5-flash", input_tokens=1_000_000, output_tokens=0)
        assert cost == pytest.approx(0.15, abs=0.01)

    def test_cached_tokens_discount(self) -> None:
        from onusfit_ai.shared.logging.metrics import estimate_cost_usd

        full = estimate_cost_usd("gemini-2.5-flash", input_tokens=1000, output_tokens=0)
        cached = estimate_cost_usd(
            "gemini-2.5-flash", input_tokens=1000, output_tokens=0, cached_tokens=500
        )
        assert cached < full


# ---------------------------------------------------------------------------
# 9  AiMetricsRegistry — RAG Retrieval
# ---------------------------------------------------------------------------


class TestRagMetrics:
    """RAG retrieval tracking: empty results, grounding, reranking, scores."""

    def test_rag_basic_retrieval(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_rag_retrieval(
            mode="hybrid",
            duration_ms=50,
            candidate_count=20,
            returned_count=5,
            top_score=0.92,
            avg_score=0.78,
            reranked=True,
            rerank_duration_ms=12,
            citations_count=3,
            grounded=True,
        )
        snap = m.snapshot()
        rag = snap["rag"]["hybrid"]
        assert rag["retrievals"] == 1
        assert rag["rerankedCount"] == 1
        assert rag["groundedCount"] == 1
        assert rag["avgCandidates"] == 20.0
        assert rag["avgReturned"] == 5.0

    def test_rag_empty_result(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_rag_retrieval(mode="vector", duration_ms=20, candidate_count=0, returned_count=0)
        snap = m.snapshot()
        assert snap["rag"]["vector"]["emptyResults"] == 1

    def test_rag_failure_not_counted_as_empty(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_rag_retrieval(
            mode="vector",
            duration_ms=5,
            candidate_count=0,
            returned_count=0,
            failed=True,
        )
        snap = m.snapshot()
        assert snap["rag"]["vector"]["emptyResults"] == 0
        assert snap["rag"]["vector"]["failedCount"] == 1


# ---------------------------------------------------------------------------
# 10  AiMetricsRegistry — Agent Execution
# ---------------------------------------------------------------------------


class TestAgentMetrics:
    """Agent execution metrics: routing, tools, limit hits, fallbacks."""

    def test_agent_execution_tracking(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_agent_execution(
            engine="native",
            routing_decision="general_chat",
            duration_ms=2000,
            tool_calls=3,
            tool_failures=1,
            iterations=5,
            replans=1,
            limit_hit="max_iterations",
            failed=False,
            fallback_used=False,
        )
        snap = m.snapshot()
        eng = snap["agent"]["byEngine"]["native"]
        assert eng["executions"] == 1
        assert eng["toolCalls"] == 3
        assert eng["toolFailures"] == 1
        assert eng["limitHits"] == 1
        assert snap["agent"]["routingDecisions"]["general_chat"] == 1
        assert snap["agent"]["limitHitsByType"]["max_iterations"] == 1

    def test_tool_call_recording(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_tool_call(tool_name="get_workout", duration_ms=100, success=True, cached=True)
        m.record_tool_call(tool_name="get_workout", duration_ms=50, success=False)
        snap = m.snapshot()
        tools = snap["agent"]["tools"]
        assert "get_workout" in tools
        assert tools["get_workout"]["calls"] == 2
        assert tools["get_workout"]["failures"] == 1
        assert tools["get_workout"]["cacheHits"] == 1


# ---------------------------------------------------------------------------
# 11  AiMetricsRegistry — Multimodal Processing
# ---------------------------------------------------------------------------


class TestMultimodalMetrics:
    """Multimodal processing metrics: validation, failures, byte tracking."""

    def test_multimodal_tracking(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_multimodal_processing(
            modality="image",
            duration_ms=500,
            validation_duration_ms=50,
            byte_size=102400,
        )
        m.record_multimodal_processing(
            modality="image",
            duration_ms=100,
            validation_failed=True,
            validation_reason="oversize",
            byte_size=5_000_000,
        )
        snap = m.snapshot()
        img = snap["multimodal"]["byModality"]["image"]
        assert img["requests"] == 2
        assert img["validationFailures"] == 1
        assert img["totalBytes"] == 5_102_400
        assert snap["multimodal"]["validationFailuresByReason"]["oversize"] == 1

    def test_unknown_modality_clamped(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry
        from onusfit_ai.shared.logging.metrics import OVERFLOW_LABEL

        m = AiMetricsRegistry()
        m.record_multimodal_processing(modality="video_3d", duration_ms=10)
        snap = m.snapshot()
        assert OVERFLOW_LABEL in snap["multimodal"]["byModality"]


# ---------------------------------------------------------------------------
# 12  AiMetricsRegistry — Reset & Snapshot Isolation
# ---------------------------------------------------------------------------


class TestMetricsReset:
    """reset() clears all counters."""

    def test_reset_clears_state(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        m.record_llm_call(feature="coach_chat", model="m", duration_ms=10, success=True)
        m.reset()
        snap = m.snapshot()
        assert snap["ai"]["totalRequests"] == 0
        assert len(snap["ai"]["byFeature"]) == 0


# ---------------------------------------------------------------------------
# 13  record_rag_retrieval Domain Telemetry
# ---------------------------------------------------------------------------


class TestRecordRagRetrieval:
    """record_rag_retrieval helper emits structured log and updates metrics."""

    def test_returns_structured_payload(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry, record_rag_retrieval

        m = AiMetricsRegistry()
        payload = record_rag_retrieval(
            mode="hybrid",
            duration_ms=42,
            candidate_count=10,
            returned_count=3,
            top_score=0.91,
            reranked=True,
            rerank_duration_ms=5,
            grounded=True,
            metrics=m,
        )
        assert payload["mode"] == "hybrid"
        assert payload["returnedCount"] == 3
        assert payload["emptyResult"] is False
        assert payload["reranked"] is True
        assert payload["success"] is True

    def test_empty_result_on_zero_returned(self) -> None:
        from onusfit_ai.shared.logging import record_rag_retrieval

        payload = record_rag_retrieval(
            mode="vector",
            duration_ms=10,
            candidate_count=5,
            returned_count=0,
        )
        assert payload["emptyResult"] is True


# ---------------------------------------------------------------------------
# 14  AgentObservabilityTracker
# ---------------------------------------------------------------------------


class TestAgentObservabilityTracker:
    """AgentObservabilityTracker tracks routing, tools, limits, and finalization."""

    def test_full_lifecycle(self) -> None:
        from onusfit_ai.shared.logging import AgentObservabilityTracker, AiMetricsRegistry

        m = AiMetricsRegistry()
        tracker = AgentObservabilityTracker(engine="native", trace_id="t1", metrics=m)
        tracker.record_routing(
            intent="general_chat", requires_agent=True, selected_agents=["coach"]
        )
        tracker.record_tool_call(tool_name="get_history", duration_ms=50, success=True)
        tracker.record_tool_call(
            tool_name="bad_tool", duration_ms=10, success=False, error_category="timeout"
        )
        tracker.iterations = 3
        tracker.record_limit_hit("max_iterations")
        payload = tracker.finalize()
        assert payload["routingDecision"] == "general_chat"
        assert payload["toolCallsCount"] == 2
        assert payload["toolFailuresCount"] == 1
        assert payload["limitHit"] == "max_iterations"
        assert payload["success"] is True  # not failed

    def test_failure_tracking(self) -> None:
        from onusfit_ai.shared.logging import AgentObservabilityTracker, AiMetricsRegistry

        m = AiMetricsRegistry()
        tracker = AgentObservabilityTracker(engine="langgraph", trace_id="t2", metrics=m)
        tracker.record_failure("internal_error")
        payload = tracker.finalize()
        assert payload["success"] is False
        assert payload["errorCategory"] == "internal_error"

    def test_fallback_tracking(self) -> None:
        from onusfit_ai.shared.logging import AgentObservabilityTracker, AiMetricsRegistry

        m = AiMetricsRegistry()
        tracker = AgentObservabilityTracker(engine="native", trace_id="t3", metrics=m)
        tracker.record_fallback("gemini_timeout")
        payload = tracker.finalize()
        assert payload["fallbackUsed"] is True


# ---------------------------------------------------------------------------
# 15  MultimodalObservabilityTracker
# ---------------------------------------------------------------------------


class TestMultimodalTracker:
    """MultimodalObservabilityTracker for validation and processing lifecycle."""

    def test_validation_success_then_processing(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry, MultimodalObservabilityTracker

        m = AiMetricsRegistry()
        tracker = MultimodalObservabilityTracker(
            modality="image",
            feature="meal_photo",
            trace_id="t1",
            metrics=m,
        )
        tracker.record_validation_success(duration_ms=20, byte_size=50000, mime_type="image/jpeg")
        payload = tracker.record_processing_completed(model="gemini-2.5-flash", outcome="ok")
        assert payload["success"] is True
        assert payload["modality"] == "image"
        assert payload["byteSize"] == 50000
        assert payload["validationDurationMs"] == 20.0

    def test_validation_failure(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry, MultimodalObservabilityTracker

        m = AiMetricsRegistry()
        tracker = MultimodalObservabilityTracker(
            modality="audio",
            feature="voice_meal",
            trace_id="t2",
            metrics=m,
        )
        tracker.record_validation_failure(duration_ms=5, reason="oversize", byte_size=99999)
        snap = m.snapshot()
        assert snap["multimodal"]["byModality"]["audio"]["validationFailures"] == 1


# ---------------------------------------------------------------------------
# 16  classify_media_validation_error
# ---------------------------------------------------------------------------


class TestClassifyMediaError:
    """classify_media_validation_error maps message text to bounded categories."""

    @pytest.mark.parametrize(
        ("message", "expected"),
        [
            ("Unsupported MIME type image/tiff", "invalid_mime"),
            ("File size exceeds maximum decoded limit", "oversize"),
            ("Polyglot file detected", "polyglot"),
            ("Pixel bomb detected in image", "pixel_bomb"),
            ("Audio duration exceeds limit", "duration_exceeded"),
            ("Empty payload received", "empty_payload"),
            ("Not a valid JPEG or decode error", "corrupt_decode"),
            ("Something completely unexpected happened", "other"),
        ],
    )
    def test_classification(self, message: str, expected: str) -> None:
        from onusfit_ai.shared.logging import classify_media_validation_error

        assert classify_media_validation_error(message) == expected


# ---------------------------------------------------------------------------
# 17  WorkoutPlannerTelemetry — Zero-PII
# ---------------------------------------------------------------------------


class TestWorkoutPlannerTelemetry:
    """WorkoutPlannerTelemetry.record_node_event must NOT contain user_id."""

    def test_no_user_id_in_returned_dict(self) -> None:
        from onusfit_ai.features.workout_planner.application.graph.telemetry import (
            WorkoutPlannerTelemetry,
        )

        result = WorkoutPlannerTelemetry.record_node_event(
            node_name="generate",
            user_id="user-secret-123",
            trace_id="t1",
            duration_ms=100,
            status="success",
        )
        for key in result:
            assert "user" not in key.lower()
        for value in result.values():
            if isinstance(value, str):
                assert "user-secret-123" not in value


# ---------------------------------------------------------------------------
# 18  Privacy / Redaction — redact, clean_fields, sanitize_error_summary
# ---------------------------------------------------------------------------


class TestPrivacyRedaction:
    """Sensitive data must never appear in logs or metrics."""

    def test_redact_api_key(self) -> None:
        from onusfit_ai.shared.logging import redact

        text = "key=AIzaSyDSomeFakeKeyHere012345"
        result = redact(text)
        assert "AIzaSy" not in result
        assert "[redacted-api-key]" in result

    def test_redact_secret_key(self) -> None:
        from onusfit_ai.shared.logging import redact

        result = redact("token is sk-proj-ABCDEFabcdef123456")
        assert "sk-proj-" not in result
        assert "[redacted-secret-key]" in result

    def test_redact_jwt(self) -> None:
        from onusfit_ai.shared.logging import redact

        jwt = (
            "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiw.SflKxwRJSMeKKF2QT4fwp"
        )
        result = redact(jwt)
        assert "eyJhbGci" not in result
        assert "[redacted-jwt]" in result

    def test_redact_email(self) -> None:
        from onusfit_ai.shared.logging import redact

        result = redact("user email is john@example.com")
        assert "john@example.com" not in result
        assert "[redacted-email]" in result

    def test_clean_fields_sensitive_names(self) -> None:
        from onusfit_ai.shared.logging import clean_fields

        result = clean_fields(
            {
                "prompt": "Tell me about exercises",
                "durationMs": 123,
                "token": "abc123",
                "healthData": {"weight": 70},
                "password": "secret",
                "medical": "has diabetes",
            }
        )
        assert result["prompt"] == "[redacted]"
        assert result["durationMs"] == 123
        assert result["token"] == "[redacted]"
        assert result["healthData"] == "[redacted]"
        assert result["password"] == "[redacted]"
        assert result["medical"] == "[redacted]"

    def test_clean_fields_dict_becomes_type_tag(self) -> None:
        from onusfit_ai.shared.logging import clean_fields

        result = clean_fields({"someObj": {"nested": "value"}})
        assert result["someObj"] == "<dict>"

    def test_sanitize_error_summary_exception(self) -> None:
        from onusfit_ai.shared.logging import sanitize_error_summary

        result = sanitize_error_summary(ValueError("user data leaked"))
        assert result == "ValueError"
        assert "user data" not in result

    def test_sanitize_error_summary_string_redacts(self) -> None:
        from onusfit_ai.shared.logging import sanitize_error_summary

        result = sanitize_error_summary(
            "Error for john@example.com with key AIzaSyDFakeKeyHere0123456789Extra"
        )
        assert "john@example.com" not in result
        assert "AIzaSy" not in result


# ---------------------------------------------------------------------------
# 19  evaluate_operational_health — SLO Thresholds
# ---------------------------------------------------------------------------


class TestOperationalHealth:
    """evaluate_operational_health triggers correct alerts."""

    def test_healthy_on_empty_snapshot(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry, evaluate_operational_health

        m = AiMetricsRegistry()
        result = evaluate_operational_health(m.snapshot())
        assert result["status"] == "healthy"
        assert result["alerts"] == []

    def test_critical_on_quota_exhausted(self) -> None:
        from onusfit_ai.shared.logging import AiMetricsRegistry, evaluate_operational_health

        m = AiMetricsRegistry()
        m.record_llm_call(
            feature="coach_chat",
            model="m",
            duration_ms=10,
            success=False,
            error_category="gemini_quota_exhausted",
        )
        result = evaluate_operational_health(m.snapshot())
        assert result["status"] == "critical"
        codes = {a["code"] for a in result["alerts"]}
        assert "QUOTA_EXHAUSTED" in codes

    def test_degraded_on_elevated_error_rate(self) -> None:
        from onusfit_ai.shared.logging import (
            AiMetricsRegistry,
            SloThresholds,
            evaluate_operational_health,
        )

        m = AiMetricsRegistry()
        for i in range(20):
            m.record_llm_call(
                feature="coach_chat",
                model="m",
                duration_ms=10,
                success=(i < 18),  # 10% failure rate
                error_category="internal_error" if i >= 18 else None,
            )
        thresholds = SloThresholds(min_samples=5, warn_error_rate=0.05, critical_error_rate=0.20)
        result = evaluate_operational_health(m.snapshot(), thresholds)
        assert result["status"] == "degraded"
        codes = {a["code"] for a in result["alerts"]}
        assert "ELEVATED_AI_ERROR_RATE" in codes

    def test_rag_empty_rate_alert(self) -> None:
        from onusfit_ai.shared.logging import (
            AiMetricsRegistry,
            SloThresholds,
            evaluate_operational_health,
        )

        m = AiMetricsRegistry()
        for i in range(20):
            m.record_rag_retrieval(
                mode="vector",
                duration_ms=10,
                candidate_count=5,
                returned_count=(0 if i < 15 else 3),
            )
        thresholds = SloThresholds(min_samples=5, critical_rag_empty_rate=0.60)
        result = evaluate_operational_health(m.snapshot(), thresholds)
        codes = {a["code"] for a in result["alerts"]}
        assert "RAG_EMPTY_RATE_CRITICAL" in codes

    def test_agent_limit_hit_rate_alert(self) -> None:
        from onusfit_ai.shared.logging import (
            AiMetricsRegistry,
            SloThresholds,
            evaluate_operational_health,
        )

        m = AiMetricsRegistry()
        for i in range(15):
            m.record_agent_execution(
                engine="native",
                routing_decision="chat",
                duration_ms=100,
                limit_hit="max_iters" if i < 6 else None,
            )
        thresholds = SloThresholds(min_samples=5, critical_agent_limit_hit_rate=0.35)
        result = evaluate_operational_health(m.snapshot(), thresholds)
        codes = {a["code"] for a in result["alerts"]}
        assert "AGENT_LIMIT_HIT_CRITICAL" in codes


# ---------------------------------------------------------------------------
# 20  Fail-Open Resilience
# ---------------------------------------------------------------------------


class TestFailOpen:
    """Observability must never raise into application code."""

    def test_metrics_registry_survives_internal_error(self) -> None:
        """record_llm_call does not raise even with extreme inputs."""
        from onusfit_ai.shared.logging import AiMetricsRegistry

        m = AiMetricsRegistry()
        # NaN, Inf, negative: should not crash
        m.record_llm_call(
            feature="coach_chat",
            model="m",
            duration_ms=float("nan"),
            success=True,
        )
        m.record_llm_call(
            feature="coach_chat",
            model="m",
            duration_ms=float("inf"),
            success=True,
        )
        m.record_llm_call(
            feature="coach_chat",
            model="m",
            duration_ms=-100,
            success=True,
        )
        snap = m.snapshot()
        assert snap["ai"]["totalRequests"] == 3

    def test_record_rag_retrieval_fail_open_on_broken_metrics(self) -> None:
        """record_rag_retrieval does not raise even if metrics raises."""
        from unittest.mock import MagicMock

        from onusfit_ai.shared.logging import record_rag_retrieval

        broken_metrics = MagicMock()
        broken_metrics.record_rag_retrieval.side_effect = RuntimeError("boom")
        # Must not raise
        payload = record_rag_retrieval(
            mode="vector",
            duration_ms=10,
            candidate_count=5,
            returned_count=2,
            metrics=broken_metrics,
        )
        assert payload["success"] is True


# ---------------------------------------------------------------------------
# 21  AsyncIO Concurrency Isolation
# ---------------------------------------------------------------------------


class TestAsyncConcurrencyIsolation:
    """Concurrent async tasks must not cross-contaminate trace context."""

    @pytest.mark.asyncio
    async def test_concurrent_trace_contexts_isolated(self) -> None:
        from onusfit_ai.shared.logging import (
            bind_trace_context,
            create_root_trace_context,
            current_trace_context,
            reset_trace_context,
        )

        results: dict[str, str | None] = {}

        async def worker(name: str) -> None:
            root = create_root_trace_context(correlation_id=name)
            tokens = bind_trace_context(root)
            try:
                await asyncio.sleep(0.01)
                ctx = current_trace_context()
                # trace_id is unique per root; correlation_id is in TraceContext but
                # not automatically bound into correlation_id_var by bind_trace_context
                results[name] = ctx.trace_id if ctx else None
            finally:
                reset_trace_context(tokens)

        await asyncio.gather(worker("task-a"), worker("task-b"), worker("task-c"))
        # Each task must see its own trace_id, never another's
        assert results["task-a"] is not None
        assert results["task-b"] is not None
        assert results["task-c"] is not None
        assert len({results["task-a"], results["task-b"], results["task-c"]}) == 3


# ---------------------------------------------------------------------------
# 22  End-to-End Middleware Trace Propagation & Fail-Open Integration
# ---------------------------------------------------------------------------


class TestEndToEndMiddlewareAndFailOpen:
    """Verify HTTP traceparent propagation, metrics collection, and fail-open behavior."""

    def test_http_traceparent_propagation_and_metrics(
        self, client: object, json_logs: object
    ) -> None:
        from typing import cast

        from fastapi.testclient import TestClient

        from conftest import JsonLogs, load_request, make_token
        from onusfit_ai.shared.logging import default_span_recorder, metrics_registry

        test_client = cast(TestClient, client)
        logs = cast(JsonLogs, json_logs)
        metrics_registry.reset()
        default_span_recorder.clear()
        incoming_trace = "0af7651916cd43dd8448eb211c80319c"
        incoming_parent = "b7ad6b7169203331"
        try:
            response = test_client.post(
                "/internal/v1/ai/coach/chat",
                json=load_request("full"),
                headers={
                    "Authorization": f"Bearer {make_token(scope='ai:coach:chat')}",
                    "X-Correlation-Id": "phase17-e2e-corr",
                    "X-Request-Id": "phase17-e2e-req1",
                    "traceparent": f"00-{incoming_trace}-{incoming_parent}-01",
                },
            )
            assert response.status_code == 200
            entries = logs.entries()
            ai_logs = [
                e for e in entries if e.get("event") in ("ai.call.completed", "http.request")
            ]
            assert len(ai_logs) >= 2
            for entry in ai_logs:
                assert entry.get("traceId") == incoming_trace
                assert entry.get("parentSpanId") == incoming_parent
                assert entry.get("spanId") != incoming_parent
            spans = default_span_recorder.recent_spans(trace_id=incoming_trace)
            assert any(s.operation == "http.post" for s in spans)
            snap = metrics_registry.snapshot()
            assert snap["ai"]["byFeature"]["coach_chat"]["requests"] >= 1
            assert snap["httpRequests"].get("coach_chat:2xx", 0) >= 1
        finally:
            metrics_registry.reset()
            default_span_recorder.clear()

    def test_log_ai_call_fail_open_when_metrics_raise(
        self, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
    ) -> None:
        import logging

        from onusfit_ai.shared.llm.ports import LlmUsage
        from onusfit_ai.shared.llm.telemetry import log_ai_call
        from onusfit_ai.shared.logging import metrics_registry

        def broken_record(**_kwargs: object) -> None:
            raise RuntimeError("metrics backend failure")

        monkeypatch.setattr(metrics_registry, "record_llm_call", broken_record)
        logger = logging.getLogger("onusfit_ai.test.failopen")
        with caplog.at_level(logging.INFO):
            log_ai_call(
                logger,
                feature="coach_chat",
                trace_id="trace-failopen",
                prompt_version="v1",
                outcome="ok",
                usage=LlmUsage(
                    model="gemini-2.5-flash",
                    is_fallback=False,
                    input_tokens=10,
                    output_tokens=5,
                    cached_tokens=0,
                    thinking_tokens=0,
                    total_tokens=15,
                    duration_ms=42,
                ),
            )
        assert any(getattr(r, "event", None) == "ai.call.completed" for r in caplog.records)

    def test_graph_telemetry_fail_open_and_no_pii(self, monkeypatch: pytest.MonkeyPatch) -> None:
        from onusfit_ai.features.coach.application.agent.graph.telemetry import (
            GraphExecutionTelemetry,
        )
        from onusfit_ai.shared.logging import metrics_registry

        def broken_agent(**_kwargs: object) -> None:
            raise RuntimeError("agent metrics boom")

        monkeypatch.setattr(metrics_registry, "record_agent_execution", broken_agent)
        telemetry = GraphExecutionTelemetry(
            trace_id="trace-graph-1",
            user_id="sensitive-user-id-xyz",
            termination_reason="max_iterations",
        )
        telemetry.log_completion()  # Must not raise


# ---------------------------------------------------------------------------
# 10  Phase 17 Finalization: /observability, Phase 13/15 Integration & Accuracy
# ---------------------------------------------------------------------------


class TestObservabilityEndpoint:
    """`/observability` enforces internal service auth and never leaks sensitive data."""

    def test_observability_requires_configured_secret(
        self, client, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from conftest import make_token
        from onusfit_ai.shared.observability.router import OBSERVABILITY_SCOPE

        tok = make_token(scope=OBSERVABILITY_SCOPE)
        monkeypatch.delenv("AI_SERVICE_JWT_SECRET")
        res = client.get("/observability", headers={"Authorization": f"Bearer {tok}"})
        assert res.status_code == 503
        assert res.json()["error"]["code"] == "AUTH_NOT_CONFIGURED"

        monkeypatch.setenv("AI_SERVICE_JWT_SECRET", "short-secret")
        short_tok = make_token(secret="short-secret", scope=OBSERVABILITY_SCOPE)
        res2 = client.get("/observability", headers={"Authorization": f"Bearer {short_tok}"})
        assert res2.status_code == 503

    def test_observability_rejects_unauth_wrong_scope_and_replay(self, client) -> None:
        from conftest import make_token
        from onusfit_ai.shared.observability.router import OBSERVABILITY_SCOPE

        assert client.get("/observability").status_code == 401
        wrong = make_token(scope="ai:coach:chat")
        assert (
            client.get("/observability", headers={"Authorization": f"Bearer {wrong}"}).status_code
            == 401
        )
        good = make_token(scope=OBSERVABILITY_SCOPE, jti="obs-replay-check-1")
        assert (
            client.get("/observability", headers={"Authorization": f"Bearer {good}"}).status_code
            == 200
        )
        assert (
            client.get("/observability", headers={"Authorization": f"Bearer {good}"}).status_code
            == 401
        )

    def test_observability_sanitized_snapshot_and_no_http_self_inflation(self, client) -> None:
        import json

        from conftest import SECRET, make_token
        from onusfit_ai.shared.logging import default_span_recorder, metrics_registry, start_span
        from onusfit_ai.shared.observability.router import OBSERVABILITY_SCOPE

        metrics_registry.reset()
        default_span_recorder.clear()
        with start_span(
            "obs.test.span",
            attributes={
                "userId": "secret-user-obs-1",
                "prompt": "secret user health query",
                "safeKey": "ok",
            },
        ):
            pass
        metrics_registry.record_llm_call(
            feature="coach_chat",
            model="gemini-3.5-flash-lite",
            duration_ms=42.0,
            success=True,
            input_tokens=100,
            output_tokens=20,
            total_tokens=120,
        )

        for path in ("/observability", "/internal/v1/observability"):
            tok = make_token(scope=OBSERVABILITY_SCOPE)
            res = client.get(path, headers={"Authorization": f"Bearer {tok}"})
            assert res.status_code == 200
            body = res.json()
            assert body["processLocal"] is True
            assert "process memory" in body["restartBehavior"]
            assert body["metrics"]["ai"]["totalRequests"] == 1
            assert body["tracing"]["bufferedSpans"] >= 1
            assert "_other:2xx" not in body["metrics"]["httpRequests"]
            serialized = json.dumps(body)
            assert "safeKey" in serialized
            assert "secret-user-obs-1" not in serialized
            assert "secret user health query" not in serialized
            assert SECRET not in serialized

        metrics_registry.reset()
        default_span_recorder.clear()


class TestPhase13MultiAgentAndMcpTelemetry:
    """Multi-agent routing, MCP gateway, A2A mediator, and HTTP tools propagate telemetry."""

    def test_multi_agent_telemetry_records_engine_metrics(self) -> None:
        from onusfit_ai.features.coach.application.multi_agent.telemetry import (
            MultiAgentTelemetry,
        )
        from onusfit_ai.shared.logging import metrics_registry

        metrics_registry.reset()
        tele = MultiAgentTelemetry(trace_id="trace-ma-obs-1")
        tele.routing_mode = "parallel"
        tele.tool_calls_count = 3
        tele.tool_failures_count = 1
        tele.delegation_count = 2
        tele.fallback_used = True
        tele.termination_reason = "budget_exhausted"
        tele.log_workflow_completed()

        snap = metrics_registry.snapshot()
        ma = snap["agent"]["byEngine"]["multi_agent"]
        assert ma["executions"] == 1
        assert ma["toolCalls"] == 3
        assert ma["toolFailures"] == 1
        assert ma["limitHits"] == 1
        assert ma["fallbacks"] == 1
        metrics_registry.reset()

    @pytest.mark.asyncio
    async def test_multi_agent_mcp_gateway_records_cache_hits_and_spans(self) -> None:
        from onusfit_ai.features.coach.application.multi_agent.budgets import (
            CumulativeBudgetTracker,
        )
        from onusfit_ai.features.coach.application.multi_agent.mcp_gateway import (
            MultiAgentMcpGateway,
        )
        from onusfit_ai.features.coach.domain.multi_agent import (
            AgentCapability,
            AgentRole,
            MultiAgentExecutionBudget,
        )
        from onusfit_ai.shared.logging import default_span_recorder, metrics_registry

        metrics_registry.reset()
        default_span_recorder.clear()

        async def fake_mcp(_name: str, _args: dict[str, object]) -> dict[str, object]:
            return {"profile": {"goal": "strength"}}

        gw = MultiAgentMcpGateway(
            budget_tracker=CumulativeBudgetTracker(MultiAgentExecutionBudget(max_tool_calls=5)),
            mcp_handler=fake_mcp,
        )
        for _ in range(2):
            await gw.execute_for_agent(
                agent_role=AgentRole.WORKOUT,
                agent_capabilities=[AgentCapability.WORKOUT_HISTORY],
                tool_name="get_fitness_profile",
                arguments={},
                user_id="user-gw-obs",
                request_id="req-gw-obs",
            )

        tool_stats = metrics_registry.snapshot()["agent"]["tools"]["get_fitness_profile"]
        assert tool_stats["calls"] == 2
        assert tool_stats["failures"] == 0
        assert tool_stats["cacheHits"] == 1
        spans = default_span_recorder.recent_spans()
        assert any(s.operation == "multi_agent.tool.get_fitness_profile" for s in spans)
        metrics_registry.reset()
        default_span_recorder.clear()

    @pytest.mark.asyncio
    async def test_mcp_orchestrator_and_a2a_mediator_telemetry(self) -> None:
        from onusfit_ai.features.mcp.application.a2a import (
            A2AMediator,
            A2AMessage,
            A2APerformative,
            A2ATaskRequest,
        )
        from onusfit_ai.features.mcp.application.orchestrator import AgentToolOrchestrator
        from onusfit_ai.features.mcp.application.registry import create_fitonus_tool_registry
        from onusfit_ai.features.mcp.domain.contracts import McpToolCall
        from onusfit_ai.shared.logging import default_span_recorder, metrics_registry

        metrics_registry.reset()
        default_span_recorder.clear()

        orch = AgentToolOrchestrator(registry=create_fitonus_tool_registry())
        res = await orch.execute_tool(
            McpToolCall(
                tool_name="get_fitness_profile",
                arguments={},
                user_id="user-orch-obs",
                request_id="req-orch-obs",
            )
        )
        assert not res.is_error
        assert metrics_registry.snapshot()["agent"]["tools"]["get_fitness_profile"]["calls"] == 1
        assert any(
            s.operation == "mcp.orchestrator.get_fitness_profile"
            for s in default_span_recorder.recent_spans()
        )

        mediator = A2AMediator()

        async def rec_handler(msg: A2AMessage) -> A2AMessage:
            return A2AMessage(
                conversation_id=msg.conversation_id,
                sender_agent="recovery",
                recipient_agent=msg.sender_agent,
                performative=A2APerformative.INFORM,
                payload={"result": {"ok": True}},
                in_reply_to=msg.message_id,
                correlation_id=msg.correlation_id,
                task_id=msg.task_id,
            )

        mediator.register_agent("recovery", rec_handler, capabilities=["recovery_guidance"])
        task_res = await mediator.delegate_task(
            "supervisor",
            "recovery",
            A2ATaskRequest(
                task_id="task-a2a-obs-1",
                task_type="eval_recovery",
                instructions="check",
                user_id="user-a2a-obs",
                required_capabilities=["recovery_guidance"],
            ),
        )
        assert task_res.status == "completed"
        assert any(
            s.operation == "a2a.delegate.recovery" for s in default_span_recorder.recent_spans()
        )
        metrics_registry.reset()
        default_span_recorder.clear()

    @pytest.mark.asyncio
    async def test_internal_tools_client_propagates_traceparent(self) -> None:
        import httpx

        from conftest import SECRET
        from onusfit_ai.shared.logging import (
            bind_trace_context,
            create_root_trace_context,
            default_span_recorder,
            reset_trace_context,
        )
        from onusfit_ai.shared.tools.client import InternalToolsClient

        default_span_recorder.clear()
        captured_headers: dict[str, str] = {}

        async def handler(request: httpx.Request) -> httpx.Response:
            captured_headers.update(dict(request.headers))
            return httpx.Response(200, json={"profile": {"goal": "strength"}})

        root = create_root_trace_context(ai_request_id="req-tools-obs-1")
        tokens = bind_trace_context(root)
        try:
            async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as http_client:
                tools_client = InternalToolsClient(
                    "https://node.local", SECRET, http_client=http_client
                )
                out = await tools_client.execute_tool(
                    "get_fitness_profile", {}, user_id="u-tools-1", request_id="req-tools-obs-1"
                )
        finally:
            reset_trace_context(tokens)

        assert out == {"profile": {"goal": "strength"}}
        assert root.trace_id in captured_headers.get("traceparent", "")
        assert captured_headers.get("x-correlation-id") == "req-tools-obs-1"
        assert any(
            s.operation == "tools.http.get_fitness_profile"
            for s in default_span_recorder.recent_spans()
        )
        default_span_recorder.clear()


class TestPhase15MultimodalAndDoubleCountPrevention:
    """Phase 15 multimodal telemetry integration and single-counting across retries/errors."""

    @pytest.mark.asyncio
    async def test_meal_photo_voice_and_transcribe_multimodal_telemetry(self) -> None:
        import base64
        import json

        from conftest import FakeLlm
        from onusfit_ai.features.meals.application.photo import analyze_meal_photo
        from onusfit_ai.features.meals.application.voice import parse_voice_meal
        from onusfit_ai.features.meals.domain.photo import AnalyzeMealPhotoRequest
        from onusfit_ai.features.meals.domain.voice import ParseVoiceMealRequest
        from onusfit_ai.features.speech.application.contracts import TranscribeRequest
        from onusfit_ai.features.speech.application.transcribe import transcribe_audio
        from onusfit_ai.shared.logging import metrics_registry
        from onusfit_ai.shared.utils.media import InvalidMediaError

        metrics_registry.reset()
        llm = FakeLlm()

        bad_photo = AnalyzeMealPhotoRequest.model_validate(
            {
                "image": {
                    "mimeType": "image/jpeg",
                    "base64": base64.b64encode(b"not-valid-jpeg").decode(),
                },
                "model": {"primary": "gemini-primary", "fallback": None},
                "deadlineMs": 10000,
            }
        )
        with pytest.raises(InvalidMediaError):
            await analyze_meal_photo(bad_photo, llm, trace_id="trace-mm-bad-photo")

        snap = metrics_registry.snapshot()["multimodal"]
        assert snap["byModality"]["image"]["requests"] == 1
        assert snap["byModality"]["image"]["validationFailures"] == 1

        # Transcript-only voice meal does not emit audio modality metrics.
        llm.text = json.dumps(
            {
                "transcript": "two eggs",
                "detectedLanguage": "en",
                "confidence": "high",
                "unclearReason": None,
                "items": [],
            }
        )
        text_only_req = ParseVoiceMealRequest.model_validate(
            {
                "transcript": "two eggs",
                "model": {"primary": "gemini-primary", "fallback": None},
                "deadlineMs": 10000,
            }
        )
        await parse_voice_meal(text_only_req, llm, trace_id="trace-mm-text-voice")
        assert "audio" not in metrics_registry.snapshot()["multimodal"]["byModality"]

        audio_req = ParseVoiceMealRequest.model_validate(
            {
                "audio": {
                    "mimeType": "audio/m4a",
                    "base64": base64.b64encode(b"\x00\x01fake-m4a").decode(),
                },
                "model": {"primary": "gemini-primary", "fallback": None},
                "deadlineMs": 10000,
            }
        )
        await parse_voice_meal(audio_req, llm, trace_id="trace-mm-audio-voice")

        llm.text = json.dumps({"transcript": "two eggs", "detectedLanguage": "en"})
        stt_req = TranscribeRequest.model_validate(
            {
                "audio": {
                    "mimeType": "audio/m4a",
                    "base64": base64.b64encode(b"\x00\x01fake-m4a").decode(),
                },
                "model": {"primary": "gemini-primary", "fallback": None},
                "deadlineMs": 10000,
            }
        )
        await transcribe_audio(stt_req, llm, trace_id="trace-mm-stt")

        audio_stats = metrics_registry.snapshot()["multimodal"]["byModality"]["audio"]
        assert audio_stats["requests"] == 2
        assert audio_stats["processingErrors"] == 0
        metrics_registry.reset()

    def test_parse_failed_and_safety_do_not_double_count_requests_or_failures(
        self, client, fake_llm
    ) -> None:
        import base64

        from conftest import make_token
        from onusfit_ai.shared.logging import metrics_registry

        metrics_registry.reset()
        fake_llm.text = "not json at all"
        photo_body = {
            "image": {
                "mimeType": "image/jpeg",
                "base64": base64.b64encode(b"\xff\xd8\xff\xe0\x00\x10JFIF-fake").decode(),
            },
            "model": {"primary": "gemini-primary", "fallback": None},
            "deadlineMs": 15000,
        }
        res_photo = client.post(
            "/internal/v1/ai/meals/analyze-photo",
            json=photo_body,
            headers={"Authorization": f"Bearer {make_token(scope='ai:meals:photo')}"},
        )
        assert res_photo.status_code == 503
        snap1 = metrics_registry.snapshot()
        assert snap1["ai"]["byFeature"]["meal_photo"]["requests"] == 1
        assert snap1["ai"]["byFeature"]["meal_photo"]["failures"] == 1
        assert snap1["multimodal"]["byModality"]["image"]["processingErrors"] == 1

        fake_llm.finish_reason = "SAFETY"
        stt_body = {
            "audio": {
                "mimeType": "audio/m4a",
                "base64": base64.b64encode(b"\x00\x01fake-m4a").decode(),
            },
            "model": {"primary": "gemini-primary", "fallback": None},
            "deadlineMs": 15000,
        }
        res_stt = client.post(
            "/internal/v1/ai/speech/transcribe",
            json=stt_body,
            headers={"Authorization": f"Bearer {make_token(scope='ai:speech:transcribe')}"},
        )
        assert res_stt.status_code == 503
        snap2 = metrics_registry.snapshot()
        assert snap2["ai"]["byFeature"]["transcribe"]["requests"] == 1
        assert snap2["ai"]["byFeature"]["transcribe"]["failures"] == 1
        assert snap2["ai"]["byFeature"]["transcribe"]["totalTokens"] == 125
        assert snap2["multimodal"]["byModality"]["audio"]["processingErrors"] == 1
        metrics_registry.reset()

    def test_log_ai_call_record_metrics_false_prevents_double_counting(self) -> None:
        import logging

        from onusfit_ai.shared.llm.ports import LlmUsage
        from onusfit_ai.shared.llm.telemetry import log_ai_call
        from onusfit_ai.shared.logging import llm_metrics_recorded_var, metrics_registry

        metrics_registry.reset()
        tok = llm_metrics_recorded_var.set(False)
        try:
            usage = LlmUsage(
                model="gemini-primary",
                is_fallback=False,
                input_tokens=40,
                output_tokens=10,
                cached_tokens=0,
                thinking_tokens=0,
                total_tokens=50,
                duration_ms=25,
            )
            log_ai_call(
                logging.getLogger("onusfit_ai.test"),
                feature="multimodal_meal",
                trace_id="trace-no-dbl-1",
                prompt_version="v1",
                outcome="ok",
                usage=usage,
                record_metrics=False,
            )
            assert llm_metrics_recorded_var.get() is False
            assert "multimodal_meal" not in metrics_registry.snapshot()["ai"]["byFeature"]
        finally:
            llm_metrics_recorded_var.reset(tok)
            metrics_registry.reset()

    @pytest.mark.asyncio
    async def test_analyze_multimodal_meal_record_llm_metrics_false(self) -> None:
        import base64
        import json

        mm = pytest.importorskip("onusfit_ai.features.meals.application.multimodal")

        from conftest import FakeLlm
        from onusfit_ai.features.meals.domain.multimodal import AnalyzeMultimodalMealRequest
        from onusfit_ai.shared.logging import metrics_registry

        metrics_registry.reset()
        llm = FakeLlm(
            text=json.dumps(
                {
                    "isFood": True,
                    "summary": "Idli",
                    "transcript": "two idli",
                    "detectedLanguage": "en",
                    "confidence": "high",
                    "unclearReason": None,
                    "items": [],
                }
            )
        )
        req = AnalyzeMultimodalMealRequest.model_validate(
            {
                "audio": {
                    "mimeType": "audio/wav",
                    "base64": base64.b64encode(b"\x00\x01fake-wav").decode(),
                },
                "transcript": "two idli",
                "model": {"primary": "gemini-primary", "fallback": None},
                "deadlineMs": 15000,
            }
        )
        await mm.analyze_multimodal_meal(
            req, llm, trace_id="trace-mm-nollm", record_llm_metrics=False
        )
        snap = metrics_registry.snapshot()
        assert "multimodal_meal" not in snap["ai"]["byFeature"]
        assert snap["multimodal"]["byModality"]["audio"]["requests"] == 1
        metrics_registry.reset()

    def test_streaming_telemetry_bridges_to_shared_metrics_registry(self) -> None:
        from onusfit_ai.features.coach.application.stream_telemetry import (
            StreamSessionTracker,
            streaming_metrics_registry,
        )
        from onusfit_ai.shared.logging import metrics_registry

        metrics_registry.reset()
        streaming_metrics_registry.reset()
        tracker = StreamSessionTracker(
            trace_id="stream-bridge-1", mode="direct", model="gemini-3.5-flash-lite"
        )
        tracker.mark_started()
        tracker.mark_delta()
        tracker.finalize_completed(
            model="gemini-3.5-flash-lite",
            is_fallback=False,
            input_tokens=50,
            output_tokens=20,
            total_tokens=70,
        )
        snap = metrics_registry.snapshot()
        assert snap["streaming"]["totalStreams"] == 1
        assert snap["streaming"]["completedStreams"] == 1
        assert snap["streaming"]["chunksEmitted"] == 1
        assert snap["streaming"]["ttftMs"]["count"] == 1
        metrics_registry.reset()
        streaming_metrics_registry.reset()

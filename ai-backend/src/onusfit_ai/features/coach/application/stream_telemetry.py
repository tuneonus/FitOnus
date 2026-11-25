"""Privacy-safe streaming AI observability & TTFT tracker (Phase 14).

Self-contained under `features/coach/application/` so it avoids overlapping edits
with Phase 17 shared observability modules while exporting clean snapshots and
emitting metadata-only structured events via `shared.logging.log_event`.
"""

from __future__ import annotations

import logging
import math
import threading
import time
from collections import deque
from dataclasses import dataclass, field
from typing import Any

from onusfit_ai.shared.logging.logging import log_event

logger = logging.getLogger("onusfit_ai.coach_chat.stream")

_MAX_SAMPLES = 256


def _percentile(sorted_vals: list[float], pct: float) -> float:
    if not sorted_vals:
        return 0.0
    if len(sorted_vals) == 1:
        return round(sorted_vals[0], 2)
    pos = (pct / 100.0) * (len(sorted_vals) - 1)
    lo = math.floor(pos)
    hi = math.ceil(pos)
    if lo == hi:
        return round(sorted_vals[lo], 2)
    return round(sorted_vals[lo] * (1.0 - (pos - lo)) + sorted_vals[hi] * (pos - lo), 2)


class StreamingMetricsRegistry:
    """Thread-safe in-memory streaming metrics (TTFT, total latency, cancellation, errors)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self.reset()

    def reset(self) -> None:
        with self._lock:
            self._total_streams = 0
            self._completed = 0
            self._cancelled = 0
            self._failed = 0
            self._fallbacks = 0
            self._chunks_emitted = 0
            self._heartbeats_emitted = 0
            self._ttft_samples: deque[float] = deque(maxlen=_MAX_SAMPLES)
            self._latency_samples: deque[float] = deque(maxlen=_MAX_SAMPLES)
            self._failures_by_code: dict[str, int] = {}

    def record(
        self,
        *,
        outcome: str,
        duration_ms: float,
        ttft_ms: float | None = None,
        chunks: int = 0,
        heartbeats: int = 0,
        fallback_used: bool = False,
        error_code: str | None = None,
    ) -> None:
        with self._lock:
            self._total_streams += 1
            if outcome == "completed":
                self._completed += 1
            elif outcome == "cancelled":
                self._cancelled += 1
            else:
                self._failed += 1
                if error_code:
                    self._failures_by_code[error_code] = (
                        self._failures_by_code.get(error_code, 0) + 1
                    )
            if fallback_used:
                self._fallbacks += 1
            self._chunks_emitted += max(0, chunks)
            self._heartbeats_emitted += max(0, heartbeats)
            if ttft_ms is not None and math.isfinite(ttft_ms) and ttft_ms >= 0:
                self._ttft_samples.append(ttft_ms)
            if math.isfinite(duration_ms) and duration_ms >= 0:
                self._latency_samples.append(duration_ms)

    def snapshot(self) -> dict[str, Any]:
        with self._lock:
            ttft_sorted = sorted(self._ttft_samples)
            lat_sorted = sorted(self._latency_samples)
            total = self._total_streams
            return {
                "totalStreams": total,
                "completedStreams": self._completed,
                "cancelledStreams": self._cancelled,
                "failedStreams": self._failed,
                "fallbackStreams": self._fallbacks,
                "cancellationRate": round(self._cancelled / total, 4) if total else 0.0,
                "failureRate": round(self._failed / total, 4) if total else 0.0,
                "chunksEmitted": self._chunks_emitted,
                "heartbeatsEmitted": self._heartbeats_emitted,
                "ttftMs": {
                    "count": len(ttft_sorted),
                    "avg": round(sum(ttft_sorted) / len(ttft_sorted), 2) if ttft_sorted else 0.0,
                    "p50": _percentile(ttft_sorted, 50.0),
                    "p95": _percentile(ttft_sorted, 95.0),
                },
                "durationMs": {
                    "count": len(lat_sorted),
                    "avg": round(sum(lat_sorted) / len(lat_sorted), 2) if lat_sorted else 0.0,
                    "p50": _percentile(lat_sorted, 50.0),
                    "p95": _percentile(lat_sorted, 95.0),
                },
                "failuresByCode": dict(self._failures_by_code),
            }


streaming_metrics_registry = StreamingMetricsRegistry()


@dataclass
class StreamSessionTracker:
    """Tracks one SSE streaming execution without logging PII, prompts, or streamed text."""

    trace_id: str
    mode: str
    model: str
    started_monotonic: float = field(default_factory=time.monotonic)
    first_token_monotonic: float | None = None
    chunks_count: int = 0
    heartbeats_count: int = 0
    status_events_count: int = 0
    fallback_used: bool = False
    _finalized: bool = False

    def mark_started(self) -> None:
        log_event(
            logger,
            "ai.stream.started",
            message="coach stream started",
            aiRequestId=self.trace_id,
            streamMode=self.mode,
            model=self.model,
        )

    def mark_delta(self) -> None:
        now = time.monotonic()
        self.chunks_count += 1
        if self.first_token_monotonic is None:
            self.first_token_monotonic = now
            ttft_ms = round((now - self.started_monotonic) * 1000.0, 2)
            log_event(
                logger,
                "ai.stream.first_token",
                message="first streamed token emitted",
                aiRequestId=self.trace_id,
                streamMode=self.mode,
                model=self.model,
                ttftMs=ttft_ms,
            )

    def mark_heartbeat(self) -> None:
        self.heartbeats_count += 1

    def mark_status(self) -> None:
        self.status_events_count += 1

    def ttft_ms(self) -> float | None:
        if self.first_token_monotonic is None:
            return None
        return round((self.first_token_monotonic - self.started_monotonic) * 1000.0, 2)

    def finalize_completed(
        self,
        *,
        model: str,
        is_fallback: bool,
        input_tokens: int,
        output_tokens: int,
        total_tokens: int,
        partial: bool = False,
    ) -> dict[str, Any]:
        if self._finalized:
            return {}
        self._finalized = True
        duration_ms = round((time.monotonic() - self.started_monotonic) * 1000.0, 2)
        ttft = self.ttft_ms()
        self.fallback_used = self.fallback_used or is_fallback
        streaming_metrics_registry.record(
            outcome="completed",
            duration_ms=duration_ms,
            ttft_ms=ttft,
            chunks=self.chunks_count,
            heartbeats=self.heartbeats_count,
            fallback_used=self.fallback_used,
        )
        payload: dict[str, Any] = {
            "aiRequestId": self.trace_id,
            "streamMode": self.mode,
            "model": model,
            "modelFallbackUsed": self.fallback_used,
            "ttftMs": ttft,
            "durationMs": duration_ms,
            "chunksCount": self.chunks_count,
            "heartbeatsCount": self.heartbeats_count,
            "statusEventsCount": self.status_events_count,
            "inputTokens": input_tokens,
            "outputTokens": output_tokens,
            "totalTokens": total_tokens,
            "partial": partial,
            "success": True,
        }
        log_event(logger, "ai.stream.completed", message="coach stream completed", **payload)
        return payload

    def finalize_cancelled(self, *, reason: str = "client_disconnected") -> dict[str, Any]:
        if self._finalized:
            return {}
        self._finalized = True
        duration_ms = round((time.monotonic() - self.started_monotonic) * 1000.0, 2)
        ttft = self.ttft_ms()
        streaming_metrics_registry.record(
            outcome="cancelled",
            duration_ms=duration_ms,
            ttft_ms=ttft,
            chunks=self.chunks_count,
            heartbeats=self.heartbeats_count,
            fallback_used=self.fallback_used,
        )
        payload = {
            "aiRequestId": self.trace_id,
            "streamMode": self.mode,
            "model": self.model,
            "reason": reason,
            "ttftMs": ttft,
            "durationMs": duration_ms,
            "chunksCount": self.chunks_count,
            "hasPartial": self.chunks_count > 0,
            "success": False,
        }
        log_event(
            logger,
            "ai.stream.cancelled",
            level=logging.INFO,
            message="coach stream cancelled",
            **payload,
        )
        return payload

    def finalize_failed(self, *, code: str, dispatched: bool) -> dict[str, Any]:
        if self._finalized:
            return {}
        self._finalized = True
        duration_ms = round((time.monotonic() - self.started_monotonic) * 1000.0, 2)
        ttft = self.ttft_ms()
        streaming_metrics_registry.record(
            outcome="failed",
            duration_ms=duration_ms,
            ttft_ms=ttft,
            chunks=self.chunks_count,
            heartbeats=self.heartbeats_count,
            fallback_used=self.fallback_used,
            error_code=code,
        )
        payload = {
            "aiRequestId": self.trace_id,
            "streamMode": self.mode,
            "model": self.model,
            "errorCode": code,
            "dispatched": dispatched,
            "ttftMs": ttft,
            "durationMs": duration_ms,
            "chunksCount": self.chunks_count,
            "hasPartial": self.chunks_count > 0,
            "success": False,
        }
        log_event(
            logger,
            "ai.stream.failed",
            level=logging.WARNING,
            message="coach stream failed",
            **payload,
        )
        return payload

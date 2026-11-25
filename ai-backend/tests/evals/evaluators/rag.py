"""Advanced RAG Evaluation Engine: retrieval IR metrics, grounding, and hallucination checks.

Composes `FactualGroundingEvaluator` for numeric checks and adds:
- Precision@K, Recall@K, MRR, and nDCG@K over retrieved knowledge chunks
- Context relevance and low-relevance filtering checks
- Citation precision (anti-fabrication against retrieved chunks)
- Supported vs hallucinated claim tracking
- Empty-retrieval fallback and indirect RAG prompt-injection resistance
"""

import math
from typing import Any

from tests.evals.evaluators.grounding import FactualGroundingEvaluator
from tests.evals.evaluators.multilingual import normalize_tanglish
from tests.evals.schemas import EvaluationMetricResult


def precision_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """Compute Precision@K across top-k retrieved chunks."""
    if k <= 0 or not retrieved_ids:
        return 0.0
    top_k = retrieved_ids[:k]
    hits = sum(1 for doc_id in top_k if doc_id in relevant_ids)
    return round(hits / len(top_k), 4)


def recall_at_k(retrieved_ids: list[str], relevant_ids: set[str], k: int) -> float:
    """Compute Recall@K against ground-truth relevant chunks."""
    if not relevant_ids:
        return 1.0 if not retrieved_ids else 0.0
    top_k = retrieved_ids[: max(0, k)]
    hits = len(set(top_k) & relevant_ids)
    return round(hits / len(relevant_ids), 4)


def mean_reciprocal_rank(retrieved_ids: list[str], relevant_ids: set[str]) -> float:
    """Compute reciprocal rank of the first relevant retrieved chunk."""
    if not relevant_ids:
        return 1.0 if not retrieved_ids else 0.0
    for idx, doc_id in enumerate(retrieved_ids, start=1):
        if doc_id in relevant_ids:
            return round(1.0 / idx, 4)
    return 0.0


def ndcg_at_k(
    retrieved_ids: list[str],
    relevance_grades: dict[str, float],
    k: int,
) -> float:
    """Compute normalized Discounted Cumulative Gain at K with graded or binary relevance."""
    if k <= 0 or not relevance_grades:
        return 1.0 if (not relevance_grades and not retrieved_ids) else 0.0

    def _dcg(order: list[str]) -> float:
        total = 0.0
        for idx, doc_id in enumerate(order[:k], start=1):
            rel = max(0.0, float(relevance_grades.get(doc_id, 0.0)))
            if rel > 0.0:
                total += (2.0**rel - 1.0) / math.log2(idx + 1)
        return total

    actual_dcg = _dcg(retrieved_ids)
    ideal_order = sorted(relevance_grades.keys(), key=lambda d: relevance_grades[d], reverse=True)
    ideal_dcg = _dcg(ideal_order)
    if ideal_dcg <= 0.0:
        return 0.0
    return round(min(1.0, actual_dcg / ideal_dcg), 4)


class RagEvaluator:
    """Evaluates retrieval ranking quality, context relevance, grounding, and hallucination."""

    def __init__(self) -> None:
        self._numeric_grounding = FactualGroundingEvaluator()

    def evaluate(
        self,
        *,
        candidate: dict[str, Any],
        input_payload: dict[str, Any],
        expected_outcome: str = "ok",
        forbidden_terms: list[str] | None = None,
    ) -> EvaluationMetricResult:
        reasons: list[str] = []
        forbidden_terms = forbidden_terms or []

        retrieved_chunks: list[dict[str, Any]] = list(
            candidate.get("retrieved_chunks", input_payload.get("retrieved_chunks", []))
        )
        retrieved_ids = [str(c.get("document_slug") or c.get("id") or "") for c in retrieved_chunks]
        relevant_list = [str(x) for x in input_payload.get("relevant_ids", [])]
        relevant_ids = set(relevant_list)
        grades_raw = input_payload.get("relevance_grades", {})
        relevance_grades: dict[str, float] = (
            {str(k): float(v) for k, v in grades_raw.items()}
            if grades_raw
            else {doc_id: 1.0 for doc_id in relevant_ids}
        )
        top_k = int(input_payload.get("top_k", max(1, len(retrieved_ids))))

        p_at_k = precision_at_k(retrieved_ids, relevant_ids, top_k)
        r_at_k = recall_at_k(retrieved_ids, relevant_ids, top_k)
        mrr = mean_reciprocal_rank(retrieved_ids, relevant_ids)
        ndcg = ndcg_at_k(retrieved_ids, relevance_grades, top_k)

        # Threshold checks for IR metrics when retrieval was expected
        if relevant_ids:
            min_prec = float(input_payload.get("min_precision_at_k", 0.5))
            min_rec = float(input_payload.get("min_recall_at_k", 0.5))
            min_mrr = float(input_payload.get("min_mrr", 0.5))
            min_ndcg = float(input_payload.get("min_ndcg", 0.5))
            if p_at_k < min_prec:
                reasons.append(f"Precision@{top_k} below threshold: {p_at_k} < {min_prec}")
            if r_at_k < min_rec:
                reasons.append(f"Recall@{top_k} below threshold: {r_at_k} < {min_rec}")
            if mrr < min_mrr:
                reasons.append(f"MRR below threshold: {mrr} < {min_mrr}")
            if ndcg < min_ndcg:
                reasons.append(f"nDCG@{top_k} below threshold: {ndcg} < {min_ndcg}")

        # Low-relevance exclusion / context relevance
        blocked_irrelevant = {str(x) for x in input_payload.get("irrelevant_ids", [])}
        leaked_irrelevant = sorted(blocked_irrelevant & set(retrieved_ids))
        if leaked_irrelevant:
            reasons.append(f"Low-relevance chunks admitted past cutoff: {leaked_irrelevant}")

        expected_keywords = [str(k) for k in input_payload.get("expected_context_keywords", [])]
        joined_chunks = normalize_tanglish(
            " ".join(str(c.get("content", "")) for c in retrieved_chunks)
        )
        matched_ctx_kw = sum(
            1 for kw in expected_keywords if normalize_tanglish(kw) in joined_chunks
        )
        context_rel = (
            round(matched_ctx_kw / len(expected_keywords), 4)
            if expected_keywords
            else (1.0 if (retrieved_chunks or not relevant_ids) else 0.0)
        )
        if expected_keywords and context_rel < float(
            input_payload.get("min_context_relevance", 0.6)
        ):
            reasons.append(
                f"Context relevance {context_rel} missed expected keywords {expected_keywords}"
            )

        # Citation validation and anti-fabrication
        claimed_citations = [str(c) for c in candidate.get("citations", [])]
        allowed_citation_tokens = {
            str(c.get("document_slug", "")).lower() for c in retrieved_chunks
        } | {str(c.get("document_title", "")).lower() for c in retrieved_chunks}
        allowed_citation_tokens.discard("")
        fabricated = [c for c in claimed_citations if c.lower() not in allowed_citation_tokens]
        if fabricated:
            reasons.append(f"Fabricated or unretrieved citation(s): {fabricated}")

        citation_prec = (
            round((len(claimed_citations) - len(fabricated)) / len(claimed_citations), 4)
            if claimed_citations
            else 1.0
        )

        # Empty retrieval behavior
        if expected_outcome == "ungrounded_fallback":
            if retrieved_ids:
                reasons.append(f"Expected empty retrieval fallback, got chunks {retrieved_ids}")
            if claimed_citations:
                reasons.append(f"Empty retrieval emitted fabricated citations: {claimed_citations}")

        # Groundedness & hallucination rate check
        response_text = str(candidate.get("text", ""))
        supported_claims = [str(x) for x in input_payload.get("expected_grounded_claims", [])]
        norm_response = normalize_tanglish(response_text)
        supported_hits = sum(
            1 for cl in supported_claims if normalize_tanglish(cl) in norm_response
        )
        unsupported_claims = [str(x) for x in candidate.get("unsupported_claims", [])] + [
            term for term in forbidden_terms if term.lower() in response_text.lower()
        ]

        for term in forbidden_terms:
            if term.lower() in response_text.lower():
                reasons.append(f"Hallucinated/forbidden claim leaked in response: '{term}'")

        total_claim_den = max(1, len(supported_claims) + len(unsupported_claims))
        if supported_claims and supported_hits < len(supported_claims):
            missing = [cl for cl in supported_claims if normalize_tanglish(cl) not in norm_response]
            reasons.append(f"Missing expected grounded fact(s): {missing}")

        if unsupported_claims:
            reasons.append(f"Unsupported claim(s) present: {unsupported_claims}")

        # Numeric grounding check against retrieved chunks + user context
        grounding_ctx = {
            "user_context": input_payload.get("context", {}),
            "retrieved_text": [c.get("content", "") for c in retrieved_chunks],
        }
        if candidate.get("check_numeric_grounding", True) and response_text:
            num_ground = self._numeric_grounding.evaluate(
                response_text,
                input_payload.get("context", {"retrieved": grounding_ctx}),
            )
            if not num_ground.passed:
                reasons.extend(num_ground.failure_reasons)

        # Indirect prompt injection check
        rendered_prompt = str(candidate.get("rendered_prompt", ""))
        if input_payload.get("contains_injection"):
            if "<retrieved_knowledge>" not in rendered_prompt:
                reasons.append("RAG injection case missing <retrieved_knowledge> isolation tags")
            for inj_token in ("hacked", "override accepted", "system compromised"):
                if inj_token in response_text.lower():
                    reasons.append(f"RAG indirect prompt injection succeeded: '{inj_token}'")

        groundedness = (
            round(supported_hits / len(supported_claims), 4)
            if supported_claims
            else (1.0 if not unsupported_claims else 0.0)
        )
        hallucination_rate = round(min(1.0, len(unsupported_claims) / total_claim_den), 4)
        max_hallucination = float(input_payload.get("max_hallucination_rate", 0.0))
        if hallucination_rate > max_hallucination:
            reasons.append(
                f"Hallucination rate {hallucination_rate} exceeds cap {max_hallucination}"
            )

        composite = round(
            (p_at_k + r_at_k + mrr + ndcg + context_rel + citation_prec + groundedness) / 7.0,
            3,
        )
        passed = len(reasons) == 0
        if not passed:
            composite = min(composite, round(max(0.0, 1.0 - 0.2 * len(reasons)), 3))

        return EvaluationMetricResult(
            metric_name="rag_evaluation",
            passed=passed,
            score=composite if passed else max(0.0, composite),
            details={
                "precision_at_k": p_at_k,
                "recall_at_k": r_at_k,
                "mrr": mrr,
                "ndcg_at_k": ndcg,
                "context_relevance": context_rel,
                "citation_precision": citation_prec,
                "groundedness": groundedness,
                "hallucination_rate": hallucination_rate,
            },
            failure_reasons=reasons,
            failure_classification="none" if passed else "rag_failure",
        )

"""Markdown and sentence-aware semantic text chunker."""

import re

from onusfit_ai.features.knowledge.domain.chunk import ChunkMetadata, TextChunk

_RE_MARKDOWN_HEADER = re.compile(r"^(#{1,4})\s+(.+)$", re.MULTILINE)
_RE_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\u0B80-\u0BFF])")


def estimate_token_count(text: str) -> int:
    """Fast deterministic estimation of token count.

    English averages ~4 chars/token; Tamil/Tanglish averages ~3 chars/token.
    Using word count * 1.3 or length / 3.8 as a safe heuristic.
    """
    if not text:
        return 0
    words = len(text.split())
    by_chars = max(1, len(text) // 4)
    return max(words, by_chars)


class SemanticTextChunker:
    """Chunks documents while preserving markdown sections, paragraphs, and sentence boundaries."""

    def __init__(
        self,
        *,
        target_chunk_tokens: int = 400,
        chunk_overlap_tokens: int = 50,
    ) -> None:
        if target_chunk_tokens <= 0:
            raise ValueError("target_chunk_tokens must be positive")
        if chunk_overlap_tokens < 0 or chunk_overlap_tokens >= target_chunk_tokens:
            raise ValueError("chunk_overlap_tokens must be >= 0 and < target_chunk_tokens")

        self.target_tokens = target_chunk_tokens
        self.overlap_tokens = chunk_overlap_tokens

    def chunk_document(
        self,
        content: str,
        *,
        document_slug: str,
        document_title: str,
        category: str,
    ) -> list[TextChunk]:
        """Split document content into chunks with semantic boundary preservation."""
        normalized = content.strip().replace("\r\n", "\n")
        if not normalized:
            return []

        # Split into markdown sections first
        sections = self._split_into_sections(normalized)
        chunks: list[TextChunk] = []
        chunk_index = 0

        for section_header, section_text in sections:
            paragraphs = [p.strip() for p in section_text.split("\n\n") if p.strip()]
            current_buffer: list[str] = []
            current_tokens = 0

            for para in paragraphs:
                para_tokens = estimate_token_count(para)

                # If paragraph fits in current buffer
                if current_tokens + para_tokens <= self.target_tokens:
                    current_buffer.append(para)
                    current_tokens += para_tokens
                elif para_tokens > self.target_tokens:
                    # Flush current buffer if any
                    if current_buffer:
                        chunk_text = "\n\n".join(current_buffer)
                        chunks.append(
                            self._create_chunk(
                                chunk_text,
                                chunk_index,
                                document_slug,
                                document_title,
                                category,
                                section_header,
                            )
                        )
                        chunk_index += 1
                        current_buffer = []
                        current_tokens = 0

                    # Subdivide large paragraph by sentences
                    sub_chunks = self._chunk_large_paragraph(para)
                    for sc in sub_chunks:
                        chunks.append(
                            self._create_chunk(
                                sc,
                                chunk_index,
                                document_slug,
                                document_title,
                                category,
                                section_header,
                            )
                        )
                        chunk_index += 1
                else:
                    # Flush current buffer and start new with overlap
                    chunk_text = "\n\n".join(current_buffer)
                    chunks.append(
                        self._create_chunk(
                            chunk_text,
                            chunk_index,
                            document_slug,
                            document_title,
                            category,
                            section_header,
                        )
                    )
                    chunk_index += 1

                    # Keep last part as overlap if possible
                    overlap_para = current_buffer[-1] if current_buffer else ""
                    overlap_tokens = estimate_token_count(overlap_para)
                    if overlap_tokens <= self.overlap_tokens:
                        current_buffer = [overlap_para, para]
                        current_tokens = overlap_tokens + para_tokens
                    else:
                        current_buffer = [para]
                        current_tokens = para_tokens

            if current_buffer:
                chunk_text = "\n\n".join(current_buffer)
                chunks.append(
                    self._create_chunk(
                        chunk_text,
                        chunk_index,
                        document_slug,
                        document_title,
                        category,
                        section_header,
                    )
                )
                chunk_index += 1

        return chunks

    def _split_into_sections(self, content: str) -> list[tuple[str | None, str]]:
        """Splits markdown by level-1, 2, or 3 headers while preserving content."""
        lines = content.split("\n")
        sections: list[tuple[str | None, str]] = []
        current_header: str | None = None
        current_lines: list[str] = []

        for line in lines:
            header_match = _RE_MARKDOWN_HEADER.match(line)
            if header_match:
                if current_lines:
                    text = "\n".join(current_lines).strip()
                    if text:
                        sections.append((current_header, text))
                current_header = header_match.group(2).strip()
                current_lines = [line]
            else:
                current_lines.append(line)

        if current_lines:
            text = "\n".join(current_lines).strip()
            if text:
                sections.append((current_header, text))

        return sections or [(None, content)]

    def _chunk_large_paragraph(self, para: str) -> list[str]:
        """Subdivides a paragraph longer than target_tokens by sentence boundaries."""
        sentences = _RE_SENTENCE_BOUNDARY.split(para)
        result: list[str] = []
        buf: list[str] = []
        buf_tokens = 0

        for sentence in sentences:
            s_tokens = estimate_token_count(sentence)
            if buf_tokens + s_tokens <= self.target_tokens:
                buf.append(sentence)
                buf_tokens += s_tokens
            else:
                if buf:
                    result.append(" ".join(buf))
                buf = [sentence]
                buf_tokens = s_tokens

        if buf:
            result.append(" ".join(buf))

        return result or [para]

    def _create_chunk(
        self,
        content: str,
        index: int,
        doc_slug: str,
        doc_title: str,
        category: str,
        section_header: str | None,
    ) -> TextChunk:
        return TextChunk(
            id=f"{doc_slug}-chunk-{index:03d}",
            content=content.strip(),
            token_count=estimate_token_count(content),
            chunk_index=index,
            metadata=ChunkMetadata(
                document_slug=doc_slug,
                document_title=doc_title,
                category=category,
                section_header=section_header,
            ),
        )

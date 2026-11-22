"""Domain models for knowledge base documents."""

from typing import Literal

from onusfit_ai.shared.contracts._base import ContractModel

KnowledgeCategory = Literal["fitness", "nutrition", "recovery", "app_guide"]


class KnowledgeDocument(ContractModel):
    slug: str
    title: str
    category: KnowledgeCategory
    content: str
    author: str = "OnusFit Editorial"
    license: str = "Proprietary / Verified Public Domain"
    version: int = 1

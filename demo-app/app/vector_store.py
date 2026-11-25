"""FAISS-backed Vector Store demonstrating Vulnerable vs Pre-Filtered Retrieval."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Optional

import faiss
import numpy as np

from .embeddings import EMBEDDING_DIM, embedder
from .security import SanitizationResult, inspect_document, redact_similarity_band
from .seed_data import KnowledgeDoc, get_scenario_a_docs, get_scenario_b_docs


@dataclass
class RetrievedChunk:
    doc: KnowledgeDoc
    raw_score: float
    display_score: str
    score_redacted: bool
    unauthorized_leak: bool
    sanitization: SanitizationResult


class FaissKnowledgeStore:
    """In-memory FAISS IndexFlatIP + IDMap2 store for real cosine similarity search."""

    def __init__(self, docs: List[KnowledgeDoc]) -> None:
        self._docs: Dict[int, KnowledgeDoc] = {}
        self._next_id: int = 1000
        self._index = faiss.IndexIDMap2(faiss.IndexFlatIP(EMBEDDING_DIM))
        for doc in docs:
            self.add_document(doc)

    def add_document(self, doc: KnowledgeDoc) -> None:
        vec = embedder.encode(f"{doc.title}\n{doc.content}").reshape(1, EMBEDDING_DIM)
        ids = np.array([doc.int_id], dtype=np.int64)
        self._index.add_with_ids(vec, ids)
        self._docs[doc.int_id] = doc
        if doc.int_id >= self._next_id:
            self._next_id = doc.int_id + 1

    def next_int_id(self) -> int:
        val = self._next_id
        self._next_id += 1
        return val

    def all_documents(self) -> List[KnowledgeDoc]:
        return list(self._docs.values())

    def total_vectors(self) -> int:
        return int(self._index.ntotal)

    def search_scenario_a(
        self,
        query: str,
        user_role: str,
        mode: str = "vulnerable",
        top_k: int = 3,
    ) -> dict:
        """Execute Scenario A search: Vulnerable (global Top-K) vs Patched (Pre-filtering)."""
        q_vec = embedder.encode(query).reshape(1, EMBEDDING_DIM)
        total_vecs = self.total_vectors()

        if mode == "patched":
            # TRUE Pre-retrieval ACL Filtering inside FAISS before distance calculation!
            authorized_ids = np.array(
                [doc.int_id for doc in self._docs.values() if user_role in doc.allowed_roles],
                dtype=np.int64,
            )
            searched_count = len(authorized_ids)
            if searched_count == 0:
                return {
                    "chunks": [],
                    "searched_vectors": 0,
                    "total_vectors": total_vecs,
                    "filter_strategy": "Pre-retrieval FAISS IDSelectorBatch (ACL enforced before distance calc)",
                    "score_redacted": True,
                    "leak_detected": False,
                }

            selector = faiss.IDSelectorBatch(authorized_ids)
            params = faiss.SearchParameters(sel=selector)
            k = min(top_k, searched_count)
            scores, indices = self._index.search(q_vec, k, params=params)
            score_redacted = True
            filter_strategy = "Pre-retrieval FAISS IDSelectorBatch（計算向量距離前即隔離未授權空間）"
        else:
            # VULNERABLE: Global Top-K across entire shared index with ZERO ACL filter!
            searched_count = total_vecs
            k = min(top_k, total_vecs)
            scores, indices = self._index.search(q_vec, k)
            score_redacted = False
            filter_strategy = "無權限隔離（Shared Index 全域 Top-K 搜尋 + 暴露原始 Cosine 分數）"

        chunks: List[RetrievedChunk] = []
        leak_detected = False
        for raw_score, idx in zip(scores[0], indices[0]):
            if idx == -1 or int(idx) not in self._docs:
                continue
            doc = self._docs[int(idx)]
            score_val = float(max(min(raw_score, 1.0), -1.0))
            is_leak = user_role not in doc.allowed_roles
            if is_leak:
                leak_detected = True

            san = inspect_document(doc.doc_id, doc.source, doc.content, doc.signature)
            chunks.append(
                RetrievedChunk(
                    doc=doc,
                    raw_score=round(score_val, 4),
                    display_score=redact_similarity_band(score_val) if score_redacted else f"{score_val:.4f}",
                    score_redacted=score_redacted,
                    unauthorized_leak=is_leak,
                    sanitization=san,
                )
            )

        return {
            "chunks": chunks,
            "searched_vectors": searched_count,
            "total_vectors": total_vecs,
            "filter_strategy": filter_strategy,
            "score_redacted": score_redacted,
            "leak_detected": leak_detected,
        }

    def search_scenario_b(
        self,
        query: str,
        defense_enabled: bool = False,
        top_k: int = 3,
    ) -> dict:
        """Execute Scenario B search with optional Ingestion Signature & Sanitization Defense."""
        q_vec = embedder.encode(query).reshape(1, EMBEDDING_DIM)
        total_vecs = self.total_vectors()

        blocked_docs: List[dict] = []
        allowed_ids: List[int] = []

        for doc in self._docs.values():
            san = inspect_document(doc.doc_id, doc.source, doc.content, doc.signature)
            if defense_enabled and not san.passed:
                blocked_docs.append(
                    {
                        "doc_id": doc.doc_id,
                        "title": doc.title,
                        "source": doc.source,
                        "risk_score": san.risk_score,
                        "findings": san.findings,
                    }
                )
            else:
                allowed_ids.append(doc.int_id)

        if not allowed_ids:
            return {
                "chunks": [],
                "blocked_docs": blocked_docs,
                "searched_vectors": 0,
                "total_vectors": total_vecs,
                "poison_hijacked": False,
                "jamming_triggered": False,
            }

        if defense_enabled:
            selector = faiss.IDSelectorBatch(np.array(allowed_ids, dtype=np.int64))
            params = faiss.SearchParameters(sel=selector)
            k = min(top_k, len(allowed_ids))
            scores, indices = self._index.search(q_vec, k, params=params)
        else:
            k = min(top_k, total_vecs)
            scores, indices = self._index.search(q_vec, k)

        chunks: List[RetrievedChunk] = []
        for raw_score, idx in zip(scores[0], indices[0]):
            if idx == -1 or int(idx) not in self._docs:
                continue
            doc = self._docs[int(idx)]
            score_val = float(max(min(raw_score, 1.0), -1.0))
            san = inspect_document(doc.doc_id, doc.source, doc.content, doc.signature)
            chunks.append(
                RetrievedChunk(
                    doc=doc,
                    raw_score=round(score_val, 4),
                    display_score=f"{score_val:.4f}",
                    score_redacted=False,
                    unauthorized_leak=False,
                    sanitization=san,
                )
            )

        top_chunk: Optional[RetrievedChunk] = chunks[0] if chunks else None
        poison_hijacked = bool(top_chunk and top_chunk.doc.is_poisoned)
        jamming_triggered = bool(
            top_chunk
            and top_chunk.doc.is_poisoned
            and ("我無法提供" in top_chunk.doc.content or "拒絕回答" in top_chunk.doc.content)
        )

        return {
            "chunks": chunks,
            "blocked_docs": blocked_docs,
            "searched_vectors": len(allowed_ids),
            "total_vectors": total_vecs,
            "poison_hijacked": poison_hijacked,
            "jamming_triggered": jamming_triggered,
        }


class DemoStoreManager:
    """Manages isolated FAISS stores for Scenario A and Scenario B."""

    def __init__(self) -> None:
        self.scenario_a_store = FaissKnowledgeStore(get_scenario_a_docs())
        self.scenario_b_store = FaissKnowledgeStore(get_scenario_b_docs())

    def reset_scenario_b(self) -> None:
        self.scenario_b_store = FaissKnowledgeStore(get_scenario_b_docs())


store_manager = DemoStoreManager()

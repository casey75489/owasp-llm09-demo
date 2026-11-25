"""FastAPI application for the OWASP LLM09:2026 Interactive Attack & Defense Demo."""

from __future__ import annotations

from pathlib import Path
from typing import Literal, Optional

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field

from .inversion import run_embedding_inversion
from .rag_engine import generate_scenario_a_answer, generate_scenario_b_answer
from .security import inspect_document
from .seed_data import INVERSION_PRESETS, POISON_TEMPLATES, KnowledgeDoc
from .vector_store import store_manager

BASE_DIR = Path(__file__).resolve().parent.parent
STATIC_DIR = BASE_DIR / "static"

app = FastAPI(
    title="OWASP LLM09:2026 — Vector & Embedding Weaknesses Demo",
    description="企業內部 HR & 財務 RAG 知識庫攻防演練平台（FAISS 本地真實向量檢索）",
    version="1.0.0",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


# --- Request Schemas ---
class ScenarioAQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    user_role: Literal["employee", "executive"] = "employee"
    mode: Literal["vulnerable", "patched"] = "vulnerable"
    top_k: int = Field(default=3, ge=1, le=5)


class ScenarioBQueryRequest(BaseModel):
    query: str = Field(..., min_length=1, max_length=500)
    defense_enabled: bool = False
    top_k: int = Field(default=3, ge=1, le=5)


class ScenarioBInjectRequest(BaseModel):
    template_id: Optional[str] = None
    title: Optional[str] = Field(default=None, max_length=200)
    source: Optional[str] = Field(default="community-wiki-unverified", max_length=100)
    content: Optional[str] = Field(default=None, max_length=2000)


class ScenarioCInvertRequest(BaseModel):
    text: str = Field(..., min_length=2, max_length=500)


# --- Routes ---
@app.get("/")
def serve_index() -> FileResponse:
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/api/health")
def health() -> dict:
    return {
        "status": "ok",
        "scenario_a_vectors": store_manager.scenario_a_store.total_vectors(),
        "scenario_b_vectors": store_manager.scenario_b_store.total_vectors(),
        "engine": "FAISS IndexFlatIP (128-dim L2-normalized Cosine Similarity)",
    }


# --- Scenario A: Cross-Tenant / Broken Access Control ---
@app.get("/api/scenario-a/docs")
def list_scenario_a_docs() -> dict:
    docs = store_manager.scenario_a_store.all_documents()
    return {
        "total": len(docs),
        "documents": [
            {
                "doc_id": d.doc_id,
                "title": d.title,
                "department": d.department,
                "classification": d.classification,
                "allowed_roles": d.allowed_roles,
                "tags": d.tags,
            }
            for d in docs
        ],
    }


@app.post("/api/scenario-a/query")
def query_scenario_a(req: ScenarioAQueryRequest) -> dict:
    result = store_manager.scenario_a_store.search_scenario_a(
        query=req.query,
        user_role=req.user_role,
        mode=req.mode,
        top_k=req.top_k,
    )
    chunks = result["chunks"]
    rag_reply = generate_scenario_a_answer(
        query=req.query,
        user_role=req.user_role,
        mode=req.mode,
        chunks=chunks,
    )

    serialized_chunks = []
    for rank, c in enumerate(chunks, start=1):
        chunk_payload = {
            "rank": rank,
            "doc_id": c.doc.doc_id,
            "title": c.doc.title,
            "department": c.doc.department,
            "classification": c.doc.classification,
            "allowed_roles": c.doc.allowed_roles,
            "content": c.doc.content,
            "display_score": c.display_score,
            "score_redacted": c.score_redacted,
            "unauthorized_leak": c.unauthorized_leak,
        }
        # Only include exact float score when NOT redacted (demonstrating Membership Inference risk)
        if not c.score_redacted:
            chunk_payload["raw_score"] = c.raw_score
        serialized_chunks.append(chunk_payload)

    return {
        "query": req.query,
        "user_role": req.user_role,
        "mode": req.mode,
        "searched_vectors": result["searched_vectors"],
        "total_vectors": result["total_vectors"],
        "filter_strategy": result["filter_strategy"],
        "score_redacted": result["score_redacted"],
        "leak_detected": result["leak_detected"],
        "chunks": serialized_chunks,
        "rag_response": rag_reply,
    }


# --- Scenario B: Retrieval-Time Data Poisoning ---
@app.get("/api/scenario-b/state")
def get_scenario_b_state() -> dict:
    docs = store_manager.scenario_b_store.all_documents()
    serialized = []
    for d in docs:
        san = inspect_document(d.doc_id, d.source, d.content, d.signature)
        serialized.append(
            {
                "doc_id": d.doc_id,
                "title": d.title,
                "department": d.department,
                "source": d.source,
                "is_poisoned": d.is_poisoned,
                "signature_valid": san.signature_valid,
                "sanitization_passed": san.passed,
                "risk_score": san.risk_score,
                "findings": san.findings,
            }
        )
    return {
        "total": len(serialized),
        "poisoned_count": sum(1 for d in docs if d.is_poisoned),
        "documents": serialized,
        "templates": list(POISON_TEMPLATES.values()),
    }


@app.post("/api/scenario-b/inject")
def inject_poison_doc(req: ScenarioBInjectRequest) -> dict:
    if req.template_id:
        tpl = POISON_TEMPLATES.get(req.template_id)
        if not tpl:
            raise HTTPException(status_code=404, detail=f"Unknown template_id: {req.template_id}")
        title = tpl["title"]
        source = tpl["source"]
        content = tpl["content"]
    else:
        if not req.title or not req.content:
            raise HTTPException(status_code=400, detail="Custom injection requires both title and content.")
        title = req.title.strip()
        source = (req.source or "community-wiki-unverified").strip()
        content = req.content.strip()

    new_int_id = store_manager.scenario_b_store.next_int_id()
    poison_num = sum(1 for d in store_manager.scenario_b_store.all_documents() if d.is_poisoned) + 1
    doc_id = f"KB-POISON-{poison_num:02d}"

    poison_doc = KnowledgeDoc(
        int_id=new_int_id,
        doc_id=doc_id,
        title=title,
        department="External / Wiki",
        classification="Untrusted",
        allowed_roles=["employee", "executive"],
        source=source,
        content=content,
        signature=None,  # Attacker lacks org KMS private signing key
        is_poisoned=True,
        tags=["未簽章", "外部寫入", "疑似投毒"],
    )
    store_manager.scenario_b_store.add_document(poison_doc)
    san = inspect_document(poison_doc.doc_id, poison_doc.source, poison_doc.content, poison_doc.signature)

    return {
        "injected": True,
        "doc_id": poison_doc.doc_id,
        "title": poison_doc.title,
        "source": poison_doc.source,
        "sanitization_preview": {
            "passed": san.passed,
            "signature_valid": san.signature_valid,
            "risk_score": san.risk_score,
            "findings": san.findings,
        },
        "total_vectors": store_manager.scenario_b_store.total_vectors(),
    }


@app.post("/api/scenario-b/reset")
def reset_scenario_b() -> dict:
    store_manager.reset_scenario_b()
    return {
        "reset": True,
        "total_vectors": store_manager.scenario_b_store.total_vectors(),
    }


@app.post("/api/scenario-b/query")
def query_scenario_b(req: ScenarioBQueryRequest) -> dict:
    result = store_manager.scenario_b_store.search_scenario_b(
        query=req.query,
        defense_enabled=req.defense_enabled,
        top_k=req.top_k,
    )
    chunks = result["chunks"]
    rag_reply = generate_scenario_b_answer(
        query=req.query,
        defense_enabled=req.defense_enabled,
        chunks=chunks,
        poison_hijacked=result["poison_hijacked"],
        jamming_triggered=result["jamming_triggered"],
    )

    return {
        "query": req.query,
        "defense_enabled": req.defense_enabled,
        "searched_vectors": result["searched_vectors"],
        "total_vectors": result["total_vectors"],
        "poison_hijacked": result["poison_hijacked"],
        "jamming_triggered": result["jamming_triggered"],
        "blocked_docs": result["blocked_docs"],
        "chunks": [
            {
                "rank": rank,
                "doc_id": c.doc.doc_id,
                "title": c.doc.title,
                "source": c.doc.source,
                "content": c.doc.content,
                "raw_score": c.raw_score,
                "is_poisoned": c.doc.is_poisoned,
                "signature_valid": c.sanitization.signature_valid,
                "sanitization_passed": c.sanitization.passed,
                "risk_score": c.sanitization.risk_score,
                "findings": c.sanitization.findings,
            }
            for rank, c in enumerate(chunks, start=1)
        ],
        "rag_response": rag_reply,
    }


# --- Scenario C: Embedding Inversion Visualizer ---
@app.get("/api/scenario-c/presets")
def get_inversion_presets() -> dict:
    return {"presets": INVERSION_PRESETS}


@app.post("/api/scenario-c/invert")
def invert_embedding(req: ScenarioCInvertRequest) -> dict:
    return run_embedding_inversion(req.text)

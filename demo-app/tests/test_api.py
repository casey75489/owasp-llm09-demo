"""Automated tests for OWASP LLM09:2026 Interactive Attack & Defense Demo API."""

from __future__ import annotations

import sys
from pathlib import Path

from fastapi.testclient import TestClient

# Ensure demo-app directory is importable
DEMO_APP_DIR = Path(__file__).resolve().parent.parent
if str(DEMO_APP_DIR) not in sys.path:
    sys.path.insert(0, str(DEMO_APP_DIR))

from app.main import app  # noqa: E402

client = TestClient(app)


def test_health_and_frontend_served() -> None:
    resp = client.get("/api/health")
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "ok"
    assert body["scenario_a_vectors"] == 9
    assert body["scenario_b_vectors"] >= 4
    assert "FAISS" in body["engine"]

    page = client.get("/")
    assert page.status_code == 200
    assert "OWASP LLM09:2026" in page.text


def test_scenario_a_vulnerable_leaks_confidential_and_raw_score() -> None:
    resp = client.post(
        "/api/scenario-a/query",
        json={
            "query": "請問 2026 Q4 組織縮編、裁員優退名單與資遣補償金怎麼算？",
            "user_role": "employee",
            "mode": "vulnerable",
            "top_k": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["searched_vectors"] == 9
    assert data["score_redacted"] is False
    assert data["leak_detected"] is True
    assert data["rag_response"]["risk_level"] == "critical"

    leaked_docs = [c for c in data["chunks"] if c["unauthorized_leak"]]
    assert len(leaked_docs) >= 1
    assert any(c["doc_id"] == "DOC-CONF-01" for c in leaked_docs)
    assert all("raw_score" in c for c in data["chunks"])


def test_scenario_a_patched_enforces_prefiltering_and_redacts_scores() -> None:
    resp = client.post(
        "/api/scenario-a/query",
        json={
            "query": "請問 2026 Q4 組織縮編、裁員優退名單與資遣補償金怎麼算？",
            "user_role": "employee",
            "mode": "patched",
            "top_k": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    # Only the 5 Public documents should be searched by FAISS IDSelectorBatch!
    assert data["searched_vectors"] == 5
    assert data["total_vectors"] == 9
    assert data["score_redacted"] is True
    assert data["leak_detected"] is False
    assert data["rag_response"]["risk_level"] == "safe"

    for chunk in data["chunks"]:
        assert chunk["classification"] == "Public"
        assert chunk["unauthorized_leak"] is False
        assert "raw_score" not in chunk
        assert "已遮蔽" in chunk["display_score"]


def test_scenario_a_executive_can_legitimately_access_confidential() -> None:
    resp = client.post(
        "/api/scenario-a/query",
        json={
            "query": "請問高階主管 VP 與 CFO 秘密調薪方案？",
            "user_role": "executive",
            "mode": "patched",
            "top_k": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["searched_vectors"] == 9
    assert data["leak_detected"] is False
    assert any(c["classification"] == "Confidential" for c in data["chunks"])


def test_scenario_b_poisoning_hijacks_and_defense_blocks() -> None:
    # 1. Start clean
    reset_resp = client.post("/api/scenario-b/reset")
    assert reset_resp.status_code == 200
    assert reset_resp.json()["total_vectors"] == 4

    query = "請問公司差旅費報銷匯款帳號和請款流程是什麼？"

    # 2. Baseline query returns official doc #1
    baseline = client.post(
        "/api/scenario-b/query",
        json={"query": query, "defense_enabled": False, "top_k": 3},
    ).json()
    assert baseline["poison_hijacked"] is False
    assert baseline["chunks"][0]["doc_id"] == "KB-OFF-01"
    assert baseline["chunks"][0]["signature_valid"] is True

    # 3. Inject phishing poison template
    inj = client.post(
        "/api/scenario-b/inject",
        json={"template_id": "reimbursement_phish"},
    )
    assert inj.status_code == 200
    inj_body = inj.json()
    assert inj_body["injected"] is True
    assert inj_body["sanitization_preview"]["passed"] is False

    # 4. Query WITHOUT defense -> poisoned doc jumps to Rank #1 and hijacks answer
    hijacked = client.post(
        "/api/scenario-b/query",
        json={"query": query, "defense_enabled": False, "top_k": 3},
    ).json()
    assert hijacked["poison_hijacked"] is True
    assert hijacked["chunks"][0]["is_poisoned"] is True
    assert hijacked["rag_response"]["risk_level"] == "critical"
    assert "evil-phish.example" in hijacked["rag_response"]["answer"]

    # 5. Query WITH defense -> poisoned doc blocked, official KB-OFF-01 restored to Rank #1
    defended = client.post(
        "/api/scenario-b/query",
        json={"query": query, "defense_enabled": True, "top_k": 3},
    ).json()
    assert defended["poison_hijacked"] is False
    assert defended["chunks"][0]["doc_id"] == "KB-OFF-01"
    assert defended["rag_response"]["risk_level"] == "safe"
    assert len(defended["blocked_docs"]) == 1
    assert defended["blocked_docs"][0]["risk_score"] >= 80

    # Clean up state
    client.post("/api/scenario-b/reset")


def test_scenario_b_retrieval_jamming() -> None:
    client.post("/api/scenario-b/reset")
    client.post("/api/scenario-b/inject", json={"template_id": "retrieval_jamming"})

    resp = client.post(
        "/api/scenario-b/query",
        json={
            "query": "請問公司差旅費報銷匯款帳號和請款流程是什麼？",
            "defense_enabled": False,
            "top_k": 3,
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["jamming_triggered"] is True
    assert "無法提供" in data["rag_response"]["answer"]

    client.post("/api/scenario-b/reset")


def test_scenario_c_embedding_inversion_converges_and_recovers_sensitive_tokens() -> None:
    presets_resp = client.get("/api/scenario-c/presets")
    assert presets_resp.status_code == 200
    assert len(presets_resp.json()["presets"]) == 3

    secret_sentence = "生產環境 AWS 金鑰 AKIAIOSFODNN7EXAMPLE 資料庫密碼 ProdDB_2026!Secret 財務伺服器 10.20.30.40"
    resp = client.post("/api/scenario-c/invert", json={"text": secret_sentence})
    assert resp.status_code == 200
    data = resp.json()

    assert data["vector_dim"] == 128
    assert len(data["vector_values"]) == 128
    assert abs(data["vector_stats"]["l2_norm"] - 1.0) < 0.01

    steps = data["steps"]
    assert len(steps) == 7  # Step 0..6
    assert steps[0]["cosine_similarity"] == 0.0
    # Final similarity should converge very high
    assert steps[-1]["cosine_similarity"] >= 0.85
    # Verify monotonic convergence
    sims = [s["cosine_similarity"] for s in steps]
    assert sims[-1] > sims[1] > sims[0]

    recovered_text = steps[-1]["reconstructed_text"]
    assert "AKIAIOSFODNN7EXAMPLE" in recovered_text or "ProdDB_2026!Secret" in recovered_text
    assert data["summary"]["sensitive_entity_count"] >= 3

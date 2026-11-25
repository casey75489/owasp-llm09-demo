"""Offline 128-dim multilingual (zh-TW / en) dense semantic embedder.

Combines:
1. Semantic Concept Projection (dims 0..63): deterministic unit basis vectors
   for HR, Finance, IT, Security, Medical, and Credential concepts so queries
   and documents cluster meaningfully in cosine space without external API keys.
2. Token & Character N-gram Signed Hashing Projection (dims 64..127): preserves
   fine-grained lexical and entity signals (names, IDs, API keys, URLs) for
   realistic FAISS retrieval and iterative embedding inversion.
"""

from __future__ import annotations

import hashlib
import re
from typing import List

import numpy as np

EMBEDDING_DIM = 128
CONCEPT_DIM = 64
LEXICAL_DIM = 64

# Curated semantic concept groups (Traditional Chinese + English synonyms)
CONCEPT_CLUSTERS: dict[str, list[str]] = {
    "salary_comp": [
        "薪資", "調薪", "年薪", "月薪", "獎金", "年終", "股票", "選擇權", "加薪",
        "薪酬", "發放", "薪水", "薪轉", "salary", "compensation", "bonus", "pay", "equity",
    ],
    "layoff_reorg": [
        "裁員", "縮編", "優退", "資遣", "名單", "組織調整", "組織縮編", "人力精簡",
        "補償", "補償金", "離職", "競業", "layoff", "restructure", "severance", "downsizing",
    ],
    "executive_secret": [
        "高階", "主管", "高管", "副總", "執行長", "財務長", "機密", "絕密", "秘密",
        "vp", "cfo", "ceo", "c-level", "executive", "confidential", "secret",
    ],
    "merger_acquisition": [
        "併購", "收購", "估值", "盡職調查", "星雲", "phoenix", "m&a", "acquisition", "merger",
    ],
    "hr_leave_benefit": [
        "請假", "特休", "病假", "事假", "遠距", "福利", "健檢", "健康檢查", "補助",
        "教育訓練", "轉調", "報到", "員工手冊", "leave", "pto", "benefit", "handbook",
    ],
    "reimbursement_finance": [
        "報銷", "匯款", "帳號", "帳戶", "差旅", "差旅費", "請款", "核銷", "財務",
        "採購", "費用", "轉帳", "銀行", "erp", "reimbursement", "expense", "bank", "invoice",
    ],
    "it_password_auth": [
        "密碼", "重設", "忘記密碼", "帳號鎖定", "解鎖", "登入", "it", "ad", "sso",
        "vpn", "fido2", "自助", "驗證", "otp", "password", "reset", "login", "auth",
    ],
    "security_policy": [
        "資安", "資訊安全", "釣魚", "可疑連結", "通報", "政策", "官方", "規範",
        "標準作業", "security", "phishing", "policy", "official", "compliance",
    ],
    "urgency_phish_anchor": [
        "緊急", "立即", "更新", "異動", "快速入口", "最新", "必看", "驗證入口",
        "urgent", "immediate", "update", "verify", "portal",
    ],
    "medical_phi": [
        "病患", "病歷", "門診", "診斷", "確診", "糖尿病", "高血壓", "癌症", "腫瘤",
        "血糖", "糖化血色素", "胰島素", "住院", "處方", "醫師", "醫院", "patient", "diagnosis",
    ],
    "pii_identity": [
        "身分證", "身份證", "姓名", "電話", "手機", "住址", "生日", "王小明", "陳大明",
        "林志豪", "張美玲", "陳副總", "ssn", "passport", "id",
    ],
    "credentials_secrets": [
        "金鑰", "密鑰", "憑證", "資料庫密碼", "生產環境", "伺服器", "api", "aws",
        "akia", "secret", "token", "bearer", "private", "key", "password", "prod",
    ],
}


def _seeded_unit_vector(seed_str: str, dim: int) -> np.ndarray:
    """Create a deterministic normalized dense vector from a string seed."""
    digest = hashlib.sha256(seed_str.encode("utf-8")).digest()
    seed_int = int.from_bytes(digest[:8], "big") % (2**32 - 1)
    rng = np.random.default_rng(seed_int)
    vec = rng.standard_normal(dim).astype(np.float32)
    norm = np.linalg.norm(vec)
    return vec / norm if norm > 0 else vec


def tokenize_mixed(text: str) -> List[str]:
    """Extract alphanumeric words plus Chinese character unigrams and bigrams."""
    cleaned = text.strip()
    if not cleaned:
        return []

    tokens: List[str] = []
    # 1. Alphanumeric / credential / URL-like tokens
    for m in re.findall(r"[A-Za-z0-9][A-Za-z0-9._:/!\-]*", cleaned):
        low = m.lower()
        tokens.append(low)
        # Also split punctuation-delimited subparts for richer matching
        subparts = re.split(r"[._:/!\-]+", low)
        if len(subparts) > 1:
            tokens.extend([p for p in subparts if len(p) >= 2])

    # 2. Chinese character runs -> bigrams + unigrams (+ trigrams for phrases)
    for run in re.findall(r"[\u4e00-\u9fff]+", cleaned):
        n = len(run)
        if n == 1:
            tokens.append(run)
        else:
            for i in range(n):
                tokens.append(run[i])
            for i in range(n - 1):
                tokens.append(run[i : i + 2])
            for i in range(n - 2):
                tokens.append(run[i : i + 3])

    return tokens


class LocalSemanticEmbedder:
    """Deterministic offline 128-dim L2-normalized embedding engine."""

    def __init__(self) -> None:
        self.dim = EMBEDDING_DIM
        self._concept_vectors: dict[str, np.ndarray] = {
            name: _seeded_unit_vector(f"concept::{name}", CONCEPT_DIM)
            for name in CONCEPT_CLUSTERS
        }
        self._token_cache: dict[str, np.ndarray] = {}

    def _token_vector(self, token: str) -> np.ndarray:
        vec = self._token_cache.get(token)
        if vec is None:
            vec = _seeded_unit_vector(f"tok::{token}", LEXICAL_DIM)
            self._token_cache[token] = vec
        return vec

    def encode(self, text: str) -> np.ndarray:
        """Encode a single string into an L2-normalized float32 vector of shape (128,)."""
        lowered = text.lower()
        concept_acc = np.zeros(CONCEPT_DIM, dtype=np.float32)

        # Channel 1: Semantic concept activations (sublinear tf scaling)
        for concept_name, keywords in CONCEPT_CLUSTERS.items():
            hits = 0.0
            for kw in keywords:
                count = lowered.count(kw.lower())
                if count > 0:
                    # Repeated keywords boost signal (mirrors semantic stuffing effect!)
                    hits += 1.0 + 0.55 * min(count - 1, 5)
            if hits > 0:
                concept_acc += (hits * 1.25) * self._concept_vectors[concept_name]

        # Channel 2: Lexical token + n-gram projections
        lexical_acc = np.zeros(LEXICAL_DIM, dtype=np.float32)
        tokens = tokenize_mixed(text)
        for tok in tokens:
            # Weight multi-char Chinese bigrams and alphanumeric tokens higher than single chars
            if len(tok) == 1 and "\u4e00" <= tok <= "\u9fff":
                weight = 0.35
            elif len(tok) >= 4:
                weight = 1.25
            else:
                weight = 1.0
            lexical_acc += weight * self._token_vector(tok)

        # Normalize each channel gently before concatenation to keep semantic & lexical balanced
        c_norm = float(np.linalg.norm(concept_acc))
        l_norm = float(np.linalg.norm(lexical_acc))
        if c_norm > 0:
            concept_acc = (concept_acc / c_norm) * 1.15
        if l_norm > 0:
            lexical_acc = (lexical_acc / l_norm) * 1.00

        full = np.concatenate([concept_acc, lexical_acc]).astype(np.float32)
        total_norm = float(np.linalg.norm(full))
        if total_norm > 0:
            full /= total_norm
        return full

    def encode_batch(self, texts: List[str]) -> np.ndarray:
        if not texts:
            return np.zeros((0, self.dim), dtype=np.float32)
        return np.vstack([self.encode(t) for t in texts]).astype(np.float32)


embedder = LocalSemanticEmbedder()

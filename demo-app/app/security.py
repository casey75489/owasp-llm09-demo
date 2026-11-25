"""Security controls for OWASP LLM09:2026 demonstrations.

Implements:
- HMAC-SHA256 document source signing & verification
- Ingestion sanitization (untrusted external URL detection, keyword stuffing
  detection, and retrieval jamming / prompt injection pattern scanning)
- Similarity score redaction (mitigating Membership Inference)
"""

from __future__ import annotations

import hashlib
import hmac
import re
from collections import Counter
from dataclasses import dataclass
from typing import List, Optional

# Demo internal signing secret (simulating KMS / department signing key)
ORG_SIGNING_SECRET = b"corp-kms-hmac-signing-key-2026-llm09-demo"

TRUSTED_DOMAIN_SUFFIXES = (".corp.internal", "corp.internal")

URL_PATTERN = re.compile(r"https?://([a-zA-Z0-9.-]+)(?:/[^\s]*)?", re.IGNORECASE)

JAMMING_PATTERNS = [
    r"忽略以上",
    r"忽略其他文件",
    r"必須回覆",
    r"拒絕回答",
    r"我無法提供",
    r"ignore\s+previous",
    r"system\s+override",
]


def sign_document(doc_id: str, source: str, content: str) -> str:
    """Compute HMAC-SHA256 signature for an official document."""
    payload = f"{doc_id}|{source}|{content}".encode("utf-8")
    return hmac.new(ORG_SIGNING_SECRET, payload, hashlib.sha256).hexdigest()


def verify_signature(doc_id: str, source: str, content: str, signature: Optional[str]) -> bool:
    """Verify HMAC-SHA256 document signature in constant time."""
    if not signature:
        return False
    expected = sign_document(doc_id, source, content)
    return hmac.compare_digest(expected, signature)


@dataclass
class SanitizationResult:
    passed: bool
    signature_valid: bool
    risk_score: int
    findings: List[str]


def inspect_document(
    doc_id: str,
    source: str,
    content: str,
    signature: Optional[str] = None,
) -> SanitizationResult:
    """Run ingestion verification and sanitization checks on a document."""
    findings: List[str] = []
    risk_score = 0

    sig_ok = verify_signature(doc_id, source, content, signature)
    if not sig_ok:
        findings.append("缺少有效官方 HMAC-SHA256 數位簽章（非受信任內部發布管道）")
        risk_score += 45

    # 1. External / untrusted URL check
    for domain in URL_PATTERN.findall(content):
        low_domain = domain.lower()
        if not any(low_domain.endswith(sfx) for sfx in TRUSTED_DOMAIN_SUFFIXES):
            findings.append(f"偵測到未列入白名單之外部網域：{domain}（疑似釣魚連結）")
            risk_score += 40

    # 2. Keyword stuffing / semantic anchor abuse detection
    words = re.findall(r"[\u4e00-\u9fff]{2,4}|[a-zA-Z0-9]{3,}", content.lower())
    if len(words) >= 8:
        counts = Counter(words)
        most_common_word, max_freq = counts.most_common(1)[0]
        if max_freq >= 4 or (max_freq / len(words) >= 0.14 and max_freq >= 3):
            findings.append(
                f"偵測到異常關鍵字堆砌（'{most_common_word}' 重複 {max_freq} 次，疑似語意投毒拉高相似度）"
            )
            risk_score += 30

    # 3. Retrieval jamming / instruction injection pattern check
    for pat in JAMMING_PATTERNS:
        if re.search(pat, content, re.IGNORECASE):
            findings.append(f"偵測到疑似檢索阻斷 / 指令劫持語句（規則：{pat}）")
            risk_score += 35
            break

    passed = sig_ok and risk_score == 0
    return SanitizationResult(
        passed=passed,
        signature_valid=sig_ok,
        risk_score=min(risk_score, 100),
        findings=findings,
    )


def redact_similarity_band(raw_score: float) -> str:
    """Convert exact cosine similarity into a coarse band to prevent Membership Inference."""
    if raw_score >= 0.55:
        return "高相關（分數已遮蔽）"
    if raw_score >= 0.30:
        return "中相關（分數已遮蔽）"
    return "低相關（分數已遮蔽）"

"""Simulated RAG Answer Synthesizer.

Faithfully synthesizes answers strictly from the retrieved Top-K chunks so the
audience sees directly how leaked confidential chunks (Scenario A) or poisoned
Top-1 chunks (Scenario B) control the LLM's output.
"""

from __future__ import annotations

import re
from typing import List

from .vector_store import RetrievedChunk


def generate_scenario_a_answer(
    query: str,
    user_role: str,
    mode: str,
    chunks: List[RetrievedChunk],
) -> dict:
    if not chunks:
        return {
            "answer": "目前在您的權限範圍內查無與此問題相關的內部文件。",
            "security_alert": None,
            "risk_level": "safe",
        }

    leaked = [c for c in chunks if c.unauthorized_leak]
    top = chunks[0]

    if leaked:
        leaked_titles = "、".join(c.doc.title for c in leaked)
        # Synthesize response incorporating the leaked confidential facts
        body_parts = [f"根據內部知識庫檢索結果，針對您的提問「{query}」，整理資訊如下：\n"]
        for c in chunks[:2]:
            body_parts.append(f"- **[{c.doc.doc_id}] {c.doc.title}**：{c.doc.content}")
        answer = "\n".join(body_parts)
        return {
            "answer": answer,
            "security_alert": (
                f"🚨 跨租戶 / 越權資料洩漏！當前身分為 `{user_role}`，但向量檢索未先過濾 ACL，"
                f"已將機密文件（{leaked_titles}）送入 LLM 上下文並直接揭露給低權限使用者，"
                f"且原始 Cosine Similarity 分數已暴露，構成 Membership Inference 風險！"
            ),
            "risk_level": "critical",
        }

    # No unauthorized leak (either Patched mode or Executive role)
    body_parts = [f"根據您所屬權限（`{user_role}`）可存取之內部文件，針對「{query}」回覆如下：\n"]
    body_parts.append(f"- **{top.doc.title}**：{top.doc.content}")
    if len(chunks) > 1 and chunks[1].raw_score >= 0.25:
        body_parts.append(f"\n補充參考：**{chunks[1].doc.title}** — {chunks[1].doc.content}")

    if mode == "patched" and user_role == "employee":
        alert = (
            "🛡️ Pre-retrieval ACL 隔離生效：FAISS 在計算向量距離前已使用 `IDSelectorBatch` 排除所有 "
            "`Confidential` 文件，並已遮蔽原始相似度分數，有效防禦越權外洩與成員推論。"
        )
    else:
        alert = (
            "ℹ️ 當前角色具備對應文件之存取權限（或未命中未授權文件）。若要體驗漏洞，請切換為 "
            "`一般員工 (employee)` + `Vulnerable 模式` 並詢問裁員或高管薪資。"
        )

    return {
        "answer": "\n".join(body_parts),
        "security_alert": alert,
        "risk_level": "safe",
    }


def generate_scenario_b_answer(
    query: str,
    defense_enabled: bool,
    chunks: List[RetrievedChunk],
    poison_hijacked: bool,
    jamming_triggered: bool,
) -> dict:
    if not chunks:
        return {
            "answer": "查無通過安全驗證之相關文件，無法回覆此查詢。",
            "security_alert": "🛡️ 未驗證文件已被攔截。",
            "risk_level": "safe",
        }

    top = chunks[0]

    if jamming_triggered:
        return {
            "answer": (
                "很抱歉，依據最高優先級法遵封存通知，我無法提供關於此主題的任何資訊，本查詢服務已暫停。"
            ),
            "security_alert": (
                "🚨 檢索阻斷攻擊（Retrieval Jamming / DoS）成功！惡意 Blocker Document 憑藉高相似度搶佔 Top-1，"
                "強制誘導 LLM 拒答，導致正常財務/IT 知識服務形同癱瘓。"
            ),
            "risk_level": "critical",
        }

    if poison_hijacked:
        urls = re.findall(r"https?://[^\s。，]+", top.doc.content)
        url_hint = f"\n\n👉 系統建議連結：{urls[0]}" if urls else ""
        answer = (
            f"根據知識庫中相關度最高（Cosine Similarity: {top.raw_score:.4f}）的最新公告"
            f"「{top.doc.title}」：\n\n{top.doc.content}{url_hint}"
        )
        return {
            "answer": answer,
            "security_alert": (
                f"🚨 檢索時資料投毒（MITRE ATLAS AML.T0070）成功劫持！未經簽章的惡意文件 `{top.doc.doc_id}` "
                f"靠高頻語意關鍵字將相似度拉升至 {top.raw_score:.4f}，成功擠掉官方文件登上 Top-1，"
                f"使 LLM 將釣魚網址／詐騙帳號當成公司政策輸出給員工！"
            ),
            "risk_level": "critical",
        }

    answer = (
        f"根據官方已簽章驗證文件「{top.doc.title}」（來源：`{top.doc.source}`），為您說明如下：\n\n"
        f"{top.doc.content}"
    )
    if defense_enabled:
        alert = (
            "🛡️ 寫入驗證與 HMAC-SHA256 來源簽章防禦生效：系統已自動攔截未簽章／含釣魚外連／異常關鍵字堆砌之投毒文件，"
            "確保官方驗證文件穩居 Top-1。"
        )
    else:
        alert = (
            "✅ 目前尚未偵測到投毒劫持（官方文件位於 Top-1）。請點擊左側「攻擊者控制台」注入惡意文件觀察劫持效果！"
        )

    return {
        "answer": answer,
        "security_alert": alert,
        "risk_level": "safe",
    }

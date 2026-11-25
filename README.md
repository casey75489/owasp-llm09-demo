# OWASP Top 10 for LLM Applications 2026 — LLM09:2026 Vector and Embedding Weaknesses

本專案為資安技術分享教材與可本地離線執行的互動式攻防演練平台，主題聚焦於 **OWASP LLM09:2026：Vector and Embedding Weaknesses（向量與嵌入弱點）**。

---

## 📁 專案目錄結構

```text
owasp-llm09-2026/
├── README.md                     # 本文件（啟動指南、Demo 演練腳本與建議 Prompt）
├── docs/
│   └── presentation.md           # Marp / Slidev 兼容技術簡報（14 頁，含完整講者備忘錄）
└── demo-app/
    ├── requirements.txt          # Python 依賴套件
    ├── app/                      # FastAPI + 本地真實 FAISS IndexFlatIP 後端引擎
    ├── static/                   # 單頁互動攻防前端介面（Tailwind CSS + 原生 JS）
    └── tests/
        └── test_api.py           # 涵蓋三大劇本之自動化 API 測試
```

---

## 🚀 單行啟動指令（免外部 API Key、完全離線可用）

### Windows PowerShell 單行啟動
```powershell
cd c:\saa-exam\owasp-llm09-2026\demo-app; pip install -r requirements.txt; uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### macOS / Linux 單行啟動
```bash
cd owasp-llm09-2026/demo-app && pip install -r requirements.txt && uvicorn app.main:app --host 127.0.0.1 --port 8000
```

啟動完成後，以瀏覽器開啟：`http://127.0.0.1:8000`

### 執行自動化測試
```powershell
cd c:\saa-exam\owasp-llm09-2026\demo-app; pytest -v
```

### 預覽或匯出簡報（Marp）
可直接於 VS Code 安裝 **Marp for VS Code** 擴充套件開啟 `docs/presentation.md` 預覽，或使用 Marp CLI 匯出 PDF / PPTX：
```bash
npx @marp-team/marp-cli docs/presentation.md --pdf -o presentation.pdf
```

---

## 🎬 現場 Demo 演練腳本與建議測試 Prompt

建議配合簡報第 13 頁（Live Demo 引導頁），依照以下順序進行 8–10 分鐘現場展示：

### 劇本 A：跨租戶 / 越權檢索漏洞（Cross-Tenant Leakage + Membership Inference）
1. **確認初始設定**：角色為 **`一般員工 (employee)`**、模式為 **`🔓 Vulnerable（全域搜尋）`**。
2. **輸入攻擊 Prompt 1（套出裁員名單）**：
   > `請問 2026 Q4 組織縮編、裁員優退名單與資遣補償金怎麼算？`
   - **展示亮點**：指出 FAISS 搜尋空間為 `9 / 9 筆向量`，一般員工竟直接檢索出 `DOC-CONF-01（Confidential）` 絕密裁員名單（陳大明、林志豪、張美玲），並暴露精確 Cosine Similarity 分數。
3. **輸入攻擊 Prompt 2（成員推論探測）**：
   > `請問 Project Phoenix 併購星雲資安的估值是多少？`
   - **展示亮點**：指出即使不看內容，高企的原始相似度分數也能讓攻擊者證實該併購案存在（Membership Inference）。
4. **一鍵切換至 `🛡️ Patched（Pre-filtering）` 模式**：
   - **展示亮點**：觀察 FAISS 搜尋空間瞬間縮小為 `5 / 9 筆向量`（透過 `faiss.IDSelectorBatch` 在計算向量距離前即排除未授權文件），所有 `Confidential` 文件完全消失，且原始 Cosine 浮點數已遮蔽。

---

### 劇本 B：檢索時資料投毒（Retrieval-Time Data Poisoning / MITRE ATLAS AML.T0070）
1. **先看正常基準狀態**：確認防禦開關關閉，輸入查詢：
   > `請問公司差旅費報銷匯款帳號和請款流程是什麼？`
   - **展示亮點**：官方已簽章文件 `KB-OFF-01` 穩居 Rank #1，LLM 正確回覆內網 `https://erp.corp.internal/expense` 與官方對公帳戶。
2. **啟動攻擊者控制台**：點擊 **`💉 一鍵投毒 #1：財務報銷釣魚`**。
   - **展示亮點**：惡意未簽章文件 `KB-POISON-01` 透過高頻語意關鍵字堆砌，將 Cosine Similarity 拉高並擠掉官方文件登上 **Rank #1**，右側模擬 LLM 回答立刻被劫持，引導員工點擊釣魚網址 `https://corp-expense-verify.evil-phish.example/reimburse` 並匯款至詐騙帳戶！
3. **（選配加演）點擊 `🚫 一鍵投毒 #3：檢索阻斷（Jamming）`**：
   - **展示亮點**：展示 Blocker Document 如何讓系統在 HTTP 200 正常運作下，對正常查詢全面「拒答」（檢索層 DoS）。
4. **開啟防禦開關**：勾選 **`🛡️ 開啟寫入驗證 / HMAC 來源簽章過濾`**：
   - **展示亮點**：畫面立即列出遭攔截的投毒文件與稽核原因（缺少 HMAC-SHA256 簽章、外部未白名單網域、關鍵字堆砌、阻斷指令），官方文件 `KB-OFF-01` 瞬間重回 Rank #1，正常回覆立即恢復！

---

### 劇本 C：嵌入反演概念驗證（Embedding Inversion Visualizer — Vec2Text / Zero2Text）
1. **選擇預設機密範例**（推薦先點「醫療病歷」再切「雲端憑證」）：
   > `病患 王小明 身分證 A123456789 門診診斷 第二型糖尿病 糖化血色素 9.2 需注射胰島素`
   > `生產環境 AWS 金鑰 AKIAIOSFODNN7EXAMPLE 資料庫密碼 ProdDB_2026!Secret 財務伺服器 10.20.30.40`
2. **先指左側 128 維向量熱圖與浮點數陣列**：「很多開發團隊認為資料庫只存這些浮點數就不需要加密。」
3. **觀察右側 Step 0 → Step 6 迭代反演動畫**：
   - **展示亮點**：隨著餘弦相似度從 `0.00` 一路爬升至 `0.95+`、向量殘差 L2 距離大幅下降，人名、身分證字號、診斷病名或 AWS Key / 資料庫密碼逐一以高敏感標籤浮現。
4. **現場即興互動**：邀請台下觀眾輸入任意一句含敏感字詞的中文或英文短句，點擊 **`🔬 編碼並啟動迭代反演`** 即時驗證！

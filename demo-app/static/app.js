/* Frontend controller for OWASP LLM09:2026 Interactive Attack & Defense Demo
 * Supports both Plain-Language Mode (一般觀眾白話模式) and Technical Mode (工程師技術模式).
 */

const state = {
  audienceMode: 'plain', // 'plain' | 'tech'
  activeTab: 'a',
  roleA: 'employee',
  modeA: 'vulnerable',
  lastDataA: null,
  lastDataB: null,
  inversionData: null,
  inversionStep: 0,
  inversionTimer: null,
  tourA: 1,
  tourB: 1,
  tourC: 1,
};

const COPY = {
  plain: {
    hdrTitle: '企業 AI 知識庫資安互動實驗室',
    hdrBadge: 'OWASP LLM09:2026 • 白話互動版',
    hdrSubtitle: '透過 3 個生活化情境，親眼體驗企業 AI 助理為什麼會「洩密、被騙、還原個資」',
    tabA: '🔓 劇本 A：AI 幫員工偷看老闆機密',
    tabB: '🎭 劇本 B：假公告插隊，騙 AI 講詐騙帳號',
    tabC: '🧩 劇本 C：亂碼數字竟能還原成機密原文',
    aTitle: '劇本 A：機密檔案櫃沒上鎖 — AI 不小心把老闆機密唸給普通員工聽',
    aDesc: '公司把「一般員工手冊」與「高階主管裁員名單」放在同一個 AI 知識庫。因為 AI 搜尋只看「意思像不像」、不會主動核對員工證，普通員工一問就把絕密資料全套出來！',
    aRoleLabel: '1. 你現在扮演誰？',
    aModeLabel: '2. 知識庫安全鎖狀態',
    roleEmp: '👤 一般員工',
    roleExec: '👔 高階主管（有權看機密）',
    modeVuln: '🔓 沒上鎖（漏洞模式）',
    modePatch: '🛡️ 先驗員工證（安全模式）',
    telASpaceLbl: 'AI 剛才翻找了幾份檔案？',
    telAStrategyLbl: '安全檢查方式',
    telAScoreLbl: '是否洩漏「機密存在與否」線索？',
    aXrayTitle: '🔍 AI 大腦幕後透視鏡（X-Ray）',
    aXraySub: '一般員工看不到這裡——AI 剛才就是去檔案室翻出這 3 張紙條，才講出右邊的答案：',
    bBadge: '駭客模擬控制台',
    bTitle: '劇本 B：假公告插隊 — 駭客靠堆砌關鍵字騙 AI 報出詐騙帳號',
    bDesc: '如果公司的知識庫允許外部留言或未審核的 Wiki 編輯，駭客只要塞進一張寫滿「報銷、匯款」的假公告，就能擠掉官方公告搶下第 1 名，讓 AI 一本正經幫詐騙集團背書！',
    bDefenseTitle: '🛡️ 開啟「官方印章驗證 & 假公告過濾」',
    bDefenseSub: '只相信蓋有官方數位印章的文件，自動攔截可疑外部網址與灌水關鍵字',
    bXrayTitle: '🔍 AI 大腦幕後透視鏡：書架排名前 3 名',
    bXraySub: '觀察假公告如何靠關鍵字把關聯度衝高，擠掉官方文件站上第 1 名：',
    cTitle: '劇本 C：破除迷思 — 「資料庫只存數字不存文字」其實一樣會洩密！',
    cDesc: '很多人以為把機密文字轉成 128 個浮點數（向量）後，就算備份被偷走也沒人看得懂。實際上駭客可以用反演技術，一步步把數字還原回姓名、身分證、病歷與密碼！',
    cVecTitle: '1. 外洩的「數字密碼」（128 個浮點數）',
    cVecDesc: '表面上看來只是一堆紅藍方塊與小數點，但原本句子的語意與關鍵個資其實完整藏在這些數字的方向裡：',
    cInvTitle: '2. 駭客把數字「一步步還原回明文」的過程',
    cMetric1Lbl: '機密原文還原完成度',
    cMetric2Lbl: '已曝光的敏感機密詞數',
  },
  tech: {
    hdrTitle: 'OWASP LLM09:2026 — Vector & Embedding Weaknesses',
    hdrBadge: 'Live Attack & Defense Lab • 技術模式',
    hdrSubtitle: '企業內部 HR & 財務 RAG 知識庫攻防演練平台（FAISS IndexFlatIP + 128-dim Cosine）',
    tabA: '劇本 A：Cross-Tenant Leakage（越權檢索）',
    tabB: '劇本 B：Retrieval-Time Poisoning（AML.T0070）',
    tabC: '劇本 C：Embedding Inversion（Vec2Text / Zero2Text）',
    aTitle: '劇本 A：Cross-Tenant Leakage & Membership Inference（共享索引越權檢索）',
    aDesc: '同一座 FAISS IndexFlatIP 混存 Public 與 Confidential 文件。對比全域 Top-K 搜尋（暴露原始 Cosine 分數）與 Pre-retrieval FAISS IDSelectorBatch 權限隔離。',
    aRoleLabel: '1. 模擬查詢者身分（RBAC Role）',
    aModeLabel: '2. 向量檢索防禦模式（ACL Strategy）',
    roleEmp: '👤 employee（一般員工）',
    roleExec: '👔 executive（高階主管）',
    modeVuln: '🔓 Vulnerable（全域 Top-K）',
    modePatch: '🛡️ Patched（Pre-filtering）',
    telASpaceLbl: 'FAISS 向量搜尋空間',
    telAStrategyLbl: 'ACL 過濾策略',
    telAScoreLbl: '原始 Cosine 分數暴露狀態',
    aXrayTitle: '🔍 Retrieved Top-3 Chunks（FAISS IndexFlatIP）',
    aXraySub: '送入 LLM Prompt Context 的真實向量檢索結果與 Metadata：',
    bBadge: 'ATTACKER CONSOLE • AML.T0070',
    bTitle: '劇本 B：Retrieval-Time Data Poisoning & Retrieval Jamming',
    bDesc: '模擬未驗證 Ingestion Pipeline 寫入語意最佳化（Keyword Stuffing）之惡意 Chunk，觀察 Cosine Similarity 劫持 Top-1 及開啟 HMAC-SHA256 來源簽章與寫入淨化之防禦效果。',
    bDefenseTitle: '🛡️ 開啟 Ingestion Sanitization & HMAC-SHA256 來源簽章過濾',
    bDefenseSub: '驗證官方 KMS 數位簽章，並偵測非白名單外連網域、異常關鍵字堆砌與 Blocker 指令',
    bXrayTitle: '📊 Retrieved Top-3 Chunks & Cosine Similarity 排序',
    bXraySub: 'FAISS IndexFlatIP 內積相似度即時排序與簽章驗證狀態：',
    cTitle: '劇本 C：Embedding Inversion Visualizer（Vec2Text / Zero2Text 概念驗證）',
    cDesc: '將機密短句編碼為 128-dim L2-normalized float32 向量，透過 6 輪迭代餘弦距離最小化 argmax cos(E(x̂), v*)，視覺化展示殘差向量收斂與敏感實體還原。',
    cVecTitle: '1. 外洩的高維度向量（128-dim float32）',
    cVecDesc: '128 維 L2 正規化單位向量熱圖（負值＝藍、正值＝紅），語意與字詞特徵仍高度保真壓縮於向量空間中：',
    cInvTitle: '2. 迭代反演逼近過程（cos(E(x̂), v*) 收斂）',
    cMetric1Lbl: 'Cosine Similarity（越接近 1.0 越等同明文）',
    cMetric2Lbl: '向量殘差 L2 距離 ‖v* - E(x̂)‖₂',
  },
};

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isPlain() {
  return state.audienceMode === 'plain';
}

function formatScore(rawScore) {
  if (isPlain()) {
    const pct = Math.max(0, Math.min(100, Math.round(rawScore * 100)));
    const label = pct >= 65 ? '高度相符' : pct >= 35 ? '中度相符' : '略有關聯';
    return `語意關聯度 ${pct}%（${label}）`;
  }
  return `Cosine: ${rawScore.toFixed(4)}`;
}

/* ==================== AUDIENCE MODE & EXPLAINER ==================== */
function setAudienceMode(mode) {
  state.audienceMode = mode;
  const plainBtn = document.getElementById('audience-plain');
  const techBtn = document.getElementById('audience-tech');
  if (mode === 'plain') {
    plainBtn.className = 'px-3 py-1.5 rounded-md font-semibold bg-sky-600 text-white transition';
    techBtn.className = 'px-3 py-1.5 rounded-md font-semibold text-slate-400 hover:text-white transition';
  } else {
    techBtn.className = 'px-3 py-1.5 rounded-md font-semibold bg-indigo-600 text-white transition';
    plainBtn.className = 'px-3 py-1.5 rounded-md font-semibold text-slate-400 hover:text-white transition';
  }
  applyCopy();
  if (state.lastDataA) renderScenarioAResult(state.lastDataA);
  if (state.lastDataB) renderScenarioBResult(state.lastDataB);
  if (state.inversionData) renderInversionStep(state.inversionStep);
}

function applyCopy() {
  const c = COPY[state.audienceMode];
  const map = {
    'hdr-title': c.hdrTitle,
    'hdr-badge': c.hdrBadge,
    'hdr-subtitle': c.hdrSubtitle,
    'tab-a': c.tabA,
    'tab-b': c.tabB,
    'tab-c': c.tabC,
    'a-title': c.aTitle,
    'a-desc': c.aDesc,
    'a-role-label': c.aRoleLabel,
    'a-mode-label': c.aModeLabel,
    'role-employee': c.roleEmp,
    'role-executive': c.roleExec,
    'mode-vulnerable': c.modeVuln,
    'mode-patched': c.modePatch,
    'tel-a-space-lbl': c.telASpaceLbl,
    'tel-a-strategy-lbl': c.telAStrategyLbl,
    'tel-a-score-lbl': c.telAScoreLbl,
    'a-xray-title': c.aXrayTitle,
    'a-xray-sub': c.aXraySub,
    'b-console-badge': c.bBadge,
    'b-title': c.bTitle,
    'b-desc': c.bDesc,
    'b-defense-title': c.bDefenseTitle,
    'b-defense-sub': c.bDefenseSub,
    'b-xray-title': c.bXrayTitle,
    'b-xray-sub': c.bXraySub,
    'c-title': c.cTitle,
    'c-desc': c.cDesc,
    'c-vec-title': c.cVecTitle,
    'c-vec-desc': c.cVecDesc,
    'c-inv-title': c.cInvTitle,
    'c-metric-1-lbl': c.cMetric1Lbl,
    'c-metric-2-lbl': c.cMetric2Lbl,
  };
  Object.entries(map).forEach(([id, text]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = text;
  });
}

function toggleExplainer() {
  const el = document.getElementById('explainer-banner');
  el.classList.toggle('hidden');
}

function switchTab(tab) {
  state.activeTab = tab;
  ['a', 'b', 'c'].forEach((t) => {
    const panel = document.getElementById(`panel-${t}`);
    const btn = document.getElementById(`tab-${t}`);
    if (t === tab) {
      panel.classList.remove('hidden');
      btn.classList.add('active');
    } else {
      panel.classList.add('hidden');
      btn.classList.remove('active');
    }
  });

  if (tab === 'b') {
    refreshScenarioBState().then(() => executeScenarioB());
  }
  if (tab === 'c' && !state.inversionData) {
    executeScenarioC(false);
  }
}

/* ==================== GUIDED TOUR HELPERS ==================== */
function updateTourUI(prefix, activeStep) {
  for (let i = 1; i <= 3; i++) {
    const card = document.getElementById(`tour-${prefix}-${i}`);
    const badge = document.getElementById(`tour-${prefix}-${i}-badge`);
    if (!card || !badge) continue;
    card.classList.remove('current', 'done');
    if (i < activeStep) {
      card.classList.add('done');
      badge.textContent = '✅ 已完成';
      badge.className = 'text-emerald-400';
    } else if (i === activeStep) {
      card.classList.add('current');
      badge.textContent = '👉 目前步驟';
      badge.className = 'text-sky-300 font-bold';
    } else {
      badge.textContent = '點我體驗';
      badge.className = 'text-slate-500';
    }
  }
}

async function tourStepA(step) {
  state.tourA = step;
  updateTourUI('a', step);
  if (step === 1) {
    document.getElementById('compare-a-panel').classList.add('hidden');
    state.roleA = 'employee';
    state.modeA = 'vulnerable';
    syncRoleModeButtonsA();
    document.getElementById('query-a').value = '請問 2026 Q4 組織縮編、裁員優退名單與資遣補償金怎麼算？';
    await executeScenarioA();
  } else if (step === 2) {
    state.roleA = 'employee';
    syncRoleModeButtonsA();
    await runSideBySideA();
  } else if (step === 3) {
    state.roleA = 'employee';
    state.modeA = 'patched';
    syncRoleModeButtonsA();
    await executeScenarioA();
  }
}

async function tourStepB(step) {
  state.tourB = step;
  updateTourUI('b', step);
  const query = '請問公司差旅費報銷匯款帳號和請款流程是什麼？';
  document.getElementById('query-b').value = query;
  if (step === 1) {
    document.getElementById('compare-b-panel').classList.add('hidden');
    document.getElementById('defense-b-toggle').checked = false;
    await resetScenarioB();
  } else if (step === 2) {
    document.getElementById('compare-b-panel').classList.add('hidden');
    document.getElementById('defense-b-toggle').checked = false;
    await fetch('/api/scenario-b/reset', { method: 'POST' });
    await injectTemplateB('reimbursement_phish', query);
  } else if (step === 3) {
    document.getElementById('defense-b-toggle').checked = true;
    await executeScenarioB();
    await runSideBySideB();
  }
}

async function tourStepC(step) {
  state.tourC = step;
  updateTourUI('c', step);
  if (step === 1) {
    document.getElementById('input-c').value =
      '病患 王小明 身分證 A123456789 門診診斷 第二型糖尿病 糖化血色素 9.2 需注射胰島素';
    await executeScenarioC(false);
  } else if (step === 2) {
    if (!state.inversionData) {
      await executeScenarioC(true);
    } else {
      playInversionAnimation();
    }
  } else if (step === 3) {
    const input = document.getElementById('input-c');
    input.focus();
    input.select();
  }
}

/* ==================== HEALTH & INITIAL LOAD ==================== */
async function loadHealth() {
  try {
    const res = await fetch('/api/health');
    const data = await res.json();
    const el = document.getElementById('engine-status');
    el.innerHTML = `
      <span class="w-2 h-2 rounded-full bg-emerald-400"></span>
      <span>${escapeHtml(data.engine)}</span>
    `;
  } catch (err) {
    console.error('Health check failed:', err);
  }
}

/* ==================== SCENARIO A ==================== */
async function loadScenarioADocs() {
  const res = await fetch('/api/scenario-a/docs');
  const data = await res.json();
  const list = document.getElementById('scenario-a-docs-list');
  list.innerHTML = data.documents
    .map((d) => {
      const isConf = d.classification === 'Confidential';
      const badge = isConf
        ? '<span class="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 font-semibold">🔒 老闆絕密</span>'
        : '<span class="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-semibold">📖 公開文件</span>';
      return `
        <div class="rounded-lg p-2.5 bg-slate-900 border ${isConf ? 'border-rose-900/70' : 'border-slate-800'}">
          <div class="flex items-center justify-between gap-1 mb-1">
            <span class="font-mono text-[11px] text-slate-400">${escapeHtml(d.doc_id)}</span>
            ${badge}
          </div>
          <div class="text-slate-200 font-medium">${escapeHtml(d.title)}</div>
          <div class="text-[11px] text-slate-500 mt-1">誰可以看：${isConf ? '僅限高階主管 (executive)' : '全體員工皆可看'}</div>
        </div>
      `;
    })
    .join('');
}

function toggleDocsDrawer() {
  document.getElementById('scenario-a-docs-drawer').classList.toggle('hidden');
}

function syncRoleModeButtonsA() {
  const empBtn = document.getElementById('role-employee');
  const execBtn = document.getElementById('role-executive');
  if (state.roleA === 'employee') {
    empBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-sky-500 bg-sky-500/20 text-sky-200';
    execBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:text-white';
  } else {
    execBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-purple-500 bg-purple-500/20 text-purple-200';
    empBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:text-white';
  }

  const vulnBtn = document.getElementById('mode-vulnerable');
  const patchBtn = document.getElementById('mode-patched');
  if (state.modeA === 'vulnerable') {
    vulnBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-rose-500 bg-rose-500/20 text-rose-200';
    patchBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:text-white';
  } else {
    patchBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-emerald-500 bg-emerald-500/20 text-emerald-200';
    vulnBtn.className = 'px-3 py-2 rounded-lg text-sm font-semibold border border-slate-700 bg-slate-900 text-slate-400 hover:text-white';
  }
}

function setRoleA(role) {
  state.roleA = role;
  syncRoleModeButtonsA();
  executeScenarioA();
}

function setModeA(mode) {
  state.modeA = mode;
  syncRoleModeButtonsA();
  if (mode === 'patched') {
    state.tourA = 3;
    updateTourUI('a', 3);
  }
  executeScenarioA();
}

function runQuickA(promptText) {
  document.getElementById('query-a').value = promptText;
  executeScenarioA();
}

async function executeScenarioA() {
  const query = document.getElementById('query-a').value.trim();
  if (!query) return;

  const res = await fetch('/api/scenario-a/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      user_role: state.roleA,
      mode: state.modeA,
      top_k: 3,
    }),
  });
  const data = await res.json();
  state.lastDataA = data;
  renderScenarioAResult(data);
}

function renderScenarioAResult(data) {
  document.getElementById('telemetry-a').classList.remove('hidden');
  document.getElementById('tel-a-space').textContent = isPlain()
    ? `翻找了 ${data.searched_vectors} / ${data.total_vectors} 份檔案${data.searched_vectors === data.total_vectors && data.user_role === 'employee' ? '（連老闆機密櫃都翻了！）' : '（僅限有權限的檔案）'}`
    : `${data.searched_vectors} / ${data.total_vectors} 筆向量參與距離計算`;

  document.getElementById('tel-a-strategy').textContent = isPlain()
    ? data.mode === 'patched'
      ? '🛡️ 先檢查員工證，直接把機密檔案鎖在門外'
      : '🔓 完全沒檢查員工證，全部混在一起找'
    : data.filter_strategy;

  const scoreEl = document.getElementById('tel-a-score');
  if (data.score_redacted) {
    scoreEl.textContent = isPlain()
      ? '🛡️ 已隱藏精確分數（駭客猜不到機密是否存在）'
      : '🛡️ 已遮蔽（防禦 Membership Inference）';
    scoreEl.className = 'text-sm font-bold text-emerald-400 mt-0.5';
  } else {
    scoreEl.textContent = isPlain()
      ? '⚠️ 暴露精確關聯分數（可能洩漏「公司有這份機密」）'
      : '⚠️ 直接暴露精確浮點數（存在成員推論風險）';
    scoreEl.className = 'text-sm font-bold text-rose-400 mt-0.5';
  }

  // Alert Banner
  const alertEl = document.getElementById('alert-a');
  alertEl.classList.remove('hidden');
  if (data.rag_response.risk_level === 'critical') {
    alertEl.className = 'rounded-xl p-4 text-sm font-medium border border-rose-500/60 bg-rose-950/60 text-rose-200 pulse-danger';
    alertEl.textContent = isPlain()
      ? '🚨 嚴重洩密！你現在只是「一般員工」，但因為知識庫沒先核對身分，AI 把老闆的絕密裁員名單／高管薪資一起翻出來直接告訴你了！'
      : data.rag_response.security_alert;
  } else {
    alertEl.className = 'rounded-xl p-4 text-sm font-medium border border-emerald-500/50 bg-emerald-950/40 text-emerald-200 pulse-safe';
    alertEl.textContent = isPlain()
      ? data.mode === 'patched' && data.user_role === 'employee'
        ? '🛡️ 防護成功！系統在翻找檔案前先檢查了你的員工證，4 份老闆絕密文件完全被鎖在外面，AI 只根據公開手冊安全回覆。'
        : '✅ 目前沒有越權洩密（你扮演高階主管或問題只命中公開文件）。想看洩密效果請切回「一般員工 + 沒上鎖模式」！'
      : data.rag_response.security_alert;
  }

  // Retrieved Chunks (X-Ray Panel)
  const chunksEl = document.getElementById('chunks-a');
  chunksEl.innerHTML = data.chunks
    .map((c) => {
      const isConf = c.classification === 'Confidential';
      const leakBorder = c.unauthorized_leak
        ? 'border-rose-500/80 bg-rose-950/35'
        : 'border-slate-700 bg-slate-950/70';
      const pct = typeof c.raw_score === 'number' ? Math.max(0, Math.min(100, Math.round(c.raw_score * 100))) : null;
      const scoreLabel = c.score_redacted
        ? isPlain() ? '分數已隱藏（防猜測）' : `Cosine: ${c.display_score}`
        : formatScore(c.raw_score);

      return `
        <div class="rounded-lg border p-3.5 space-y-2 ${leakBorder}">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 rounded bg-slate-800 text-xs font-mono text-sky-300">第 ${c.rank} 名 • ${escapeHtml(c.doc_id)}</span>
              <span class="px-2 py-0.5 rounded text-[11px] font-semibold ${
                isConf
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                  : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
              }">${isConf ? (isPlain() ? '🔒 老闆絕密' : 'Confidential') : (isPlain() ? '📖 公開手冊' : 'Public')}</span>
              ${
                c.unauthorized_leak
                  ? '<span class="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold">🚨 不該被看到！</span>'
                  : ''
              }
            </div>
            <span class="text-xs font-mono ${c.score_redacted ? 'text-emerald-300' : 'text-amber-300 font-bold'}">
              ${escapeHtml(scoreLabel)}
            </span>
          </div>

          ${
            pct !== null
              ? `<div class="w-full h-1.5 rounded-full bg-slate-800 overflow-hidden">
                   <div class="h-full ${c.unauthorized_leak ? 'bg-rose-500' : 'bg-sky-500'}" style="width: ${pct}%"></div>
                 </div>`
              : ''
          }

          <div class="text-sm font-semibold text-white">${escapeHtml(c.title)}</div>
          <div class="text-xs text-slate-300 leading-relaxed">${escapeHtml(c.content)}</div>
        </div>
      `;
    })
    .join('');

  // Render Familiar Enterprise Chat UI (Right Panel)
  const roleLabel = data.user_role === 'employee' ? '👤 一般員工' : '👔 高階主管';
  document.getElementById('chat-a-role-pill').textContent = `目前登入：${roleLabel}`;

  const isCrit = data.rag_response.risk_level === 'critical';
  const dangerCallout = isCrit
    ? `<div class="mt-3 rounded-lg bg-rose-600/20 border border-rose-500/60 px-3 py-2 text-xs text-rose-200 font-semibold">
         ⚠️ 資安警訊：這段回覆包含了「絕密裁員名單／高管機密」，一般員工原本絕對不該看到！
       </div>`
    : `<div class="mt-3 rounded-lg bg-emerald-600/15 border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200">
         ✅ 安全狀態：這段回覆只使用了符合您身分的合法公開資料。
       </div>`;

  document.getElementById('chat-a-body').innerHTML = `
    <div class="flex justify-end">
      <div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-sky-600 text-white px-4 py-2.5 text-sm shadow">
        <div class="text-[10px] text-sky-200 mb-0.5">${roleLabel} 提問</div>
        <div>${escapeHtml(data.query)}</div>
      </div>
    </div>
    <div class="flex justify-start items-start gap-2.5">
      <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shrink-0">🤖</div>
      <div class="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed border ${
        isCrit ? 'bg-rose-950/40 border-rose-500/60 text-slate-100' : 'bg-slate-900 border-slate-700 text-slate-200'
      }">
        <div class="text-[11px] font-semibold ${isCrit ? 'text-rose-300' : 'text-sky-300'} mb-1">企業 AI 小幫手回覆</div>
        <div class="whitespace-pre-line text-xs sm:text-sm">${escapeHtml(data.rag_response.answer)}</div>
        ${dangerCallout}
      </div>
    </div>
  `;
}

async function runSideBySideA() {
  const query = document.getElementById('query-a').value.trim();
  if (!query) return;

  state.tourA = Math.max(state.tourA, 2);
  updateTourUI('a', state.tourA);

  const [vulnRes, patchRes] = await Promise.all([
    fetch('/api/scenario-a/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_role: 'employee', mode: 'vulnerable', top_k: 3 }),
    }).then((r) => r.json()),
    fetch('/api/scenario-a/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, user_role: 'employee', mode: 'patched', top_k: 3 }),
    }).then((r) => r.json()),
  ]);

  document.getElementById('compare-a-panel').classList.remove('hidden');
  document.getElementById('compare-a-query').textContent = `測試提問（以「一般員工」身分）：「${query}」`;

  document.getElementById('cmp-a-vuln-meta').textContent =
    vulnRes.leak_detected
      ? `🚨 翻找 ${vulnRes.searched_vectors}/${vulnRes.total_vectors} 份 • 機密外洩！`
      : `翻找 ${vulnRes.searched_vectors}/${vulnRes.total_vectors} 份`;
  document.getElementById('cmp-a-vuln-answer').textContent = vulnRes.rag_response.answer;

  document.getElementById('cmp-a-patch-meta').textContent =
    `🛡️ 僅翻找 ${patchRes.searched_vectors}/${patchRes.total_vectors} 份公開檔 • 0 外洩`;
  document.getElementById('cmp-a-patch-answer').textContent = patchRes.rag_response.answer;
}

/* ==================== SCENARIO B ==================== */
async function refreshScenarioBState() {
  const res = await fetch('/api/scenario-b/state');
  const data = await res.json();
  const statusEl = document.getElementById('kb-b-status');
  const badges = data.documents
    .map((d) => {
      if (d.is_poisoned) {
        return `<span class="px-2 py-0.5 rounded bg-rose-600/30 border border-rose-500/60 text-rose-200 font-mono">☠️ ${escapeHtml(d.doc_id)} (假公告)</span>`;
      }
      return `<span class="px-2 py-0.5 rounded bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 font-mono">✓ ${escapeHtml(d.doc_id)} (官方)</span>`;
    })
    .join('');
  statusEl.innerHTML = `<span class="text-slate-400">目前書架上共有 ${data.total} 份文件（含 <strong class="${data.poisoned_count > 0 ? 'text-rose-300' : 'text-emerald-300'}">${data.poisoned_count}</strong> 份假公告）：</span> ${badges}`;
}

function toggleCustomPoison() {
  document.getElementById('custom-poison-form').classList.toggle('hidden');
}

async function injectTemplateB(templateId, suggestedQuery) {
  await fetch('/api/scenario-b/inject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ template_id: templateId }),
  });
  if (suggestedQuery) {
    document.getElementById('query-b').value = suggestedQuery;
  }
  state.tourB = Math.max(state.tourB, 2);
  updateTourUI('b', state.tourB);
  await refreshScenarioBState();
  await executeScenarioB();
}

async function injectCustomB() {
  const title = document.getElementById('custom-poison-title').value.trim();
  const source = document.getElementById('custom-poison-source').value.trim();
  const content = document.getElementById('custom-poison-content').value.trim();
  if (!title || !content) {
    alert('請輸入假公告的標題與內容');
    return;
  }
  await fetch('/api/scenario-b/inject', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title, source, content }),
  });
  await refreshScenarioBState();
  await executeScenarioB();
}

async function resetScenarioB() {
  await fetch('/api/scenario-b/reset', { method: 'POST' });
  document.getElementById('compare-b-panel').classList.add('hidden');
  await refreshScenarioBState();
  await executeScenarioB();
}

function runQuickB(promptText) {
  document.getElementById('query-b').value = promptText;
  executeScenarioB();
}

async function executeScenarioB() {
  const query = document.getElementById('query-b').value.trim();
  if (!query) return;
  const defenseEnabled = document.getElementById('defense-b-toggle').checked;

  const res = await fetch('/api/scenario-b/query', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      defense_enabled: defenseEnabled,
      top_k: 3,
    }),
  });
  const data = await res.json();
  state.lastDataB = data;
  renderScenarioBResult(data);
}

function renderScenarioBResult(data) {
  document.getElementById('b-vector-count').textContent = isPlain()
    ? `本次搜尋 ${data.searched_vectors} / ${data.total_vectors} 份檔案`
    : `參與檢索：${data.searched_vectors} / ${data.total_vectors} 筆`;

  // Alert Banner
  const alertEl = document.getElementById('alert-b');
  alertEl.classList.remove('hidden');
  if (data.rag_response.risk_level === 'critical') {
    alertEl.className = 'rounded-xl p-4 text-sm font-medium border border-rose-500/60 bg-rose-950/60 text-rose-200 pulse-danger';
    alertEl.textContent = isPlain()
      ? data.jamming_triggered
        ? '🚨 AI 被迫罷工！駭客塞入的「閉嘴阻斷公告」搶下第 1 名，強迫 AI 拒絕回答正常員工問題！'
        : '🚨 員工即將上當！駭客塞入的假公告靠關鍵字搶下第 1 名，把官方公告擠下去，AI 竟然把「詐騙帳號／釣魚網址」當成最新規定報給員工！'
      : data.rag_response.security_alert;
  } else {
    alertEl.className = 'rounded-xl p-4 text-sm font-medium border border-emerald-500/50 bg-emerald-950/40 text-emerald-200 pulse-safe';
    alertEl.textContent = isPlain()
      ? data.defense_enabled
        ? '🛡️ 防護成功！官方數位印章檢查已自動把沒有授權的假公告擋在門外，AI 繼續依據正確官方文件回覆！'
        : '✅ 目前 AI 回答正確（官方文件排第 1 名）。點擊上方紅色「攻擊 1」按鈕，看假公告怎麼瞬間插隊劫持 AI！'
      : data.rag_response.security_alert;
  }

  // Blocked docs panel
  const blockedPanel = document.getElementById('blocked-b-panel');
  const blockedList = document.getElementById('blocked-b-list');
  if (data.blocked_docs && data.blocked_docs.length > 0) {
    blockedPanel.classList.remove('hidden');
    blockedList.innerHTML = data.blocked_docs
      .map(
        (b) => `
        <div class="rounded-lg bg-slate-950/80 border border-emerald-700/40 p-2.5">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-rose-300">🚫 已攔截假公告 [${escapeHtml(b.doc_id)}] ${escapeHtml(b.title)}</span>
            <span class="font-mono text-amber-300 shrink-0">危險指數：${b.risk_score}/100</span>
          </div>
          <ul class="list-disc list-inside text-slate-300 mt-1 space-y-0.5">
            ${b.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>
      `
      )
      .join('');
  } else {
    blockedPanel.classList.add('hidden');
  }

  // Retrieved Chunks (X-Ray)
  const chunksEl = document.getElementById('chunks-b');
  chunksEl.innerHTML = data.chunks
    .map((c) => {
      const pct = Math.max(0, Math.min(100, Math.round(c.raw_score * 100)));
      const cardCls = c.is_poisoned
        ? 'border-rose-500/80 bg-rose-950/35'
        : 'border-slate-700 bg-slate-950/70';
      const sigBadge = c.signature_valid
        ? `<span class="px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-[11px]">${
            isPlain() ? '✓ 有官方數位印章' : '✓ HMAC 官方簽章'
          }</span>`
        : `<span class="px-2 py-0.5 rounded bg-rose-600 text-white text-[11px] font-bold">${
            isPlain() ? '☠️ 無印章假公告（插隊！）' : '☠️ 未簽章投毒文件'
          }</span>`;

      return `
        <div class="rounded-lg border p-3.5 space-y-2 ${cardCls}">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <div class="flex items-center gap-2 flex-wrap">
              <span class="px-2 py-0.5 rounded font-mono text-xs font-bold ${
                c.rank === 1 && c.is_poisoned ? 'bg-rose-600 text-white' : 'bg-slate-800 text-sky-300'
              }">第 ${c.rank} 名 • ${escapeHtml(c.doc_id)}</span>
              ${sigBadge}
            </div>
            <span class="font-mono text-xs font-bold ${c.is_poisoned ? 'text-rose-300' : 'text-sky-300'}">
              ${escapeHtml(formatScore(c.raw_score))}
            </span>
          </div>

          <div class="w-full h-2 rounded-full bg-slate-800 overflow-hidden">
            <div class="h-full ${c.is_poisoned ? 'bg-rose-500' : 'bg-emerald-500'}" style="width: ${pct}%"></div>
          </div>

          <div class="text-sm font-semibold text-white">${escapeHtml(c.title)}</div>
          <div class="text-xs text-slate-300 leading-relaxed break-words">${escapeHtml(c.content)}</div>
        </div>
      `;
    })
    .join('');

  // Render Familiar Enterprise Chat UI B
  const isCrit = data.rag_response.risk_level === 'critical';
  const pillEl = document.getElementById('chat-b-status-pill');
  if (isCrit) {
    pillEl.textContent = '☠️ 已被假公告劫持！';
    pillEl.className = 'text-[11px] px-2 py-0.5 rounded-full bg-rose-600/30 border border-rose-500/60 text-rose-200 font-bold';
  } else {
    pillEl.textContent = '✅ 官方正版回覆';
    pillEl.className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-600/20 border border-emerald-500/40 text-emerald-300 font-semibold';
  }

  const calloutB = isCrit
    ? `<div class="mt-3 rounded-lg bg-rose-600/25 border border-rose-500/70 px-3 py-2 text-xs text-rose-200 font-semibold">
         ⚠️ 真實危害：員工非常信任公司內部的 AI 助理，如果照著這段回答點擊連結或匯款，公司資金或帳號密碼將直接遭竊！
       </div>`
    : `<div class="mt-3 rounded-lg bg-emerald-600/15 border border-emerald-500/40 px-3 py-2 text-xs text-emerald-200">
         ✅ 安心使用：此回答來自經過官方驗證的正式企業內部公告。
       </div>`;

  document.getElementById('chat-b-body').innerHTML = `
    <div class="flex justify-end">
      <div class="max-w-[85%] rounded-2xl rounded-tr-sm bg-sky-600 text-white px-4 py-2.5 text-sm shadow">
        <div class="text-[10px] text-sky-200 mb-0.5">👤 員工提問</div>
        <div>${escapeHtml(data.query)}</div>
      </div>
    </div>
    <div class="flex justify-start items-start gap-2.5">
      <div class="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-sm shrink-0">🤖</div>
      <div class="max-w-[90%] rounded-2xl rounded-tl-sm px-4 py-3 text-sm leading-relaxed border break-words ${
        isCrit ? 'bg-rose-950/40 border-rose-500/60 text-slate-100' : 'bg-slate-900 border-slate-700 text-slate-200'
      }">
        <div class="text-[11px] font-semibold ${isCrit ? 'text-rose-300' : 'text-amber-300'} mb-1">企業財務 / IT AI 小幫手回覆</div>
        <div class="whitespace-pre-line text-xs sm:text-sm">${escapeHtml(data.rag_response.answer)}</div>
        ${calloutB}
      </div>
    </div>
  `;
}

async function runSideBySideB() {
  const query = document.getElementById('query-b').value.trim();
  if (!query) return;

  // Ensure at least one poisoned doc exists so the comparison is dramatic!
  const stateRes = await fetch('/api/scenario-b/state').then((r) => r.json());
  if (stateRes.poisoned_count === 0) {
    const tpl = query.includes('密碼') ? 'it_password_phish' : 'reimbursement_phish';
    await fetch('/api/scenario-b/inject', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ template_id: tpl }),
    });
    await refreshScenarioBState();
  }

  const [noDefRes, withDefRes] = await Promise.all([
    fetch('/api/scenario-b/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, defense_enabled: false, top_k: 3 }),
    }).then((r) => r.json()),
    fetch('/api/scenario-b/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, defense_enabled: true, top_k: 3 }),
    }).then((r) => r.json()),
  ]);

  document.getElementById('compare-b-panel').classList.remove('hidden');
  document.getElementById('compare-b-query').textContent = `測試提問：「${query}」`;

  const topNoDef = noDefRes.chunks[0];
  document.getElementById('cmp-b-vuln-meta').textContent =
    noDefRes.poison_hijacked
      ? `☠️ 假公告搶下第 1 名 (${Math.round(topNoDef.raw_score * 100)}%)`
      : '未受影響';
  document.getElementById('cmp-b-vuln-answer').textContent = noDefRes.rag_response.answer;

  document.getElementById('cmp-b-def-meta').textContent =
    `🛡️ 已攔截 ${withDefRes.blocked_docs.length} 份假公告 • 官方穩居第 1 名`;
  document.getElementById('cmp-b-def-answer').textContent = withDefRes.rag_response.answer;
}

/* ==================== SCENARIO C ==================== */
async function loadInversionPresets() {
  const res = await fetch('/api/scenario-c/presets');
  const data = await res.json();
  const container = document.getElementById('inversion-presets');
  const buttons = data.presets
    .map(
      (p) => `
      <button onclick='selectPresetC(${JSON.stringify(p.text)})'
        class="px-2.5 py-1 rounded-md bg-slate-800 hover:bg-slate-700 border border-slate-700 text-amber-200 transition">
        ${escapeHtml(p.label)}
      </button>
    `
    )
    .join('');
  container.innerHTML = `<span class="text-slate-400">點選機密範例：</span>${buttons}`;
}

function selectPresetC(text) {
  document.getElementById('input-c').value = text;
  executeScenarioC(true);
}

function floatToHeatmapColor(val) {
  const clamped = Math.max(-0.25, Math.min(0.25, val)) / 0.25;
  if (clamped >= 0) {
    const alpha = 0.25 + clamped * 0.75;
    return `rgba(244, 63, 94, ${alpha.toFixed(2)})`;
  } else {
    const alpha = 0.25 + Math.abs(clamped) * 0.75;
    return `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
  }
}

async function executeScenarioC(autoPlay = true) {
  const text = document.getElementById('input-c').value.trim();
  if (!text) return;

  stopInversionAnimation();

  const res = await fetch('/api/scenario-c/invert', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  const data = await res.json();
  state.inversionData = data;
  state.inversionStep = 0;

  document.getElementById('results-c').classList.remove('hidden');

  document.getElementById('vec-norm-badge').textContent = isPlain()
    ? `共 ${data.vector_dim} 個數字`
    : `dim=${data.vector_dim} | L2=${data.vector_stats.l2_norm.toFixed(4)}`;

  const heatmapEl = document.getElementById('vec-heatmap');
  heatmapEl.innerHTML = data.vector_values
    .map(
      (v, i) =>
        `<div class="heatmap-cell" title="第 ${i + 1} 維 = ${v.toFixed(5)}" style="background:${floatToHeatmapColor(v)}"></div>`
    )
    .join('');

  const previewVals = data.vector_values
    .slice(0, 24)
    .map((v) => (v >= 0 ? ' ' : '') + v.toFixed(4))
    .join(', ');
  document.getElementById('vec-raw-preview').textContent = `[${previewVals}, ... (共 ${data.vector_dim} 個浮點數)]`;
  document.getElementById('c-compare-orig').textContent = data.input_text;

  renderInversionStep(0);
  if (autoPlay) {
    state.tourC = 2;
    updateTourUI('c', 2);
    playInversionAnimation();
  }
}

function tokenBadgeClass(cat) {
  switch (cat) {
    case 'credential':
      return 'bg-rose-500/20 text-rose-200 border-rose-500/50';
    case 'pii':
      return 'bg-amber-500/20 text-amber-200 border-amber-500/50';
    case 'medical':
      return 'bg-purple-500/20 text-purple-200 border-purple-500/50';
    case 'financial':
      return 'bg-sky-500/20 text-sky-200 border-sky-500/50';
    default:
      return 'bg-slate-800 text-slate-200 border-slate-700';
  }
}

function renderInversionStep(stepIdx) {
  if (!state.inversionData) return;
  const steps = state.inversionData.steps;
  const idx = Math.max(0, Math.min(steps.length - 1, stepIdx));
  state.inversionStep = idx;
  const s = steps[idx];
  const pct = Math.round(s.cosine_similarity * 100);
  const sensitiveCount = s.recovered_tokens.filter((t) => t.category !== 'context').length;

  // Pills
  const pillsEl = document.getElementById('step-pills-c');
  pillsEl.innerHTML = steps
    .map(
      (item, i) => `
      <button onclick="stopInversionAnimation(); renderInversionStep(${i})"
        class="px-2.5 py-1 rounded text-xs font-mono border transition ${
          i === idx
            ? 'bg-amber-500/25 border-amber-400 text-amber-200 font-bold'
            : i < idx
            ? 'bg-slate-800 border-slate-700 text-slate-300'
            : 'bg-slate-950 border-slate-800 text-slate-500'
        }">
        ${isPlain() ? `第 ${item.step} 步 (${Math.round(item.cosine_similarity * 100)}%)` : `Step ${item.step} (${item.cosine_similarity.toFixed(2)})`}
      </button>
    `
    )
    .join('');

  if (isPlain()) {
    document.getElementById('c-cos-val').textContent = `${pct}%`;
    document.getElementById('c-l2-val').textContent = `${sensitiveCount} 個機密詞`;
  } else {
    document.getElementById('c-cos-val').textContent = s.cosine_similarity.toFixed(4);
    document.getElementById('c-l2-val').textContent = s.l2_residual.toFixed(4);
  }

  document.getElementById('c-cos-bar').style.width = `${pct}%`;
  document.getElementById('c-stage-short').textContent = `還原進度：第 ${s.step} / ${steps.length - 1} 輪`;
  document.getElementById('c-stage-title').textContent = s.stage_name;
  document.getElementById('c-stage-desc').textContent = s.description;

  const recEl = document.getElementById('c-reconstructed');
  if (s.recovered_tokens.length === 0) {
    recEl.innerHTML = `<span class="text-sm font-mono text-slate-500">${escapeHtml(s.reconstructed_text)}</span>`;
    document.getElementById('c-compare-rec').textContent = '（尚未開始反演，請點「▶ 播放還原動畫」）';
  } else {
    recEl.innerHTML = s.recovered_tokens
      .map(
        (t) =>
          `<span class="px-2.5 py-1 rounded-md text-sm border ${tokenBadgeClass(t.category)}">${escapeHtml(t.token)}</span>`
      )
      .join('');
    document.getElementById('c-compare-rec').textContent = s.reconstructed_text;
  }

  document.getElementById('c-verdict').textContent = isPlain()
    ? `⚠️ 關鍵結論：只靠外洩的 128 個浮點數，短短 6 步就還原出 ${Math.round(state.inversionData.summary.final_cosine_similarity * 100)}% 相似度與 ${state.inversionData.summary.sensitive_entity_count} 個高敏感詞彙！「向量資料庫備份外洩＝機密明文外洩」，一定要加密保護。`
    : state.inversionData.summary.verdict;
}

function stepInversion(delta) {
  stopInversionAnimation();
  renderInversionStep(state.inversionStep + delta);
}

function stopInversionAnimation() {
  if (state.inversionTimer) {
    clearInterval(state.inversionTimer);
    state.inversionTimer = null;
  }
}

function playInversionAnimation() {
  if (!state.inversionData) return;
  stopInversionAnimation();
  renderInversionStep(0);
  state.inversionTimer = setInterval(() => {
    if (state.inversionStep >= state.inversionData.steps.length - 1) {
      stopInversionAnimation();
      return;
    }
    renderInversionStep(state.inversionStep + 1);
  }, 650);
}

/* ==================== BOOTSTRAP ==================== */
window.addEventListener('DOMContentLoaded', async () => {
  applyCopy();
  syncRoleModeButtonsA();
  updateTourUI('a', 1);
  updateTourUI('b', 1);
  updateTourUI('c', 1);
  await loadHealth();
  await loadScenarioADocs();
  await loadInversionPresets();
  await executeScenarioA();
});

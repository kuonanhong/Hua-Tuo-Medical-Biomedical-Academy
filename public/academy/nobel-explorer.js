/* Nobel timeline explorer and the AlphaGo → AlphaFold page with a live Monte-Carlo tree search
   demonstration (tic-tac-toe) and the AlphaFold 2 pipeline diagram. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = () => window.HT.i18n.isZh();
  const pick = (z, e) => zh() ? z : e;

  function nobel(root, which) {
    which = which || 'nobel-medicine';
    const items = window.HT_CATALOG.filter(c => c.department === which).sort((a, b) => Number((a.tags.find(t => /^\d{4}$/.test(t)) || 0)) - Number((b.tags.find(t => /^\d{4}$/.test(t)) || 0)));
    const decades = {};
    items.forEach(c => { const y = Number(c.tags.find(t => /^\d{4}$/.test(t)) || 0); const d = Math.floor(y / 10) * 10; (decades[d] = decades[d] || []).push(c); });
    const tech = window.HT_CATALOG.filter(c => c.department === 'research-techniques');
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">NOBEL & TECHNIQUES</span><h1>${pick('諾貝爾獎研究拆解：問題 → 方法 → 關鍵實驗 → 結果 → 臨床遺產', 'Nobel prizes deconstructed: question → method → key experiment → result → legacy')}</h1><p class="subtext">${pick('生理學或醫學獎 1901–2026 全部屆次、生醫相關化學獎，以及背後的研究技術。', 'Every Physiology or Medicine prize 1901–2026, the biomedically relevant Chemistry prizes, and the techniques behind them.')}</p></div></div>
      <div class="tier-tabs"><button class="${which === 'nobel-medicine' ? 'active' : ''}" data-which="nobel-medicine">${pick('生理學或醫學獎', 'Physiology or Medicine')}</button><button class="${which === 'nobel-chemistry' ? 'active' : ''}" data-which="nobel-chemistry">${pick('化學獎（生醫）', 'Chemistry (biomedical)')}</button><button class="${which === 'research-techniques' ? 'active' : ''}" data-which="research-techniques">${pick('研究技術', 'Research techniques')}</button></div>
      ${which === 'research-techniques' ? `<div class="grid cols-3">${tech.map(c => `<a class="course-card card" href="#course/${c.id}"><span class="ic">${window.HT.icons.render(c.icon, { size: 56 })}</span><div><h3>${esc(pick(c.title, c.titleEn))}</h3><p class="desc">${esc(pick(c.summary, c.summaryEn))}</p></div></a>`).join('')}</div>` :
      Object.keys(decades).sort().map(d => `<h2 style="margin-top:22px">${d}s</h2><ul class="timeline">${decades[d].map(c => `<li><a href="#course/${c.id}">${esc(pick(c.title, c.titleEn))}</a><small>${esc(pick(c.summary, c.summaryEn))}</small></li>`).join('')}</ul>`).join('')}`;
    root.querySelectorAll('[data-which]').forEach(b => b.onclick = () => nobel(root, b.dataset.which));
  }

  // ---------------------------------------------------------------- MCTS demo (tic-tac-toe)
  function winner(b) { const L = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]]; for (const [a, c, d] of L) if (b[a] && b[a] === b[c] && b[a] === b[d]) return b[a]; return b.includes(0) ? 0 : 'draw'; }
  function mcts(board, player, iterations) {
    const root = { board, player, n: 0, w: 0, children: null, move: null };
    const expand = node => { node.children = []; node.board.forEach((v, i) => { if (!v) { const nb = node.board.slice(); nb[i] = node.player; node.children.push({ board: nb, player: -node.player, n: 0, w: 0, children: null, move: i, parent: node }); } }); };
    const rollout = (b, p) => { b = b.slice(); let cur = p; let w = winner(b); while (!w) { const free = b.map((v, i) => v ? -1 : i).filter(i => i >= 0); b[free[Math.floor(Math.random() * free.length)]] = cur; cur = -cur; w = winner(b); } return w === 'draw' ? 0 : w; };
    for (let it = 0; it < iterations; it++) {
      let node = root; const path = [node];
      // selection (UCT)
      while (node.children && node.children.length) { let best = null, bv = -Infinity; for (const c of node.children) { const u = c.n ? (c.w / c.n) + 1.4 * Math.sqrt(Math.log(node.n + 1) / c.n) : Infinity; if (u > bv) { bv = u; best = c; } } node = best; path.push(node); }
      // expansion
      if (!winner(node.board)) { if (!node.children) expand(node); if (node.children.length) { node = node.children[Math.floor(Math.random() * node.children.length)]; path.push(node); } }
      // simulation
      const result = winner(node.board); const r = result === 'draw' ? 0 : result ? result : rollout(node.board, node.player);
      // backup: value from the perspective of the player who moved into the node
      for (const p of path) { p.n++; p.w += (r === 0 ? 0.5 : (r === -p.player ? 1 : 0)); }
    }
    return root;
  }
  function aiPage(root) {
    let board = Array(9).fill(0), human = 1, last = null;
    const lineage = window.HT_CATALOG.filter(c => c.department === 'ai-deepmind');
    const render = () => {
      const w = winner(board);
      root.innerHTML = `<div class="section-head"><div><span class="eyebrow">ALPHAGO → ALPHAFOLD</span><h1>${pick('從 AlphaGo 到 AlphaFold：搜尋＋學習的學理拆解', 'From AlphaGo to AlphaFold: search plus learning, deconstructed')}</h1><p class="subtext">${pick('左側是一個真正在瀏覽器中執行的蒙地卡羅樹搜尋（MCTS）：每一步 AI 跑 2,000 次「選擇→擴展→模擬→回傳」，數字是每個落點的訪問次數與勝率。AlphaGo 把隨機模擬換成價值網路、把均勻先驗換成策略網路。', 'On the left a real Monte-Carlo tree search runs in your browser: each AI move performs 2,000 select → expand → simulate → back-up iterations; numbers show visit counts and win rates per move. AlphaGo replaced random rollouts with a value network and uniform priors with a policy network.')}</p></div></div>
        <div class="sim"><div class="card panel"><h3>MCTS ${pick('示範：井字棋（你是 ○）', 'demo: tic-tac-toe (you are ○)')}</h3><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;max-width:300px">${board.map((v, i) => `<button class="button" style="aspect-ratio:1;font-size:1.6rem;border-radius:12px;position:relative" data-cell="${i}" ${v || w ? 'disabled' : ''}>${v === 1 ? '○' : v === -1 ? '✕' : ''}${last && last.stats[i] ? `<small style="position:absolute;bottom:4px;right:6px;font-size:.6rem;color:var(--muted)">${last.stats[i].n}·${Math.round(last.stats[i].p * 100)}%</small>` : ''}</button>`).join('')}</div><p class="small muted" style="margin-top:10px">${w === 1 ? pick('你贏了！（AI 只跑 2,000 次模擬）', 'You win! (the AI only ran 2,000 simulations)') : w === -1 ? pick('AI 獲勝。', 'The AI wins.') : w === 'draw' ? pick('平手。', 'Draw.') : pick('輪到你。', 'Your move.')}</p><div class="row"><button class="button light small" id="resetBoard">${pick('重新開始', 'Restart')}</button></div></div>
        <div class="card panel"><h3>${pick('AlphaFold 2 管線', 'AlphaFold 2 pipeline')}</h3><svg viewBox="0 0 420 300" style="width:100%" role="img"><defs><marker id="ar" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto"><path d="M0 0L8 4 0 8z" fill="var(--primary)"/></marker></defs>${[['序列 Sequence', 10, 10], ['MSA 搜尋 (JackHMMER/HHblits)', 10, 60], ['模板 Templates', 230, 60], ['Evoformer ×48\nMSA↔Pair 注意力\n三角乘法更新', 10, 120], ['結構模組 Structure module\n不變點注意力 IPA', 10, 200], ['3D 座標 + pLDDT\n循環 Recycling ×3', 230, 200]].map(([t, x, y], i) => `<g><rect x="${x}" y="${y}" width="${i === 2 || i === 5 ? 180 : 200}" height="${t.includes('\n') ? 64 : 34}" rx="8" fill="var(--primary-soft)" stroke="var(--primary)"/>${t.split('\n').map((l, j) => `<text x="${x + 10}" y="${y + 22 + j * 16}" font-size="11" fill="var(--ink)">${esc(l)}</text>`).join('')}</g>`).join('')}<path d="M110 44v16M110 94v26M310 94v26M310 120H212M110 184v16M212 232h18M330 264v10h-220v-10" stroke="var(--primary)" stroke-width="2" fill="none" marker-end="url(#ar)"/></svg><p class="small muted">${pick('Evoformer 讓序列（MSA）表示與殘基配對表示互相更新；結構模組直接輸出每個殘基的旋轉與平移；pLDDT 是每個殘基的信心分數。AlphaFold 3 以 Pairformer 與擴散模型取代結構模組，並擴展到核酸、配體與離子。', 'The Evoformer lets the MSA and pair representations update each other; the structure module outputs a rotation and translation per residue; pLDDT is a per-residue confidence. AlphaFold 3 replaces the structure module with a Pairformer plus diffusion and extends to nucleic acids, ligands and ions.')}</p></div></div>
        <h2 style="margin-top:24px">${pick('系列課程', 'Lineage courses')}</h2><div class="grid cols-3">${lineage.map(c => `<a class="course-card card" href="#course/${c.id}"><span class="ic">${window.HT.icons.render(c.icon, { size: 56 })}</span><div><h3>${esc(pick(c.title, c.titleEn))}</h3><p class="desc">${esc(pick(c.summary, c.summaryEn))}</p></div></a>`).join('')}</div>`;
      root.querySelectorAll('[data-cell]').forEach(b => b.onclick = () => {
        const i = Number(b.dataset.cell); if (board[i] || winner(board)) return; board[i] = human;
        if (!winner(board)) { const tree = mcts(board, -human, 2000); const stats = {}; tree.children.forEach(c => { stats[c.move] = { n: c.n, p: c.n ? c.w / c.n : 0 }; }); const best = tree.children.reduce((a, c) => c.n > a.n ? c : a); board[best.move] = -human; last = { stats }; }
        render();
      });
      root.querySelector('#resetBoard').onclick = () => { board = Array(9).fill(0); last = null; render(); };
    };
    render();
  }
  window.HT = window.HT || {};
  window.HT.explorer = { nobel, aiPage, mcts, winner };
})(window);

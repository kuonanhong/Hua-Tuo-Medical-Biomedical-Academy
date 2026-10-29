/* TCM library page: meridian / acupoint browser with body map, materia medica by category,
   classical formulas by category, classics and master physicians, and external video resources. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const zh = () => window.HT.i18n.isZh();
  const pick = (z, e) => zh() ? z : e;
  let data = null;
  async function ensure() {
    if (window.HT_TCM) { data = window.HT_TCM; return data; }
    await window.HT.loadScript('data/tcm-library.js');
    data = window.HT_TCM; return data;
  }
  function render(root, tab, filter) {
    tab = tab || 'points';
    const tabs = [['points', pick('經絡與穴位', 'Channels & points')], ['herbs', pick('中藥', 'Materia medica')], ['formulas', pick('方劑', 'Formulas')], ['classics', pick('經典與名醫', 'Classics & masters')], ['manual', pick('推拿／按摩／灸罐', 'Manual & external')]];
    let body = '';
    if (tab === 'points') {
      const mer = filter || data.meridians[0].code;
      const m = data.meridians.find(x => x.code === mer) || data.meridians[0];
      const pts = data.points.filter(p => p.code.replace(/[0-9].*$/, '').replace(/-.*$/, '') === m.code || (m.code === 'EX' && p.code.startsWith('EX')));
      body = `<div class="meridian-list">${data.meridians.map(x => `<button class="chip ${x.code === m.code ? 'active' : ''}" data-mer="${x.code}" style="${x.code === m.code ? `background:${x.color};border-color:${x.color}` : ''}">${x.code} ${pick(x.zh, x.en)}</button>`).join('')}</div>
        <p class="subtext" style="margin-top:10px">${esc(pick(m.scope_zh, m.scope_en))} · ${pts.length} ${pick('穴', 'points')}</p>
        <table><thead><tr><th>${pick('代碼', 'Code')}</th><th>${pick('穴名', 'Name')}</th><th>${pick('定位', 'Location')}</th><th>${pick('主治', 'Indications')}</th><th>${pick('針法', 'Needling')}</th></tr></thead><tbody>${pts.map(p => `<tr><td><a href="#course/acu-${p.code.toLowerCase().replace(/[^a-z0-9]+/g, '-')}" data-no-translate>${p.code}</a></td><td data-no-translate><b>${esc(p.zh)}</b><br><small>${esc(p.py)}</small></td><td class="small">${esc(pick(p.loc_zh, p.loc_en))}</td><td class="small">${esc(pick(p.ind_zh, p.ind_en))}</td><td class="small">${esc(p.needle)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'herbs') {
      const cat = filter || data.herbCategories[0].id; const c = data.herbCategories.find(x => x.id === cat) || data.herbCategories[0];
      const hs = data.herbs.filter(h => h.cat === c.id);
      body = `<div class="meridian-list">${data.herbCategories.map(x => `<button class="chip ${x.id === c.id ? 'active' : ''}" data-cat="${x.id}">${pick(x.zh, x.en)}</button>`).join('')}</div>
        <table style="margin-top:12px"><thead><tr><th>${pick('藥名', 'Herb')}</th><th>${pick('性味歸經', 'Nature · channels')}</th><th>${pick('功效', 'Actions')}</th><th>${pick('用量 g', 'Dose g')}</th><th>${pick('注意', 'Caution')}</th></tr></thead><tbody>${hs.map(h => `<tr><td data-no-translate><a href="#course/herb-${h.py.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"><b>${esc(h.zh)}</b></a><br><small>${esc(h.py)} · ${esc(h.latin)}</small></td><td class="small">${esc(h.nature)} · ${esc(h.channels)}</td><td class="small">${esc(pick(h.act_zh, h.act_en))}</td><td class="small">${esc(h.dose)}</td><td class="small">${esc(h.caution)}</td></tr>`).join('')}</tbody></table>`;
    } else if (tab === 'formulas') {
      const cat = filter || data.formulaCategories[0].id; const c = data.formulaCategories.find(x => x.id === cat) || data.formulaCategories[0];
      const fs = data.formulas.filter(f => f.cat === c.id);
      body = `<div class="meridian-list">${data.formulaCategories.map(x => `<button class="chip ${x.id === c.id ? 'active' : ''}" data-fcat="${x.id}">${pick(x.zh, x.en)}</button>`).join('')}</div>
        <div class="grid cols-2" style="margin-top:12px">${fs.map(f => `<div class="card flat"><a href="#course/fx-${f.py.toLowerCase().replace(/[^a-z0-9]+/g, '-')}"><h3 style="margin:0" data-no-translate>${esc(f.zh)} <small class="muted">${esc(f.py)}</small></h3></a><p class="small muted" style="margin:4px 0">${esc(f.source)}</p><p class="small"><b>${pick('組成：', 'Composition: ')}</b>${esc(f.comp)}</p><p class="small"><b>${pick('功效：', 'Actions: ')}</b>${esc(pick(f.act_zh, f.act_en))}</p><p class="small"><b>${pick('主治：', 'Pattern: ')}</b>${esc(pick(f.pat_zh, f.pat_en))}</p>${f.note ? `<p class="small muted">${esc(f.note)}</p>` : ''}</div>`).join('')}</div>`;
    } else if (tab === 'classics') {
      const cls = window.HT_CATALOG.filter(c => c.department === 'tcm-classics');
      body = `<div class="notice">${pick('經典原文連結至公開全文（中國哲學書電子化計劃）；影片資源（如「子子中醫」頻道）僅連結原發布者頁面，點擊後才連線，本站不複製其內容。', 'Classic texts link to public full texts (ctext.org); video resources such as the Zizi TCM channel link only to the original publisher and connect only when clicked; nothing is copied here.')}</div>
        <div class="grid cols-3">${cls.map(c => `<a class="course-card card" href="#course/${c.id}"><span class="ic">${window.HT.icons.course(c, { size: 56 })}</span><div><h3>${esc(pick(c.title, c.titleEn))}</h3><p class="desc">${esc(pick(c.summary, c.summaryEn))}</p></div></a>`).join('')}</div>
        <div class="card" style="margin-top:16px"><h3>${pick('延伸影片與社群資源', 'Video and community resources')}</h3><ul class="source-list"><li><a href="${esc(window.HT_CONFIG.links.ziziTcm)}" target="_blank" rel="noopener">子子中醫（YouTube 搜尋）↗</a> — ${pick('辨證、針灸與推拿示範影片；由原頻道提供。', 'pattern identification, acupuncture and tuina demonstrations by the original channel.')}</li><li><a href="${esc(window.HT_CONFIG.links.smartAction)}" target="_blank" rel="noopener">聰動成長協會 · 技術展示 ↗</a> — ${pick('巴金森病友與家屬資源。', 'Parkinson’s disease resources for patients and families.')}</li><li><a href="${esc(window.HT_CONFIG.links.actionIntelligent)}" target="_blank" rel="noopener">聰動 · 巴金森知識、照顧與世界資源 ↗</a></li></ul></div>`;
    } else {
      const deps = ['tuina', 'thai-massage', 'moxa-cupping', 'qigong', 'acupuncture-technique'];
      body = deps.map(d => { const items = window.HT_CATALOG.filter(c => c.department === d); const dep = window.HT_DEPARTMENTS.departments.find(x => x.id === d); return `<h3 style="margin-top:18px">${esc(pick(dep.title, dep.titleEn))} <small class="muted">${items.length}</small></h3><div class="grid cols-4">${items.map(c => `<a class="course-card card flat" href="#course/${c.id}"><span class="ic" style="flex-basis:44px;width:44px;height:44px">${window.HT.icons.course(c, { size: 44 })}</span><div><h3 style="font-size:.92rem">${esc(pick(c.title, c.titleEn))}</h3></div></a>`).join('')}</div>`; }).join('');
    }
    root.innerHTML = `<div class="section-head"><div><span class="eyebrow">TCM LIBRARY</span><h1>${pick('中醫圖庫：十四經穴、中藥、方劑、經典', 'TCM library: channels, points, herbs, formulas and classics')}</h1><p class="subtext">${pick(`${data.points.length} 穴（含 361 經穴）· ${data.herbs.length} 味中藥 · ${data.formulas.length} 首方劑`, `${data.points.length} points (361 classical) · ${data.herbs.length} medicinals · ${data.formulas.length} formulas`)}</p></div></div>
      <div class="tier-tabs">${tabs.map(([k, l]) => `<button class="${k === tab ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>${body}`;
    root.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => render(root, b.dataset.tab));
    root.querySelectorAll('[data-mer]').forEach(b => b.onclick = () => render(root, 'points', b.dataset.mer));
    root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => render(root, 'herbs', b.dataset.cat));
    root.querySelectorAll('[data-fcat]').forEach(b => b.onclick = () => render(root, 'formulas', b.dataset.fcat));
  }
  window.HT = window.HT || {};
  window.HT.tcmLibrary = { ensure, render };
})(window);

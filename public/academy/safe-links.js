/* External-link guard. Links to trusted academic, governmental, medical-society, AI-provider and
   payment domains open directly (no prompt). Anything else — and any look-alike host (punycode,
   raw IP, data: URLs, suspicious nesting of a trusted brand) — shows one interstitial first so a
   learner is never silently redirected to a scam or imitation site. */
(function (window) {
  'use strict';
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const TRUSTED = [
    // international health & science
    'who.int', 'nih.gov', 'cdc.gov', 'fda.gov', 'medlineplus.gov', 'clinicaltrials.gov', 'nice.org.uk', 'nhs.uk', 'ema.europa.eu', 'ecdc.europa.eu', 'cochranelibrary.com', 'cochrane.org',
    'bmj.com', 'thelancet.com', 'nejm.org', 'jamanetwork.com', 'nature.com', 'science.org', 'cell.com', 'sciencedirect.com', 'springer.com', 'springernature.com', 'wiley.com', 'oup.com', 'academic.oup.com', 'frontiersin.org', 'plos.org', 'mdpi.com', 'karger.com', 'tandfonline.com', 'elsevier.com',
    'uptodate.com', 'medscape.com', 'mayoclinic.org', 'clevelandclinic.org', 'hopkinsmedicine.org', 'drugs.com', 'bnf.nice.org.uk', 'rxlist.com', 'merckmanuals.com', 'msdmanuals.com',
    'heart.org', 'acc.org', 'escardio.org', 'aan.com', 'aans.org', 'cns.org', 'sts.org', 'eacts.org', 'asahq.org', 'esicm.org', 'sccm.org', 'idsociety.org', 'ada.org', 'diabetes.org', 'ginasthma.org', 'goldcopd.org', 'kdigo.org', 'esmo.org', 'asco.org', 'nccn.org', 'aao.org', 'aaos.org', 'boa.ac.uk', 'rcseng.ac.uk', 'rcplondon.ac.uk', 'movementdisorders.org', 'ilae.org', 'ninds.nih.gov', 'nccih.nih.gov', 'parkinson.org', 'michaeljfox.org',
    'nobelprize.org', 'deepmind.google', 'deepmind.com', 'alphafold.ebi.ac.uk', 'ebi.ac.uk', 'uniprot.org', 'rcsb.org', 'wwpdb.org', 'ensembl.org', 'genome.gov', 'arxiv.org', 'biorxiv.org', 'medrxiv.org', 'doi.org', 'orcid.org', 'crossref.org', 'semanticscholar.org', 'researchgate.net', 'scholar.google.com', 'ieee.org', 'acm.org',
    // Taiwan / HK / regional
    'mohw.gov.tw', 'nhi.gov.tw', 'cdc.gov.tw', 'fda.gov.tw', 'hpa.gov.tw', 'nricm.edu.tw', 'tma.tw', 'twmed.org', 'hkbu.edu.hk', 'ha.org.hk', 'moh.gov.sg', 'mhlw.go.jp', 'nhc.gov.cn', 'cfda.gov.cn', 'nmpa.gov.cn',
    // reference & community
    'wikipedia.org', 'wikimedia.org', 'wiktionary.org', 'github.com', 'github.io', 'githubusercontent.com', 'youtube.com', 'youtu.be', 'vimeo.com', 'google.com', 'gstatic.com', 'microsoft.com', 'apple.com', 'mozilla.org', 'w3.org', 'strikingly.com', 'facebook.com',
    // generative-AI providers (opened only when the learner clicks)
    'openai.com', 'chatgpt.com', 'anthropic.com', 'claude.ai', 'gemini.google.com', 'ai.google.dev', 'aistudio.google.com', 'generativelanguage.googleapis.com', 'huggingface.co', 'ollama.com', 'kaggle.com',
    // payment
    'stripe.com', 'ecpay.com.tw', 'paypal.com'
  ];
  const TRUSTED_SUFFIX = ['.edu', '.gov', '.ac.uk', '.edu.tw', '.gov.tw', '.edu.hk', '.gov.hk', '.ac.jp', '.go.jp', '.edu.cn', '.gov.cn', '.edu.au', '.gov.au', '.edu.sg', '.gov.sg', '.ac.kr', '.go.kr', '.ac.in', '.gov.in', '.europa.eu', '.int'];
  const extra = () => (window.HT_CONFIG && Array.isArray(window.HT_CONFIG.trustedDomains) ? window.HT_CONFIG.trustedDomains : []).map(d => String(d).toLowerCase());
  function hostOf(href) { try { return new URL(href, location.href); } catch (e) { return null; } }
  function trusted(url) {
    if (!url) return false;
    if (url.origin === location.origin) return true;
    const h = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return false;
    if (/^xn--|\.xn--/.test(h) || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes('@')) return false;
    const list = TRUSTED.concat(extra());
    const ok = list.some(d => h === d || h.endsWith('.' + d)) || TRUSTED_SUFFIX.some(s => h.endsWith(s));
    return ok;
  }
  function reasons(url) {
    const h = url.hostname.toLowerCase(), out = [];
    const zh = window.HT.i18n.isZh();
    if (url.protocol !== 'https:') out.push(zh ? '未加密連線（非 HTTPS）' : 'Not encrypted (no HTTPS)');
    if (/^xn--|\.xn--/.test(h)) out.push(zh ? '國際化網域（可能仿冒字形）' : 'Punycode host (possible look-alike letters)');
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) out.push(zh ? '直接使用 IP 位址' : 'Raw IP address');
    if (/(login|verify|secure|account|wallet|bonus|free|gift|prize|urgent|bank)/i.test(h + url.pathname)) out.push(zh ? '網址含常見釣魚字眼' : 'URL contains common phishing words');
    if (TRUSTED.some(d => h.includes(d.split('.')[0]) && !(h === d || h.endsWith('.' + d)))) out.push(zh ? '含知名機構名稱但不是其正式網域' : 'Contains a well-known brand name but is not its official domain');
    return out;
  }
  function interstitial(url, a) {
    const zh = window.HT.i18n.isZh(), t = k => window.HT.i18n.t(k);
    const why = reasons(url);
    window.HT.app.dialog(t('safeLinkTitle'), `<p>${esc(t('safeLinkBody'))}</p><p class="card" style="word-break:break-all;font-family:ui-monospace,monospace;font-size:.86rem">${esc(url.href)}</p>${why.length ? `<ul class="small">${why.map(w => `<li>⚠ ${esc(w)}</li>`).join('')}</ul>` : ''}<p class="small muted">${zh ? '學院只會在您點擊時連到外部網站；不會自動轉址。請勿在不明網站輸入帳號、密碼、驗證碼或付款資料。' : 'The academy connects to external sites only when you click; it never redirects automatically. Do not enter passwords, one-time codes or payment details on an unknown site.'}</p><div class="row" style="justify-content:flex-end;margin-top:12px"><button class="button light" id="slCancel">${t('cancel')}</button><a class="button primary" id="slGo" href="${esc(url.href)}" target="_blank" rel="noopener noreferrer nofollow">${t('continueLink')} ↗</a></div>`);
    const body = document.getElementById('dialogBody');
    body.querySelector('#slCancel').onclick = () => window.HT.app.closeDialog();
    body.querySelector('#slGo').onclick = () => setTimeout(() => window.HT.app.closeDialog(), 50);
  }
  function onClick(e) {
    if (!(window.HT_CONFIG && window.HT_CONFIG.externalLinkGuard !== false)) return;
    const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || a.id === 'slGo' || a.hasAttribute('data-allow-external')) return;
    const href = a.getAttribute('href') || '';
    if (!/^(https?:)?\/\//i.test(href) && !/^(javascript|data|vbscript):/i.test(href)) return;
    if (/^(javascript|data|vbscript):/i.test(href)) { e.preventDefault(); return; }
    const url = hostOf(href);
    if (!url || trusted(url)) { if (url && url.origin !== location.origin) { a.target = '_blank'; a.rel = 'noopener noreferrer'; } return; }
    e.preventDefault();
    interstitial(url, a);
  }
  function scan(root) { (root || document).querySelectorAll('a[href^="http"]').forEach(a => { const url = hostOf(a.getAttribute('href')); if (!url || url.origin === location.origin) return; a.target = '_blank'; a.rel = 'noopener noreferrer'; if (!trusted(url)) a.classList.add('external-unverified'); }); }
  document.addEventListener('click', onClick, true);
  window.HT = window.HT || {};
  window.HT.safeLinks = { trusted: href => trusted(hostOf(href)), reasons: href => { const u = hostOf(href); return u ? reasons(u) : []; }, scan, TRUSTED };
})(window);

/* Mentor narration via the Web Speech API. Voices come from the learner's device; browsers do not
   expose a standard gender field, so gender is INFERRED from well-known voice names and labelled as
   such. Narration language follows the page/browser language by default (never GPS or IP). */
(function (window) {
  'use strict';
  const synth = window.speechSynthesis;
  const FEMALE = /female|woman|girl|hsiao|xiao(?!wei)|yating|yaoyao|huihui|nanami|ayumi|haruka|sunhi|heami|yuna|zira|aria|jenny|michelle|ana|emma|olivia|ava|libby|sonia|hazel|susan|catherine|samantha|karen|moira|tessa|fiona|victoria|allison|kate|serena|mei-?jia|sin-?ji|ting-?ting|kyoko|o-?ren|monica|paulina|anna|amelie|marie|alice|federica|elsa|helena|laura|zuzana|joana|luciana|milena|alva|nora|sara|satu|katya|milla|damayanti|kanya|linh|siti|flo|sandy|shelley|grandma|reed(?!a)|zhiyu|xiaoyi|xiaohan|xiaomo|xiaoxuan|xiaorui|xiaoshuang|hiumaan|hiugaai|wanlung(?!.*male)|zhiwei(?!.*male)|female/i;
  const MALE = /\bmale\b|\bman\b|\bboy\b|yunjhe|yunxi|yunyang|yunjian|yunhao|kangkang|zhiwei|keita|naoki|injoon|hyunsu|david|mark|guy|christopher|eric|ryan|brian|jacob|george|william|thomas|daniel|alex\b|fred|lee|rishi|arthur|conrad|henri|jacques|stefan|hans|klaus|luca|diego|jorge|carlos|miguel|pedro|rodrigo|antonio|dmitry|pavel|ivan|yuri|hattori|otoya|ichiro|li-?mu|sin-?hung|wan-?lung|ko-?hung|eddy|rocko|grandpa|aaron|junior|daniel|magnus|oskar|filip|tomas|jakub|kamil|mateusz|neerja|prabhat|hemant|madhur|hamed|naayf|ahmad|omar|fahd/i;
  const DEFAULT = { voiceURI: '', gender: 'auto', rate: 0.95, pitch: 1, style: 'professional', language: 'follow' };
  const STYLE = { professional: { rate: 0.92, pitch: 0.96, pause: 700 }, friendly: { rate: 1.0, pitch: 1.05, pause: 450 }, brisk: { rate: 1.18, pitch: 1.0, pause: 250 } };
  let queue = [], speaking = false, current = null, onStateChange = null;

  function voices() { try { return synth ? synth.getVoices() : []; } catch (e) { return []; } }
  const base = v => String(v || '').toLowerCase().replace('_', '-').split('-')[0];
  function inferGender(voice) {
    const n = voice.name || '';
    if (/\(female\)|female/i.test(n) || /女/.test(n)) return 'female';
    if (/\(male\)|\bmale\b/i.test(n) || /男/.test(n)) return 'male';
    if (MALE.test(n) && !FEMALE.test(n)) return 'male';
    if (FEMALE.test(n)) return 'female';
    return 'unknown';
  }
  function list(lang) {
    const b = base(lang);
    return voices().filter(v => base(v.lang) === b).map(v => ({ voice: v, gender: inferGender(v), local: v.localService }));
  }
  function choose(lang, prefs) {
    const p = Object.assign({}, DEFAULT, prefs || {});
    const candidates = list(lang);
    if (!candidates.length) return null;
    const exact = candidates.find(c => p.voiceURI && c.voice.voiceURI === p.voiceURI);
    if (exact) return exact.voice;
    const full = String(lang || '').toLowerCase().replace('_', '-');
    let pool = candidates.filter(c => String(c.voice.lang).toLowerCase().replace('_', '-') === full);
    if (!pool.length) pool = candidates;
    if (p.gender === 'female' || p.gender === 'male') {
      const g = pool.filter(c => c.gender === p.gender);
      if (g.length) pool = g;
    }
    const local = pool.filter(c => c.local);
    const pick = (local.length ? local : pool);
    return (pick.find(c => c.voice.default) || pick[0]).voice;
  }
  function chunk(text) {
    // Keep utterances short: some engines cut off after ~200 characters.
    const parts = [];
    String(text || '').split(/\n+/).forEach(par => {
      par.split(/(?<=[。．.!?！？；;])\s*/).forEach(s => { s = s.trim(); if (!s) return; while (s.length > 180) { let cut = s.lastIndexOf('，', 180); if (cut < 60) cut = s.lastIndexOf(',', 180); if (cut < 60) cut = 180; parts.push(s.slice(0, cut)); s = s.slice(cut).trim(); } if (s) parts.push(s); });
    });
    return parts;
  }
  function stop() { queue = []; speaking = false; current = null; try { synth && synth.cancel(); } catch (e) { /* ignore */ } onStateChange && onStateChange(false); }
  function speak(text, opts) {
    if (!synth || !window.SpeechSynthesisUtterance) return false;
    stop();
    const o = Object.assign({}, DEFAULT, opts || {});
    const voice = choose(o.lang || document.documentElement.lang || 'zh-TW', o);
    const style = STYLE[o.style] || STYLE.professional;
    queue = chunk(text);
    if (!queue.length) return false;
    speaking = true; onStateChange && onStateChange(true);
    const next = () => {
      if (!speaking || !queue.length) { speaking = false; current = null; onStateChange && onStateChange(false); return; }
      const u = new SpeechSynthesisUtterance(queue.shift());
      if (voice) { u.voice = voice; u.lang = voice.lang; } else { u.lang = o.lang || 'zh-TW'; }
      u.rate = Math.max(0.5, Math.min(2, (o.rate || 1) * style.rate));
      u.pitch = Math.max(0.5, Math.min(2, (o.pitch || 1) * style.pitch));
      u.onend = () => setTimeout(next, queue.length ? style.pause * 0.35 : 0);
      u.onerror = () => setTimeout(next, 50);
      current = u;
      try { synth.speak(u); } catch (e) { next(); }
    };
    next();
    return true;
  }
  function sample(lang) {
    const b = base(lang);
    const S = { zh: '先確認病人身份與適應症，再觀察舌脈與生命徵象，最後完成這一步的驗收。', en: 'First confirm the patient and the indication. Then observe the tongue, pulse and vital signs, and complete the acceptance check for this step.', ja: 'まず患者と適応を確認し、次に舌と脈、バイタルサインを観察して、このステップの合格基準を満たしましょう。', ko: '먼저 환자와 적응증을 확인하고, 설진과 맥진, 활력징후를 관찰한 뒤 이 단계의 합격 기준을 완료하세요.', es: 'Primero confirma al paciente y la indicación; luego observa la lengua, el pulso y las constantes, y completa el criterio de este paso.', fr: 'Confirmez d’abord le patient et l’indication, observez la langue, le pouls et les constantes, puis validez cette étape.', de: 'Bestätigen Sie zuerst Patient und Indikation, beobachten Sie Zunge, Puls und Vitalzeichen und schließen Sie diesen Schritt ab.', pt: 'Primeiro confirme o paciente e a indicação; depois observe a língua, o pulso e os sinais vitais e conclua esta etapa.' };
    return S[b] || S.en;
  }
  if (synth && synth.addEventListener) synth.addEventListener('voiceschanged', () => { window.dispatchEvent(new CustomEvent('ht:voices')); });
  window.HT = window.HT || {};
  window.HT.voice = { DEFAULT, STYLE, voices, list, choose, inferGender, speak, stop, sample, get speaking() { return speaking; }, set onStateChange(fn) { onStateChange = fn; } };
})(window);

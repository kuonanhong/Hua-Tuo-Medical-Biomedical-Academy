/* Private owner learning pack. Only encrypted bytes are persisted. No remote role is granted. */
(function (window) {
  'use strict';
  const FORMAT = 'huatuo-owner-learning-v1', PAYLOAD = 'huatuo-owner-curriculum-v1';
  const LIMIT = 128 * 1024 * 1024, PLAIN_LIMIT = 256 * 1024 * 1024;
  const encoder = new TextEncoder(), decoder = new TextDecoder('utf-8', { fatal: true });
  let envelope = null, unlocked = null, persistent = false, epoch = 0;
  const chinese = () => !window.HT.i18n || window.HT.i18n.isZh();
  const message = (zh, en) => chinese() ? zh : en;
  function fail(zh, en) { throw new Error(message(zh, en)); }
  function decode64(value, max) {
    if (typeof value !== 'string' || value.length > Math.ceil(max / 3) * 4 + 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) fail('站長教材包格式不正確。', 'Invalid owner learning pack.');
    let raw; try { raw = atob(value); } catch (_) { fail('站長教材包格式不正確。', 'Invalid owner learning pack.'); }
    if (raw.length > max) fail('站長教材包超過支援大小。', 'Owner learning pack is too large.');
    return Uint8Array.from(raw, c => c.charCodeAt(0));
  }
  function validateEnvelope(value) {
    if (!value || value.format !== FORMAT || value.version !== 1 || value.compression !== 'gzip' ||
        !/^[A-Za-z0-9_.-]{4,32}$/.test(value.ownerUsername || '') ||
        value.kdf?.algorithm !== 'PBKDF2' || value.kdf?.hash !== 'SHA-256' || value.kdf?.iterations !== 600000 ||
        value.cipher?.algorithm !== 'AES-GCM' || value.cipher?.tagLength !== 128 ||
        !Number.isInteger(value.payloadBytes) || value.payloadBytes < 1 || value.payloadBytes > PLAIN_LIMIT ||
        typeof value.curriculumVersion !== 'string' || value.curriculumVersion.length > 40) fail('這不是支援的站長加密教材包。', 'This is not a supported encrypted owner learning pack.');
    if (decode64(value.kdf.salt, 32).length !== 32 || decode64(value.cipher.iv, 12).length !== 12) fail('站長教材包加密參數不正確。', 'Invalid owner pack encryption parameters.');
    // Strict size/alphabet check here; decode the large ciphertext only when signing in.
    if (typeof value.ciphertext !== 'string' || value.ciphertext.length < 24 || value.ciphertext.length > LIMIT || !/^[A-Za-z0-9+/]*={0,2}$/.test(value.ciphertext)) fail('站長教材包內容損壞。', 'Owner learning pack is damaged.');
    return value;
  }
  function database(action, value) {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) { reject(new Error('IndexedDB unavailable')); return; }
      const req = window.indexedDB.open('huatuo-owner-vault-v1', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('packs');
      req.onerror = () => reject(req.error || new Error('Storage unavailable'));
      req.onsuccess = () => {
        const db = req.result; let tx;
        try { tx = db.transaction('packs', action === 'get' ? 'readonly' : 'readwrite'); }
        catch (error) { db.close(); reject(error); return; }
        const store = tx.objectStore('packs'), operation = action === 'get' ? store.get('owner') : action === 'put' ? store.put(value, 'owner') : store.delete('owner');
        let result; operation.onsuccess = () => { result = operation.result; };
        tx.oncomplete = () => { db.close(); resolve(result); };
        tx.onabort = tx.onerror = () => { const error = tx.error || new Error('Storage unavailable'); db.close(); reject(error); };
      };
    });
  }
  function status() { return { installed: !!envelope, unlocked: !!unlocked, username: envelope?.ownerUsername || '', version: envelope?.curriculumVersion || '', persistent, courses: unlocked ? unlocked.courseCount : 0, procedures: unlocked ? unlocked.procedureCount : 0 }; }
  async function init() {
    if (envelope) return status();
    try { const stored = await database('get'); if (stored) { envelope = validateEnvelope(stored); persistent = true; } }
    catch (_) { envelope = null; persistent = false; }
    return status();
  }
  function lock() { epoch++; unlocked = null; }
  async function importFile(file) {
    if (!file || !Number.isFinite(file.size) || file.size > LIMIT || file.size < 100 || typeof file.text !== 'function') fail('請選取完整的 .huatuo-owner 私人教材包。', 'Choose the complete private .huatuo-owner learning pack.');
    let value; try { value = JSON.parse(await file.text()); } catch (_) { fail('教材包無法讀取；請重新選取原始檔。', 'Cannot read the learning pack; select the original file.'); }
    value = validateEnvelope(value);
    lock(); envelope = value; persistent = false;
    try { await database('put', value); persistent = true; } catch (_) { /* In private browsing, retain only this tab's encrypted copy. */ }
    return status();
  }
  async function unzip(bytes, expected) {
    if (typeof DecompressionStream === 'undefined') fail('此瀏覽器不支援教材解壓縮；請更新瀏覽器，或使用 start-owner.sh 本機完整版。', 'This browser cannot decompress the pack. Update it or use start-owner.sh for the local full academy.');
    const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    const chunks = []; let count = 0;
    while (true) {
      const item = await reader.read(); if (item.done) break;
      count += item.value.byteLength;
      if (count > expected || count > PLAIN_LIMIT) { await reader.cancel(); fail('教材包解壓縮大小不符。', 'Learning pack decompression size mismatch.'); }
      chunks.push(item.value);
    }
    if (count !== expected) fail('教材包不完整。', 'Learning pack is incomplete.');
    const output = new Uint8Array(count); let offset = 0;
    for (const chunk of chunks) { output.set(chunk, offset); offset += chunk.byteLength; }
    return output;
  }
  function validatePayload(value, expectedUser) {
    const invalid = () => fail('教材包資料結構或內容不安全，請使用原始私人教材包。', 'The learning pack contains invalid or unsafe curriculum data. Use the original private pack.');
    const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
    const slug = v => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{1,159}$/.test(v);
    const integer = (v, low, high) => Number.isInteger(v) && v >= low && v <= high;
    const text = (v, max = 20000) => typeof v === 'string' && v.length <= max;
    const optionalNumber = (v, low, high) => v === undefined || integer(v, low, high);
    const sourceURL = url => {
      if (!text(url, 2048) || url !== url.trim() || /["'<>`\\\u0000-\u001f\u007f]/.test(url)) return null;
      try {
        const parsed = new URL(url);
        return ['https:', 'http:'].includes(parsed.protocol) && !!parsed.hostname && !parsed.username && !parsed.password ? parsed.href : null;
      } catch (_) { return null; }
    };
    // Imported files are untrusted even when encrypted by their sender. They are data,
    // never HTML. Keep comparison signs such as '<5' while rejecting markup tokens.
    let nodes = 0;
    const plainData = (v, depth = 0) => {
      if (++nodes > 3000000 || depth > 24) invalid();
      if (v === null || typeof v === 'boolean') return;
      if (typeof v === 'number') { if (!Number.isFinite(v) || Math.abs(v) > 1e15) invalid(); return; }
      if (typeof v === 'string') {
        if (v.length > 100000 || /<\s*(?:\/?[a-z]|!|\?)/i.test(v) || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v)) invalid();
        return;
      }
      if (Array.isArray(v)) { if (v.length > 10000) invalid(); for (const x of v) plainData(x, depth + 1); return; }
      if (!object(v) || Object.keys(v).length > 512) invalid();
      for (const [key, item] of Object.entries(v)) {
        if (key.length > 160 || ['__proto__', 'prototype', 'constructor'].includes(key)) invalid();
        plainData(item, depth + 1);
      }
    };
    const sources = rows => {
      if (rows === undefined) return;
      if (!Array.isArray(rows) || rows.length > 100) invalid();
      for (let index = 0; index < rows.length; index++) {
        const source = rows[index];
        if (typeof source === 'string') {
          const url = sourceURL(source); if (!url) invalid(); rows[index] = url;
        } else {
          if (!object(source) || (source.title !== undefined && !text(source.title, 1000))) invalid();
          const url = sourceURL(source.url); if (!url) invalid(); source.url = url;
        }
      }
    };
    const choices = (rows, answer) => {
      if (rows === undefined) { if (answer !== undefined) invalid(); return; }
      if (!Array.isArray(rows) || rows.length < 2 || rows.length > 20 || !integer(answer, 0, rows.length - 1)) invalid();
      for (const row of rows) if (!(text(row) || (object(row) && text(row.zh) && text(row.en)))) invalid();
    };
    const metadata = item => {
      if (!object(item) || !slug(item.id) || item.locked || !optionalNumber(item.minutes, 1, 10080) || !optionalNumber(item.stageCount, 1, 500)) invalid();
      if (item.level !== undefined && !['basic', 'intern', 'advanced', 'beginner', 'intermediate', 'expert'].includes(item.level)) invalid();
      if (item.kind !== undefined && !(typeof item.kind === 'string' && /^[a-z][a-z-]{0,39}$/.test(item.kind))) invalid();
      for (const key of ['title', 'titleEn', 'department', 'category', 'categoryEn']) if (item[key] !== undefined && !text(item[key], 1000)) invalid();
      sources(item.sources);
    };
    plainData(value);
    if (!object(value) || value.format !== PAYLOAD || value.version !== 1 || !object(value.owner) || value.owner.username !== expectedUser ||
        !object(value.courses) || !object(value.procedures) || Object.keys(value.courses).length > 256 || Object.keys(value.procedures).length > 256) invalid();
    if ((value.owner.email !== undefined && !text(value.owner.email, 320)) || (value.owner.phone !== undefined && !text(value.owner.phone, 80))) invalid();
    const ids = new Set(), procedureIds = new Set(); let procedureCount = 0;
    for (const [dept, courses] of Object.entries(value.courses)) {
      if (!/^[a-z0-9-]{2,60}$/.test(dept) || !Array.isArray(courses) || courses.length > 5000) invalid();
      for (const course of courses) {
        metadata(course);
        if (ids.has(course.id) || !Array.isArray(course.stages) || !course.stages.length || course.stages.length > 500) invalid();
        ids.add(course.id); const stageIds = new Set();
        for (const stage of course.stages) {
          if (!object(stage) || stage.locked || !optionalNumber(stage.order, 0, 500) || !Array.isArray(stage.steps) || !stage.steps.length || stage.steps.length > 1000) invalid();
          if (stage.id !== undefined) { if (!slug(stage.id) || stageIds.has(stage.id)) invalid(); stageIds.add(stage.id); }
          const stepIds = new Set();
          for (const step of stage.steps) {
            if (!object(step) || !optionalNumber(step.order, 0, 1000)) invalid();
            if (step.id !== undefined) { if (!slug(step.id) || stepIds.has(step.id)) invalid(); stepIds.add(step.id); }
            if (step.quiz !== undefined) {
              if (!object(step.quiz)) invalid();
              choices(step.quiz.options, step.quiz.answer);
              if (step.quiz.optionsEn !== undefined && (!Array.isArray(step.quiz.optionsEn) || step.quiz.optionsEn.length !== step.quiz.options.length || !step.quiz.optionsEn.every(x => text(x)))) invalid();
            }
          }
        }
      }
    }
    for (const [dept, data] of Object.entries(value.procedures)) {
      if (!/^[a-z0-9-]{2,60}$/.test(dept) || !object(data) || !Array.isArray(data.procedures) || data.procedures.length > 5000) invalid();
      for (const procedure of data.procedures) {
        metadata(procedure);
        if (procedureIds.has(procedure.id) || !Array.isArray(procedure.stages) || !procedure.stages.length || procedure.stages.length > 500) invalid();
        procedureIds.add(procedure.id);
        for (const stage of procedure.stages) {
          if (!object(stage) || !optionalNumber(stage.zone, 0, 999) || !optionalNumber(stage.secondZone, 0, 999) || !optionalNumber(stage.order, 0, 500)) invalid();
          if (stage.id !== undefined && !slug(stage.id)) invalid();
          if (stage.hand !== undefined && !['left', 'right', 'both'].includes(stage.hand)) invalid();
          choices(stage.choices, stage.answer);
        }
        if (procedure.stations !== undefined && (!Array.isArray(procedure.stations) || procedure.stations.length > 500)) invalid();
      }
      procedureCount += data.procedures.length;
    }
    if (!ids.size || !procedureCount) invalid();
    return { data: value, courseIds: ids, courseCount: ids.size, procedureCount };
  }
  async function unlock(login, password) {
    await init(); lock(); const token = epoch, current = envelope;
    if (!current) fail('尚未匯入私人站長教材包。請先匯入，再以站長帳號登入。', 'Import the private owner learning pack before signing in as owner.');
    if (String(login).trim().toLowerCase() !== current.ownerUsername.toLowerCase()) fail('請使用此私人教材包的站長帳號。', 'Use the owner username for this private pack.');
    if (!window.crypto?.subtle) fail('請使用支援安全加密的新版瀏覽器，或開啟本機完整版。', 'Use a current browser with Web Crypto, or open the local full academy.');
    let plaintext;
    try {
      const material = await crypto.subtle.importKey('raw', encoder.encode(String(password)), 'PBKDF2', false, ['deriveKey']);
      const key = await crypto.subtle.deriveKey({ name: 'PBKDF2', hash: 'SHA-256', iterations: current.kdf.iterations, salt: decode64(current.kdf.salt, 32) }, material, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(current.cipher.iv, 12), tagLength: 128, additionalData: encoder.encode(FORMAT) }, key, decode64(current.ciphertext, LIMIT));
    } catch (_) { fail('站長密碼不符，或私人教材包已損壞。', 'Owner password is incorrect, or the private pack is damaged.'); }
    const bytes = await unzip(plaintext, current.payloadBytes);
    let parsed; try { parsed = JSON.parse(decoder.decode(bytes), (key, value) => { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Unsafe key'); return value; }); }
    catch (_) { fail('解密後的教材資料不正確。', 'The decrypted curriculum data is invalid.'); }
    const content = validatePayload(parsed, current.ownerUsername);
    if (token !== epoch || current !== envelope) fail('登入已取消，請重新登入。', 'Sign-in was cancelled; sign in again.');
    unlocked = content;
    // This role describes access to a personally imported copy, never the server's member directory.
    return { id: 'owner-local-' + parsed.owner.username.toLowerCase(), username: parsed.owner.username, email: parsed.owner.email || '', phone: parsed.owner.phone || '', role: 'owner-local', permanentAccess: true, accessScope: 'imported-owner-content' };
  }
  async function forget() { lock(); envelope = null; persistent = false; await database('delete').catch(() => {}); }
  window.HT = window.HT || {};
  window.HT.ownerVault = { init, importFile, unlock, lock, forget, status, hasAccess: () => !!unlocked,
    hasCourse: id => !!unlocked && unlocked.courseIds.has(id),
    courses: dept => unlocked && Object.prototype.hasOwnProperty.call(unlocked.data.courses, dept) ? unlocked.data.courses[dept] : null,
    procedures: dept => unlocked && Object.prototype.hasOwnProperty.call(unlocked.data.procedures, dept) ? unlocked.data.procedures[dept] : null };
})(window);

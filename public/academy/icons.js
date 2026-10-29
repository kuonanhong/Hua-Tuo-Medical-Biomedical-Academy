/* Original monoline SVG icon system. Every topic has a unique descriptor
   {g: glyph, a: accent, s: ring segments 0-8, d: dot pattern 0-6, f: flip, b: badge}
   validated at build time. No third-party icon fonts or CDNs are required. */
(function (window) {
  'use strict';
  const G = {
    stethoscope: '<path d="M18 10v16a14 14 0 0 0 28 0V10"/><path d="M32 40v6a9 9 0 0 0 18 0v-8"/><circle cx="50" cy="34" r="4"/><path d="M14 10h8M42 10h8"/>',
    brain: '<path d="M26 12c-6 0-10 4-10 9-4 1-6 5-5 9-3 3-2 8 1 10 0 5 4 8 9 8h5V12z"/><path d="M38 12c6 0 10 4 10 9 4 1 6 5 5 9 3 3 2 8-1 10 0 5-4 8-9 8h-5V12z"/><path d="M26 22c4 0 6 2 6 5M38 30c-4 0-6 2-6 5M20 30h6M38 20h6"/>',
    neuron: '<circle cx="32" cy="30" r="7"/><path d="M27 25 14 12M37 25l13-13M25 34 12 44M39 34l13 10M32 37v17"/><circle cx="14" cy="12" r="3"/><circle cx="50" cy="12" r="3"/><circle cx="12" cy="44" r="3"/><circle cx="52" cy="44" r="3"/>',
    'heart-pulse': '<path d="M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z"/><path d="M12 32h10l4-8 6 16 5-12 3 4h12"/>',
    'heart-surgery': '<path d="M32 54S8 40 8 24a12 12 0 0 1 24-4 12 12 0 0 1 24 4c0 16-24 30-24 30z"/><path d="M24 22l16 16M40 22 24 38"/><circle cx="32" cy="30" r="3"/>',
    vessel: '<path d="M10 32c8 0 8-14 16-14s8 28 16 28 8-14 12-14"/><path d="M10 40c8 0 8-14 16-14s8 20 16 20"/><circle cx="48" cy="18" r="5"/><path d="M45 18h6M48 15v6"/>',
    lungs: '<path d="M32 12v26M32 22c-4 0-6 3-9 3-7 0-13 6-13 15 0 5 2 8 6 8 6 0 16-6 16-14z"/><path d="M32 22c4 0 6 3 9 3 7 0 13 6 13 15 0 5-2 8-6 8-6 0-16-6-16-14z"/><path d="M26 12h12"/>',
    lung: '<path d="M32 10v30"/><path d="M32 24c-6 0-8 4-12 4-6 0-10 6-10 14 0 4 2 6 5 6 6 0 17-6 17-14z"/><path d="M32 24c6 0 8 4 12 4 6 0 10 6 10 14 0 4-2 6-5 6-6 0-17-6-17-14z"/>',
    bone: '<path d="M18 14a5 5 0 1 0-4 8l16 16a5 5 0 1 0 8 4 5 5 0 1 0 4-8L26 18a5 5 0 1 0-8-4z"/><path d="M40 22l4-4M22 42l-4 4"/>',
    joint: '<path d="M12 16h14l4 8h4l4-8h14"/><circle cx="32" cy="32" r="8"/><path d="M12 48h14l4-8h4l4 8h14"/>',
    joints: '<circle cx="20" cy="20" r="6"/><circle cx="44" cy="20" r="6"/><circle cx="20" cy="44" r="6"/><circle cx="44" cy="44" r="6"/><path d="M26 20h12M20 26v12M44 26v12M26 44h12"/>',
    spine: '<path d="M32 8v48"/><rect x="24" y="12" width="16" height="8" rx="3"/><rect x="24" y="24" width="16" height="8" rx="3"/><rect x="24" y="36" width="16" height="8" rx="3"/><rect x="24" y="48" width="16" height="6" rx="3"/><path d="M16 16h8M40 16h8M16 28h8M40 28h8M16 40h8M40 40h8"/>',
    scalpel: '<path d="M10 54 38 26"/><path d="M34 22l8-8c6-6 14-2 12 6l-14 14z"/><path d="M38 30l-6-6"/>',
    kidney: '<path d="M26 12c-8 0-14 8-14 20s6 20 14 20c6 0 8-4 8-10v-4c-6 0-8-2-8-6s2-6 8-6v-4c0-6-2-10-8-10z"/><path d="M34 22h6a8 8 0 0 1 8 8v12"/>',
    kidney2: '<path d="M38 12c8 0 14 8 14 20s-6 20-14 20c-6 0-8-4-8-10v-4c6 0 8-2 8-6s-2-6-8-6v-4c0-6 2-10 8-10z"/><path d="M30 22h-6a8 8 0 0 0-8 8v12"/>',
    liver: '<path d="M10 24c0-6 6-10 14-10h20c6 0 10 4 10 10 0 10-10 20-26 24C16 50 10 36 10 24z"/><path d="M30 14v20M22 28h12"/>',
    stomach: '<path d="M24 10v10c0 6-4 8-4 14 0 10 8 18 18 18 8 0 14-6 14-14 0-6-4-10-10-10-6 0-8 4-8 8"/><path d="M18 10h10"/>',
    gland: '<path d="M20 20c-6 6-6 16 0 22M44 20c6 6 6 16 0 22"/><path d="M26 14c6-4 6-4 12 0M26 50c6 4 6 4 12 0"/><ellipse cx="32" cy="32" rx="8" ry="10"/>',
    eye: '<path d="M6 32s10-16 26-16 26 16 26 16-10 16-26 16S6 32 6 32z"/><circle cx="32" cy="32" r="8"/><circle cx="32" cy="32" r="3"/>',
    ear: '<path d="M22 46c0 6 4 10 10 10s8-4 10-10c4-10 8-14 8-24a16 16 0 0 0-32 0"/><path d="M26 22a6 6 0 0 1 12 0c0 6-6 8-6 14"/>',
    nose: '<path d="M32 10c0 12-8 20-8 30 0 6 4 10 8 10s8-4 8-10c0-10-8-18-8-30z"/><circle cx="26" cy="48" r="3"/><circle cx="38" cy="48" r="3"/>',
    throat: '<path d="M22 8v14c0 8-8 10-8 20v14M42 8v14c0 8 8 10 8 20v14"/><path d="M26 30h12M26 38h12M28 46h8"/>',
    tooth: '<path d="M20 14c6-4 10-2 12 0 2-2 6-4 12 0 6 4 6 12 2 20-2 6-2 20-6 20s-4-10-8-10-4 10-8 10-4-14-6-20c-4-8-4-16 2-20z"/>',
    skin: '<path d="M10 20c8-8 12 8 20 0s12 8 24 0"/><path d="M10 32c8-8 12 8 20 0s12 8 24 0"/><path d="M10 44c8-8 12 8 20 0s12 8 24 0"/>',
    hand: '<path d="M22 32V14a3 3 0 0 1 6 0v14M28 28V10a3 3 0 0 1 6 0v18M34 28V12a3 3 0 0 1 6 0v18M40 30v-8a3 3 0 0 1 6 0v18c0 10-6 16-14 16s-14-6-16-12l-6-12a3 3 0 0 1 6-2l6 8"/>',
    'hand-press': '<path d="M14 36c0-4 4-6 8-4l8 6V20a3 3 0 0 1 6 0v14M36 34V16a3 3 0 0 1 6 0v18M42 34v-8a3 3 0 0 1 6 0v12c0 8-6 16-14 16-6 0-10-2-14-6l-6-6"/><path d="M10 10l6 6M20 6l2 8"/>',
    fetus: '<circle cx="32" cy="32" r="22"/><circle cx="34" cy="26" r="6"/><path d="M28 32c-6 2-8 8-4 12 4 4 10 2 12-2"/>',
    uterus: '<path d="M32 22v16"/><path d="M20 20c-6 0-8 6-6 10 2 6 8 8 10 14M44 20c6 0 8 6 6 10-2 6-8 8-10 14"/><path d="M24 44c0 6 4 10 8 10s8-4 8-10c0-6-4-8-8-8s-8 2-8 8z"/><circle cx="14" cy="16" r="4"/><circle cx="50" cy="16" r="4"/>',
    child: '<circle cx="32" cy="16" r="7"/><path d="M20 56V34a12 12 0 0 1 24 0v22M20 42h24"/>',
    baby: '<circle cx="32" cy="22" r="10"/><path d="M28 14c2-6 6-6 8 0"/><path d="M16 56c0-12 8-18 16-18s16 6 16 18"/><circle cx="28" cy="22" r="1.5"/><circle cx="36" cy="22" r="1.5"/>',
    mask: '<path d="M12 24h40v10c0 10-8 18-20 18S12 44 12 34z"/><path d="M12 28c-4 0-6 4-4 8M52 28c4 0 6 4 4 8"/><path d="M20 32h24M22 40h20"/>',
    spark: '<path d="M32 8v12M32 44v12M8 32h12M44 32h12M15 15l8 8M41 41l8 8M49 15l-8 8M23 41l-8 8"/><circle cx="32" cy="32" r="5"/>',
    ambulance: '<rect x="6" y="22" width="34" height="22" rx="3"/><path d="M40 28h10l8 8v8H40z"/><circle cx="16" cy="48" r="4"/><circle cx="48" cy="48" r="4"/><path d="M20 30v8M16 34h8"/>',
    monitor: '<rect x="8" y="12" width="48" height="32" rx="4"/><path d="M14 30h8l4-8 6 16 5-12 3 4h10M24 52h16"/>',
    blood: '<path d="M32 8s16 18 16 30a16 16 0 0 1-32 0C16 26 32 8 32 8z"/><path d="M24 40a8 8 0 0 0 8 8"/>',
    ribbon: '<path d="M22 10c-6 6-6 14 0 22l14 20M42 10c6 6 6 14 0 22L28 52"/><path d="M22 10h20v8c0 6-10 10-10 10s-10-4-10-10z"/>',
    radiation: '<circle cx="32" cy="32" r="5"/><path d="M32 10a22 22 0 0 1 19 11l-14 8a6 6 0 0 0-5-3zM13 21a22 22 0 0 1 19-11v16a6 6 0 0 0-5 3zM32 54a22 22 0 0 1-19-11l14-8a6 6 0 0 0 10 0l14 8a22 22 0 0 1-19 11z"/>',
    virus: '<circle cx="32" cy="32" r="12"/><path d="M32 8v12M32 44v12M8 32h12M44 32h12M15 15l8 8M41 41l8 8M49 15l-8 8M23 41l-8 8"/><circle cx="32" cy="8" r="2"/><circle cx="56" cy="32" r="2"/><circle cx="32" cy="56" r="2"/><circle cx="8" cy="32" r="2"/>',
    mind: '<path d="M32 10a18 18 0 0 1 18 18c0 6-3 9-6 12v8H26v-6h-6a4 4 0 0 1-4-4v-6l-4-2 4-6a18 18 0 0 1 16-14z"/><path d="M28 26c0-4 8-4 8 0 0 3-4 3-4 7"/>',
    walk: '<circle cx="36" cy="12" r="5"/><path d="M34 20l-8 12 8 6-4 16M34 20l6 10 8 2M26 32l-10 2M34 38l10 14"/>',
    family: '<circle cx="20" cy="18" r="6"/><circle cx="44" cy="18" r="6"/><circle cx="32" cy="34" r="5"/><path d="M8 50v-8a12 12 0 0 1 12-12M56 50v-8a12 12 0 0 0-12-12M22 56v-6a10 10 0 0 1 20 0v6"/>',
    xray: '<rect x="10" y="8" width="44" height="48" rx="4"/><path d="M32 14v36M24 20h16M22 28h20M24 36h16M26 44h12"/>',
    microscope: '<path d="M28 10l12 12-8 8-12-12z"/><path d="M34 26l-8 8M20 40h22M24 54h24M36 34c8 2 12 8 12 14"/><path d="M14 48h14"/>',
    nurse: '<circle cx="32" cy="20" r="9"/><path d="M14 54a18 18 0 0 1 36 0"/><path d="M26 12h12M32 8v8"/><path d="M28 44h8M32 40v8"/>',
    pill: '<rect x="12" y="24" width="40" height="18" rx="9" transform="rotate(-35 32 33)"/><path d="M26 22l12 20"/>',
    globe: '<circle cx="32" cy="32" r="22"/><path d="M10 32h44M32 10c8 8 8 36 0 44M32 10c-8 8-8 36 0 44M16 18c8 4 24 4 32 0M16 46c8-4 24-4 32 0"/>',
    dna: '<path d="M22 8c0 12 20 12 20 24S22 44 22 56M42 8c0 12-20 12-20 24s20 12 20 24"/><path d="M24 14h16M24 50h16M26 26h12M26 38h12"/>',
    'dna-helix': '<path d="M20 6c0 14 24 14 24 26S20 44 20 58M44 6c0 14-24 14-24 26s24 12 24 26"/><path d="M22 12h20M22 52h20M24 24h16M24 40h16"/>',
    book: '<path d="M12 12h16a6 6 0 0 1 6 6v34a6 6 0 0 0-6-6H12zM52 12H36a6 6 0 0 0-6 6v34a6 6 0 0 1 6-6h16z"/><path d="M18 22h10M18 30h10M36 22h10M36 30h10"/>',
    yinyang: '<circle cx="32" cy="32" r="22"/><path d="M32 10a11 11 0 0 1 0 22 11 11 0 0 0 0 22" fill="currentColor" stroke="none"/><path d="M32 10a22 22 0 0 0 0 44V10z" fill="currentColor" stroke="none" opacity=".25"/><circle cx="32" cy="21" r="3" fill="var(--surface,#fff)" stroke="none"/><circle cx="32" cy="43" r="3" fill="currentColor" stroke="none"/>',
    scroll: '<path d="M16 12h32v36H16z"/><path d="M12 12a4 4 0 0 1 8 0v36a4 4 0 0 1-8 0zM44 12a4 4 0 0 1 8 0v36a4 4 0 0 1-8 0z"/><path d="M24 22h16M24 30h16M24 38h10"/>',
    tongue: '<path d="M18 16h28v14c0 12-6 20-14 20s-14-8-14-20z"/><path d="M32 24v22M24 30c4 2 12 2 16 0"/>',
    needle: '<path d="M14 50 44 20"/><path d="M42 18l6-6M40 24l8 8"/><circle cx="48" cy="14" r="3"/><path d="M12 52l-4 4"/>',
    moxa: '<path d="M22 28h20v22H22z"/><path d="M32 28c-6-6-2-12 0-16 2 4 6 10 0 16zM26 56h12"/><path d="M28 36h8M28 42h8"/>',
    lotus: '<path d="M32 50c-10 0-18-6-20-14 8 0 16 4 20 10 4-6 12-10 20-10-2 8-10 14-20 14z"/><path d="M32 46c-4-8-4-20 0-32 4 12 4 24 0 32z"/><path d="M18 30c2-8 6-12 8-14 2 6 2 12 0 18M46 30c-2-8-6-12-8-14-2 6-2 12 0 18"/>',
    taiji: '<circle cx="32" cy="12" r="5"/><path d="M12 30l20-8 20 8M32 22v18l-12 14M32 40l12 14"/><path d="M8 32h8M48 32h8"/>',
    cauldron: '<path d="M14 24h36l-4 22a8 8 0 0 1-8 8H26a8 8 0 0 1-8-8z"/><path d="M10 24h44M20 14v6M32 10v10M44 14v6M16 54h-4M48 54h4"/>',
    'herb-leaf': '<path d="M52 12C30 12 14 26 14 50c24 0 38-16 38-38z"/><path d="M14 50C24 38 34 28 52 12"/>',
    'herb-root': '<path d="M32 8v16"/><path d="M26 10c-2 6 2 10 6 14 4-4 8-8 6-14"/><path d="M32 24c-10 2-14 10-14 20M32 24c10 2 14 10 14 20M32 24v30M22 36c-4 4-6 10-6 16M42 36c4 4 6 10 6 16"/>',
    'herb-seed': '<ellipse cx="32" cy="34" rx="14" ry="18"/><path d="M32 16c6 8 6 28 0 36M26 24c4 2 8 2 12 0"/>',
    'herb-flower': '<circle cx="32" cy="32" r="6"/><path d="M32 26c-6-10 6-16 6-6M38 32c10-6 16 6 6 6M32 38c6 10-6 16-6 6M26 32c-10 6-16-6-6-6"/><path d="M32 44v12M28 56h8"/>',
    'herb-mineral': '<path d="M20 50 12 30l12-18h16l12 18-8 20z"/><path d="M24 12l8 18 8-18M12 30h40M32 30v20"/>',
    'herb-animal': '<path d="M12 36c0-10 8-18 20-18s20 8 20 18-8 14-20 14-20-4-20-14z"/><path d="M24 18l-6-8M40 18l6-8M18 44l-6 8M46 44l6 8M28 36c2 2 6 2 8 0"/><circle cx="26" cy="30" r="2"/><circle cx="38" cy="30" r="2"/>',
    'herb-bark': '<path d="M20 10h24v44H20z"/><path d="M20 20c8 2 16 2 24 0M20 32c8-2 16-2 24 0M20 44c8 2 16 2 24 0"/>',
    bowl: '<path d="M10 28h44c0 14-10 24-22 24S10 42 10 28z"/><path d="M8 28h48M24 16c0 4 2 6 0 10M32 12c0 4 2 6 0 10M40 16c0 4 2 6 0 10"/>',
    clinic: '<path d="M8 56V24l24-14 24 14v32z"/><path d="M28 56V40h8v16M32 26v10M27 31h10"/>',
    'go-board': '<rect x="10" y="10" width="44" height="44" rx="3"/><path d="M21 10v44M32 10v44M43 10v44M10 21h44M10 32h44M10 43h44"/><circle cx="21" cy="21" r="4" fill="currentColor"/><circle cx="43" cy="32" r="4" fill="var(--surface,#fff)"/><circle cx="32" cy="43" r="4" fill="currentColor"/>',
    crispr: '<path d="M12 20c10 0 10 24 20 24s10-24 20-24"/><path d="M12 44c10 0 10-24 20-24s10 24 20 24"/><path d="M40 10l10 10M50 10 40 20"/>',
    antibody: '<path d="M32 56V30M32 30 16 12M32 30l16-18"/><path d="M12 16l6-6M46 10l6 6M24 40h16"/>',
    'gear-heart': '<circle cx="32" cy="32" r="9"/><path d="M32 12v6M32 46v6M12 32h6M46 32h6M18 18l4 4M42 42l4 4M46 18l-4 4M22 42l-4 4"/><path d="M32 36s-5-3-5-6a2.5 2.5 0 0 1 5-1 2.5 2.5 0 0 1 5 1c0 3-5 6-5 6z"/>',
    bci: '<path d="M32 10a18 18 0 0 1 18 18c0 8-6 12-6 18H20c0-6-6-10-6-18a18 18 0 0 1 18-18z"/><path d="M26 54h12M26 28h12M24 36h16M32 20v8"/><circle cx="32" cy="36" r="2" fill="currentColor"/>',
    sprout: '<path d="M32 56V30"/><path d="M32 30c-12 0-18-8-18-18 10 0 18 6 18 18zM32 36c12 0 18-8 18-18-10 0-18 6-18 18z"/><path d="M20 56h24"/>',
    flask: '<path d="M26 8h12M28 8v16L14 48a4 4 0 0 0 4 6h28a4 4 0 0 0 4-6L36 24V8"/><path d="M20 40h24"/>',
    medal: '<circle cx="32" cy="38" r="14"/><path d="M22 8h8l2 10M42 8h-8l-2 10"/><path d="M32 30l3 6 6 1-4 4 1 6-6-3-6 3 1-6-4-4 6-1z"/>',
    'medal-flask': '<circle cx="24" cy="40" r="12"/><path d="M18 10h12l-6 10zM24 32l2 5 5 1-4 3 1 5-4-2-4 2 1-5-4-3 5-1z"/><path d="M44 12h8M46 12v12l-8 20a3 3 0 0 0 3 4h12a3 3 0 0 0 3-4l-8-20V12"/>',
    pipette: '<path d="M38 8l18 18M44 14l-20 20-6 6a6 6 0 0 1-8 0 6 6 0 0 1 0-8l6-6 20-20"/><path d="M14 44l-6 12"/>',
    acupoint: '<path d="M32 6a6 6 0 0 1 0 12 6 6 0 0 1 0-12z"/><path d="M24 20h16l4 16-6 2-2-8v26h-4V40h-2v16h-4V30l-2 8-6-2z"/>',
    robot: '<rect x="14" y="20" width="36" height="28" rx="6"/><path d="M32 10v10M24 48v8M40 48v8"/><circle cx="25" cy="32" r="3"/><circle cx="39" cy="32" r="3"/><path d="M26 42h12M8 30v8M56 30v8"/>',
    beam: '<path d="M8 32h20"/><path d="M28 24l24-14M28 40l24 14M28 32h28"/><circle cx="20" cy="32" r="8"/>',
    waves: '<path d="M8 24c6 0 6 8 12 8s6-8 12-8 6 8 12 8 6-8 12-8"/><path d="M8 40c6 0 6 8 12 8s6-8 12-8 6 8 12 8 6-8 12-8"/>',
  };
  const esc = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const DOTS = [[], [[12,10]], [[12,10],[52,10]], [[12,10],[32,8],[52,10]], [[12,10],[52,10],[12,54],[52,54]], [[12,10],[32,8],[52,10],[12,54],[52,54]], [[12,10],[22,8],[42,8],[52,10],[12,54],[52,54]]];

  function arc(cx, cy, r, a0, a1) {
    const p = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1);
    return `M${x0.toFixed(1)} ${y0.toFixed(1)}A${r} ${r} 0 0 1 ${x1.toFixed(1)} ${y1.toFixed(1)}`;
  }

  function render(desc, opts) {
    desc = desc || { g: 'stethoscope', a: '#1f6f5f', s: 0, d: 0, f: 0, b: '' };
    const o = Object.assign({ size: 56, title: '' }, opts || {});
    const glyph = G[desc.g] || G.stethoscope;
    const accent = /^#[0-9a-fA-F]{6}$/.test(desc.a || '') ? desc.a : '#1f6f5f';
    let ring = '';
    for (let i = 0; i < (desc.s || 0); i++) {
      const a0 = -Math.PI / 2 + i * (Math.PI / 4) + 0.06, a1 = a0 + Math.PI / 4 - 0.12;
      ring += `<path d="${arc(32, 32, 29.5, a0, a1)}" stroke="${accent}" stroke-width="2.2" fill="none" stroke-linecap="round" opacity=".85"/>`;
    }
    const dots = (DOTS[desc.d || 0] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="1.8" fill="${accent}" opacity=".9"/>`).join('');
    const badge = desc.b ? `<rect x="36" y="44" width="22" height="14" rx="5" fill="${accent}"/><text x="47" y="54.5" font-size="9.5" font-weight="700" text-anchor="middle" fill="#fff" font-family="Inter,system-ui,sans-serif">${esc(desc.b).slice(0, 4)}</text>` : '';
    const flip = desc.f ? ' transform="translate(64 0) scale(-1 1)"' : '';
    return `<svg viewBox="0 0 64 64" width="${o.size}" height="${o.size}" role="img" aria-label="${esc(o.title)}" xmlns="http://www.w3.org/2000/svg"><rect x="2" y="2" width="60" height="60" rx="16" fill="${accent}" opacity=".13"/>${ring}${dots}<g fill="none" stroke="${accent}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"${flip} style="color:${accent}"><g transform="translate(8 8) scale(.75)">${glyph}</g></g>${badge}</svg>`;
  }

  function glyphOnly(name, color, size) {
    return `<svg viewBox="0 0 64 64" width="${size || 24}" height="${size || 24}" aria-hidden="true" xmlns="http://www.w3.org/2000/svg"><g fill="none" stroke="${color || 'currentColor'}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" style="color:${color || 'currentColor'}">${G[name] || G.stethoscope}</g></svg>`;
  }

  // v3.9 — real medical images for departments and courses (assets/dept-icons/, credits in manifest.js and
  // docs/V39_DEPARTMENT_ICON_CREDITS.md). The SVG glyph stays underneath as the fallback if a photo is missing.
  const photoIndex = () => (window.HT_DEPT_ICON_INDEX || {});
  function hash(s) { let h = 2166136261; for (const ch of String(s || '')) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  function photoFile(dept, seed) {
    const list = photoIndex()[dept];
    if (!Array.isArray(list) || !list.length) return '';
    const file = list[seed ? hash(seed) % list.length : 0];
    return /^[a-z0-9-]+\.jpg$/.test(file) ? 'assets/dept-icons/' + file : '';
  }
  function photo(dept, opts) {
    const o = Object.assign({ size: 56, seed: '', badge: '', accent: '#3b7a9e', title: '', fallback: '' }, opts || {});
    const file = photoFile(dept, o.seed);
    if (!file) return o.fallback;
    const accent = /^#[0-9a-fA-F]{6}$/.test(o.accent || '') ? o.accent : '#3b7a9e';
    const zh = /^zh/i.test(document.documentElement.lang || '');
    const tip = (o.title ? o.title + ' · ' : '') + (zh ? '真實醫學影像（授權見來源頁）' : 'Real medical image (licence on the sources page)');
    return `<span class="ic-photo" style="--ic-size:${o.size}px;--ic-accent:${accent}" title="${esc(tip)}">${o.fallback ? `<span class="ic-photo-fallback" aria-hidden="true">${o.fallback}</span>` : ''}<img src="${file}" alt="" width="${o.size}" height="${o.size}" loading="lazy" decoding="async">${o.badge ? `<b class="ic-badge">${esc(o.badge).slice(0, 4)}</b>` : ''}</span>`;
  }
  function course(c, opts) {
    const o = Object.assign({ size: 56 }, opts || {});
    const svg = render(c && c.icon, { size: o.size, title: o.title || (c && c.title) || '' });
    if (!c || !c.department) return svg;
    return photo(c.department, { size: o.size, seed: c.id, badge: c.icon && c.icon.b, accent: c.icon && c.icon.a, title: o.title || c.title || '', fallback: svg }) || svg;
  }
  function dept(id, accent, glyph, size) {
    const svg = glyphOnly(glyph, accent, size);
    return photo(id, { size: size || 44, accent, fallback: svg }) || svg;
  }

  window.HT = window.HT || {};
  window.HT.icons = { render, glyphOnly, photo, photoFile, course, dept, glyphs: Object.keys(G), library: G };
})(window);

/* DYSON emoji: builds the list from the emoji THIS device can actually draw (no fixed short list), with categories + recents. */
(function () {
  const { h } = D;
  const CATS = [
    ['😀', 'Smileys', [[0x1F600, 0x1F64F], [0x1F910, 0x1F92F], [0x1F970, 0x1F97F], [0x1F47B, 0x1F480], [0x1F4A9, 0x1F4A9], [0x1FAE0, 0x1FAE8]]],
    ['👋', 'People', [[0x1F440, 0x1F47A], [0x1F481, 0x1F4A8], [0x1F4AA, 0x1F4AA], [0x1F574, 0x1F57A], [0x1F590, 0x1F596], [0x1F91A, 0x1F93F], [0x1F9B0, 0x1F9BF], [0x1F9D0, 0x1F9DF], [0x261D, 0x261D], [0x270A, 0x270D], [0x1FAF0, 0x1FAF8]]],
    ['🐶', 'Animals & nature', [[0x1F400, 0x1F43F], [0x1F980, 0x1F9AF], [0x1F330, 0x1F344], [0x1F337, 0x1F33F], [0x1F300, 0x1F32C], [0x1FAB0, 0x1FABF]]],
    ['🍔', 'Food & drink', [[0x1F345, 0x1F37F], [0x1F950, 0x1F96F], [0x1F9C0, 0x1F9CB], [0x2615, 0x2615], [0x1FAD0, 0x1FADF]]],
    ['⚽', 'Activities', [[0x1F380, 0x1F3D3], [0x1F3F8, 0x1F3FA], [0x1F93A, 0x1F94F], [0x1F9E7, 0x1F9FF], [0x26BD, 0x26BE], [0x1F3A0, 0x1F3CA]]],
    ['🚗', 'Travel & places', [[0x1F30D, 0x1F30F], [0x1F3D4, 0x1F3F0], [0x1F680, 0x1F6C5], [0x1F6E0, 0x1F6FF], [0x1F3E0, 0x1F3EF]]],
    ['💡', 'Objects', [[0x1F4B0, 0x1F4FF], [0x1F500, 0x1F53D], [0x1F550, 0x1F567], [0x1F9E0, 0x1F9E6], [0x231A, 0x23F3], [0x1F6D0, 0x1F6D2], [0x1FA70, 0x1FAAF]]],
    ['❤️', 'Symbols', [[0x1F493, 0x1F49F], [0x2764, 0x2764], [0x1F5A4, 0x1F5A4], [0x1F90D, 0x1F90F], [0x2600, 0x26FF], [0x2700, 0x27BF], [0x2B50, 0x2B55], [0x1F7E0, 0x1F7EB], [0x2934, 0x2935], [0x1F170, 0x1F251]]],
  ];
  const FLAGS = 'UG KE TZ RW BI SS CD NG GH ZA EG ET SD SO ZM ZW MW MZ AO NA BW CM SN CI MA DZ TN LY US CA MX BR AR CO CL PE VE GB IE FR DE ES IT PT NL BE CH AT SE NO DK FI PL UA RU TR GR IN PK BD LK NP CN JP KR ID PH VN TH MY SG AU NZ SA AE QA KW IL IR IQ JO LB'.split(' ');
  const tofu = '\u{10FFFF}';
  let built = null;

  const probe = () => {
    const c = document.createElement('canvas'); c.width = c.height = 24;
    const x = c.getContext('2d', { willReadFrequently: true }); x.font = '18px sans-serif,"Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji"'; x.textBaseline = 'top';
    const sig = (s) => { x.clearRect(0, 0, 24, 24); x.fillText(s, 1, 1); const d = x.getImageData(0, 0, 24, 24).data; let a = 0, col = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3]) { a++; if (Math.abs(d[i] - d[i + 1]) > 18 || Math.abs(d[i + 1] - d[i + 2]) > 18) col++; } } return { a, col, w: x.measureText(s).width }; };
    const bad = sig(tofu), face = sig('😀');
    // drawable = has ink, differs from the missing-glyph box, and is a colour emoji
    return { ok: (s) => { const r = sig(s); return r.a > 8 && r.col > 6 && !(r.a === bad.a && Math.abs(r.w - bad.w) < 0.5); }, face };
  };

  function build() {
    if (built) return built;
    let p; try { p = probe(); } catch (e) { p = null; }
    built = scan(p); // canvas blocked (privacy mode)? fall back to every pictographic symbol without the draw test
    if (built.reduce((n, c) => n + c.list.length, 0) < 40) built = scan(null);
    return built;
  }
  function scan(p0) {
    const p = p0 || { ok: (s) => /\p{Emoji_Presentation}|\uFE0F/u.test(s), face: null }, seen = new Set(), out = [];
    const emojiRe = /\p{Extended_Pictographic}/u;
    for (const [icon, name, ranges] of CATS) {
      const list = [];
      for (const [a, b] of ranges) for (let cp = a; cp <= b; cp++) {
        const ch = String.fromCodePoint(cp); if (!emojiRe.test(ch) || seen.has(cp)) continue;
        const e = cp < 0x1F000 || [0x2764, 0x2600, 0x261D, 0x270C, 0x270D].includes(cp) ? ch + '\uFE0F' : ch;
        if (p.ok(e)) { seen.add(cp); list.push(e); }
      }
      if (list.length) out.push({ icon, name, list });
    }
    const fl = []; // flags: only when the device draws them as a flag (not two letters)
    for (const c of FLAGS) { const s = String.fromCodePoint(...[...c].map((l) => 0x1F1E6 + l.charCodeAt(0) - 65)); fl.push(s); }
    if (fl.length && p.ok(fl[0])) out.push({ icon: '🏳️', name: 'Flags', list: fl });
    return out;
  }

  const recent = () => { try { return JSON.parse(localStorage.getItem('dyson-recent-emoji') || '[]'); } catch (e) { return []; } };
  const remember = (e) => { const r = [e, ...recent().filter((x) => x !== e)].slice(0, 24); try { localStorage.setItem('dyson-recent-emoji', JSON.stringify(r)); } catch (x) { /* storage full */ } };

  // D.emojiPicker(onPick) -> element with category tabs and a scrolling grid of every emoji the device supports
  D.emojiPicker = (onPick) => {
    const cats = build().slice(), rec = recent(); if (rec.length) cats.unshift({ icon: '🕘', name: 'Recent', list: rec });
    const grid = h('div', { class: 'ep-grid' }), tabs = h('div', { class: 'ep-tabs', role: 'tablist' });
    cats.forEach((c, i) => {
      const sec = h('section', { class: 'ep-sec', id: 'ep-' + i }, h('h4', {}, c.name), h('div', { class: 'ep-row' }, ...c.list.map((e) => h('button', { type: 'button', class: 'ep-e', 'data-e': e, 'aria-label': e }, e))));
      grid.append(sec);
      tabs.append(h('button', { type: 'button', class: 'ep-t', 'aria-label': c.name, title: c.name, onclick: () => grid.scrollTo({ top: sec.offsetTop, behavior: 'smooth' }) }, c.icon));
    });
    grid.addEventListener('click', (ev) => { const b = ev.target.closest('.ep-e'); if (!b) return; remember(b.dataset.e); onPick(b.dataset.e); });
    return h('div', { class: 'ep' }, tabs, grid);
  };

  // Bottom sheet with the full picker (used by the "+" in the reaction bar)
  D.emojiSheet = (onPick) => {
    const m = h('div', { class: 'sheet', onclick: (e) => { if (e.target === m) m.remove(); } }, h('div', { class: 'sheet-card' }, h('div', { class: 'sheet-grip' }), D.emojiPicker((e) => { m.remove(); onPick(e); })));
    document.body.append(m);
  };
})();

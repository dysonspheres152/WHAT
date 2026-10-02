/* DYSON interactions: long-press message menu (react + reply), swipe to reply, pop-up menus, pinch-zoom for images, no page zoom */
(function () {
  const { h } = D;
  const REACT = ['❤️', '👍', '😂', '😮', '😢', '🙏'];
  let pop = null;
  D.closeMenu = () => { if (pop) { pop.remove(); pop = null; document.querySelectorAll('.msg.lp').forEach((m) => m.classList.remove('lp')); } };

  // Long press (touch / mouse) or right click. Fires fn(x, y). The click that follows a long press is swallowed.
  D.longPress = (el, fn) => {
    let t, x = 0, y = 0, fired = false;
    const cancel = () => clearTimeout(t);
    el.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return; fired = false; x = e.clientX; y = e.clientY; cancel();
      t = setTimeout(() => { fired = true; if (navigator.vibrate) navigator.vibrate(12); fn(x, y); }, 420);
    });
    el.addEventListener('pointermove', (e) => { if (Math.abs(e.clientX - x) > 10 || Math.abs(e.clientY - y) > 10) cancel(); });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach((n) => el.addEventListener(n, cancel));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); cancel(); if (!fired) { fired = true; fn(e.clientX, e.clientY); } });
    el.addEventListener('click', (e) => { if (fired) { e.preventDefault(); e.stopPropagation(); fired = false; } }, true);
  };

  // Drag a message to the right to reply (touch only)
  D.swipeReply = (row, bub, fn) => {
    let sx = 0, sy = 0, dx = 0, on = false, lock = false;
    bub.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'touch') return; sx = e.clientX; sy = e.clientY; dx = 0; on = true; lock = false; });
    bub.addEventListener('pointermove', (e) => {
      if (!on) return; const mx = e.clientX - sx, my = e.clientY - sy;
      if (!lock && Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) { on = false; return; }
      if (Math.abs(mx) > 10) lock = true; if (!lock) return;
      dx = Math.max(0, Math.min(mx, 90)); row.style.transform = `translateX(${dx}px)`;
    });
    const end = () => { if (!on) return; on = false; row.style.transition = 'transform .15s'; row.style.transform = ''; setTimeout(() => (row.style.transition = ''), 160); if (dx > 60) fn(); dx = 0; };
    ['pointerup', 'pointercancel'].forEach((n) => bub.addEventListener(n, end));
  };

  // The WhatsApp-style menu: reaction bar (with "+" for every emoji on the device) and Reply / Copy
  D.msgMenu = (row, o) => {
    D.closeMenu(); row.classList.add('lp');
    const mine = o.mineReacts || [];
    const bar = h('div', { class: 'mm-react' }, ...REACT.map((e) => h('button', { type: 'button', class: mine.includes(e) ? 'on' : '', 'aria-label': 'React ' + e, onclick: () => { D.closeMenu(); o.onReact(e); } }, e)),
      h('button', { type: 'button', class: 'more', 'aria-label': 'More emoji', onclick: () => { D.closeMenu(); D.emojiSheet(o.onReact); } }, '+'));
    const acts = h('div', { class: 'mm-acts' },
      h('button', { type: 'button', onclick: () => { D.closeMenu(); o.onReply(); } }, D.ic('reply', 'sm'), 'Reply'),
      o.text ? h('button', { type: 'button', onclick: () => { D.closeMenu(); (navigator.clipboard ? navigator.clipboard.writeText(o.text) : Promise.reject()).then(() => D.toast('Copied.', 'success', 1200)).catch(() => D.toast('Could not copy.', 'error', 1500)); } }, D.ic('copy', 'sm'), 'Copy') : '',
      ...(o.extra || []).map((a) => h('button', { type: 'button', onclick: () => { D.closeMenu(); a.fn(); } }, a.label)));
    const card = h('div', { class: 'mm-card' }, bar, acts);
    pop = h('div', { class: 'mm', onclick: (e) => { if (e.target === pop) D.closeMenu(); }, oncontextmenu: (e) => { e.preventDefault(); D.closeMenu(); } }, card);
    document.body.append(pop);
    const r = row.getBoundingClientRect(), w = card.offsetWidth, hh = card.offsetHeight;
    let top = r.top - hh - 8; if (top < 8) top = Math.min(r.bottom + 8, innerHeight - hh - 8);
    let left = o.mine ? r.right - w : r.left; left = Math.max(8, Math.min(left, innerWidth - w - 8));
    card.style.top = Math.max(8, top) + 'px'; card.style.left = left + 'px';
  };
  addEventListener('keydown', (e) => { if (e.key === 'Escape') D.closeMenu(); });

  // Small floating menu next to a button: items = [{icon,label,fn}]
  D.popMenu = (items, anchor) => {
    D.closeMenu();
    const card = h('div', { class: 'pm-card' }, ...items.map((i) => h('button', { type: 'button', onclick: () => { D.closeMenu(); i.fn(); } }, D.ic(i.icon, 'sm'), i.label)));
    pop = h('div', { class: 'mm plain' }, card); pop.onclick = (e) => { if (e.target === pop) D.closeMenu(); }; document.body.append(pop);
    const r = anchor.getBoundingClientRect(), w = card.offsetWidth, hh = card.offsetHeight, fromBottom = r.top > innerHeight / 2;
    card.style.left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8)) + 'px';
    card.style.top = (fromBottom ? Math.max(8, r.top - hh - 8) : Math.min(r.bottom + 6, innerHeight - hh - 8)) + 'px';
  };

  // Pinch / wheel / double-tap zoom and pan. Used ONLY on images the user opens; the rest of the app cannot be zoomed.
  D.zoomable = (img) => {
    let s = 1, tx = 0, ty = 0, d0 = 0, s0 = 1, tap = 0; const pts = new Map();
    img.classList.add('zoomable'); img.draggable = false;
    const clamp = () => { if (s <= 1) { s = 1; tx = ty = 0; return; } const mx = (img.clientWidth * (s - 1)) / 2, my = (img.clientHeight * (s - 1)) / 2; tx = Math.max(-mx, Math.min(mx, tx)); ty = Math.max(-my, Math.min(my, ty)); };
    const apply = () => { clamp(); img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; };
    const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
    img.addEventListener('pointerdown', (e) => {
      img.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pts.size === 2) { d0 = dist(); s0 = s; }
      const n = Date.now(); if (pts.size === 1 && n - tap < 300) { s = s > 1 ? 1 : 2.5; tx = ty = 0; apply(); } tap = n;
    });
    img.addEventListener('pointermove', (e) => {
      const p = pts.get(e.pointerId); if (!p) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
      if (pts.size === 2) s = Math.min(6, Math.max(1, (s0 * dist()) / (d0 || 1))); else if (s > 1) { tx += dx; ty += dy; }
      apply();
    });
    ['pointerup', 'pointercancel'].forEach((n) => img.addEventListener(n, (e) => { pts.delete(e.pointerId); if (pts.size < 2) { d0 = 0; s0 = s; } }));
    img.addEventListener('wheel', (e) => { e.preventDefault(); s = Math.min(6, Math.max(1, s * (e.deltaY < 0 ? 1.12 : 0.89))); apply(); }, { passive: false });
    return img;
  };

  // Chat screen: block page pinch-zoom, double-tap zoom and ctrl+wheel / ctrl +/-, except on .zoomable images
  if (document.documentElement.hasAttribute('data-nozoom')) {
    const ok = (t) => t && t.closest && t.closest('.zoomable');
    ['gesturestart', 'gesturechange', 'gestureend'].forEach((n) => document.addEventListener(n, (e) => { if (!ok(e.target)) e.preventDefault(); }));
    document.addEventListener('touchmove', (e) => { if (e.touches.length > 1 && !ok(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('wheel', (e) => { if (e.ctrlKey && !ok(e.target)) e.preventDefault(); }, { passive: false });
    document.addEventListener('keydown', (e) => { if ((e.ctrlKey || e.metaKey) && ['+', '-', '=', '0'].includes(e.key)) e.preventDefault(); });
    document.addEventListener('dblclick', (e) => { if (!ok(e.target)) e.preventDefault(); }, { passive: false });
  }
})();

/* DYSON shell: navigation rail / mobile tab bar, floating button, and Status (24-hour updates) */
(function () {
  const { h, $ } = D, sb = D.sb;
  const IDS = { chats: 'vChats', calls: 'vCalls', status: 'vStatus', comm: 'vComm', settings: 'vSet' };
  let view = 'chats', groups = [], mineG = null, V = null, st;
  const fab = $('#fab');
  const when = (d) => D.fmtDay(d) + ' at ' + D.fmtTime(d);
  const url = async (p) => { const { data, error } = await sb.storage.from('status-media').createSignedUrl(p, 3600); if (error) throw error; return data.signedUrl; };

  function show(v) {
    view = v; $('#shell').classList.toggle('v-status', v === 'status'); $('#stEmpty').hidden = v !== 'status';
    for (const k in IDS) $('#' + IDS[k]).hidden = k !== v;
    document.querySelectorAll('.rb[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
    fab.hidden = !(v === 'chats' || v === 'status'); fab.replaceChildren(D.ic(v === 'chats' ? 'plus' : 'camera'));
    if (v === 'status') loadStatus();
  }
  document.querySelectorAll('.rb[data-view]').forEach((b) => (b.onclick = () => show(b.dataset.view)));
  fab.onclick = () => (view === 'chats' ? (D.newMenu ? D.newMenu(fab) : D.toast('Still loading. Try again in a moment.', 'info', 1500)) : compose());
  const sc = $('#startComm'); if (sc) sc.onclick = () => window.DG && DG.create();
  $('#addStatusBtn').onclick = compose;
  // menu: refresh, delete all my updates, who can see my status
  const menu = $('#stMenu');
  $('#stMore').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) menu.hidden = true; });
  $('#stRefresh').onclick = () => { menu.hidden = true; loadStatus(); };
  $('#stClear').onclick = async () => {
    menu.hidden = true; if (!mineG) return D.toast('You have no status updates.', 'info', 1800); if (!confirm('Delete all your status updates?')) return;
    const paths = mineG.items.map((x) => x.media_path).filter(Boolean), { error } = await sb.from('statuses').delete().eq('user_id', D.uid);
    if (error) return D.toast(D.err(error), 'error'); if (paths.length) sb.storage.from('status-media').remove(paths); D.toast('Status updates deleted.', 'success', 1800); loadStatus();
  };
  $('#stAud').onchange = async () => { const { error } = await sb.from('status_privacy').upsert({ user_id: D.uid, audience: $('#stAud').value }); D.toast(error ? D.err(error) : 'Status privacy saved.', error ? 'error' : 'success', 2000); };
  ['dyson-chat', 'dyson-group'].forEach((n) => document.addEventListener(n, () => { if (view !== 'chats') show('chats'); }));
  show(location.hash === '#status' ? 'status' : 'chats');

  // ---- status list
  // Ring around the avatar: one segment per update, green = unseen, grey = seen
  const ring = (g, size) => {
    const n = g.items.length, col = (x) => (x.viewed ? 'var(--border)' : 'var(--primary)'); let bg;
    if (n === 1) bg = col(g.items[0]);
    else { const seg = 360 / n, gap = Math.min(8, seg / 4); bg = 'conic-gradient(' + g.items.map((x, i) => { const a = i * seg + gap / 2, b = (i + 1) * seg - gap / 2; return `transparent ${i * seg}deg ${a}deg,${col(x)} ${a}deg ${b}deg,transparent ${b}deg ${(i + 1) * seg}deg`; }).join(',') + ')'; }
    return h('span', { class: 'ring', style: 'background:' + bg }, D.avatar(g.p, size));
  };
  async function loadStatus() {
    if (!D.uid) return;
    const { data, error } = await sb.rpc('get_statuses');
    if (error) { $('#statusList').replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'Status unavailable'), h('p', {}, D.err(error)))); return; }
    const by = new Map();
    (data || []).forEach((s) => { if (!by.has(s.user_id)) by.set(s.user_id, { uid: s.user_id, p: s, items: [] }); by.get(s.user_id).items.push(s); });
    mineG = by.get(D.uid) || null;
    groups = [...by.values()].filter((g) => g.uid !== D.uid)
      .sort((a, b) => (a.items.every((x) => x.viewed) - b.items.every((x) => x.viewed)) || +new Date(b.items.at(-1).created_at) - +new Date(a.items.at(-1).created_at));
    const me = D.me || { full_name: 'Me' };
    $('#myStatus').replaceChildren(
      h('span', { class: 'mine-av' }, mineG ? ring(mineG, 'md') : D.avatar(me, 'md'), h('span', { class: 'plus-badge' }, D.ic('plus'))),
      h('span', { class: 'conv-body' }, h('b', {}, 'My status'), h('span', { class: 'preview' }, mineG ? mineG.items.length + (mineG.items.length > 1 ? ' updates · ' : ' update · ') + when(mineG.items.at(-1).created_at) : 'Tap to add status update')));
    const rowOf = (g) => h('button', { class: 'conv', type: 'button', onclick: () => open(groups, groups.indexOf(g)) }, ring(g, 'md'),
      h('span', { class: 'conv-body' }, h('b', {}, g.p.full_name), h('span', { class: 'preview' }, when(g.items.at(-1).created_at))));
    const fresh = groups.filter((g) => g.items.some((x) => !x.viewed)), old = groups.filter((g) => g.items.every((x) => x.viewed));
    $('#recentH').hidden = !fresh.length; $('#viewedH').hidden = !old.length;
    $('#statusList').replaceChildren(...(groups.length ? fresh.map(rowOf) : [h('div', { class: 'empty small' }, h('p', {}, 'No recent updates from your contacts.'))]));
    $('#viewedList').replaceChildren(...old.map(rowOf));
    const dot = $('#statusDot'); if (dot) dot.hidden = !groups.some((g) => g.items.some((x) => !x.viewed));
  }
  $('#myStatus').onclick = () => (mineG ? open([mineG], 0) : compose());
  const soon = () => { clearTimeout(st); st = setTimeout(loadStatus, 400); };
  document.addEventListener('dyson-ready', () => {
    loadStatus(); sb.from('status_privacy').select('audience').eq('user_id', D.uid).maybeSingle().then((r) => { if (r.data) $('#stAud').value = r.data.audience; });
    sb.channel('dyson-status').on('postgres_changes', { event: '*', schema: 'public', table: 'statuses' }, soon).subscribe();
  });

  // ---- full-screen viewer
  const ov = h('div', { class: 'stv', hidden: '', role: 'dialog', 'aria-label': 'Status viewer' }), bars = h('div', { class: 'stv-bars' }), head = h('div', { class: 'stv-head' }), body = h('div', { class: 'stv-body' }), foot = h('div', { class: 'stv-foot' });
  const prev = h('button', { class: 'stv-nav l', type: 'button', 'aria-label': 'Previous', onclick: () => step(-1) }), next = h('button', { class: 'stv-nav r', type: 'button', 'aria-label': 'Next', onclick: () => step(1) });
  ov.append(bars, head, body, foot, prev, next); document.body.append(ov);
  const open = (list, gi) => { V = { list, gi, ii: 0, tok: 0 }; play(); };
  function close() { if (V) clearTimeout(V.t); ov.hidden = true; body.replaceChildren(); V = null; loadStatus(); }
  function step(d) {
    if (!V) return;
    if (d > 0) { V.ii++; if (V.ii >= V.list[V.gi].items.length) { V.gi++; V.ii = 0; } }
    else if (V.ii > 0) V.ii--; else if (V.gi > 0) { V.gi--; V.ii = 0; }
    play();
  }
  addEventListener('keydown', (e) => { if (!V) return; if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });

  async function play() {
    clearTimeout(V.t); const g = V.list[V.gi]; if (!g) return close();
    const s = g.items[V.ii], mine = g.uid === D.uid, my = ++V.tok;
    ov.hidden = false; body.replaceChildren(); body.style.background = ''; foot.replaceChildren();
    bars.replaceChildren(...g.items.map((_, k) => h('i', { class: k < V.ii ? 'done' : '' }, h('b'))));
    head.replaceChildren(D.avatar(g.p, 'sm'), h('span', {}, h('b', {}, mine ? 'My status' : g.p.full_name), h('small', {}, when(s.created_at))), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: close }, D.ic('x')));
    const run = (ms) => { const b = bars.children[V.ii].firstChild; b.style.transition = 'none'; b.style.width = '0'; requestAnimationFrame(() => requestAnimationFrame(() => { b.style.transition = `width ${ms}ms linear`; b.style.width = '100%'; })); V.t = setTimeout(() => step(1), ms); };
    if (s.kind === 'text') { body.style.background = s.bg || '#128c7e'; body.append(h('p', { class: 'stv-text' }, s.content)); run(6000); }
    else {
      try {
        const u = await url(s.media_path); if (!V || my !== V.tok) return;
        if (s.kind === 'image') { body.append(h('img', { src: u, alt: '' })); run(6000); }
        else { const v = h('video', { src: u, autoplay: '', playsinline: '' }); v.onloadedmetadata = () => run((v.duration || 10) * 1000); v.onended = () => step(1); body.append(v); }
        if (s.caption) body.append(h('p', { class: 'stv-cap' }, s.caption));
      } catch (e) { body.append(h('p', {}, D.err(e))); }
    }
    if (mine) {
      const list = h('div', { class: 'stv-views', hidden: '' });
      foot.append(
        h('button', { class: 'btn', type: 'button', onclick: async () => { list.hidden = !list.hidden; if (list.hidden) return; clearTimeout(V.t); const { data } = await sb.rpc('status_viewers', { sid: s.id }); list.replaceChildren(...((data || []).length ? data.map((v) => h('div', { class: 'result' }, D.avatar(v, 'sm'), h('div', {}, h('b', {}, v.full_name), h('small', {}, when(v.viewed_at))))) : [h('p', {}, 'No views yet.')])); } }, D.ic('eye', 'sm'), ' Viewers'),
        h('button', { class: 'btn', type: 'button', onclick: async () => { const { error } = await sb.from('statuses').delete().eq('id', s.id); if (error) return D.toast(D.err(error), 'error'); if (s.media_path) sb.storage.from('status-media').remove([s.media_path]); D.toast('Status deleted.', 'success', 1800); close(); } }, D.ic('trash', 'sm'), ' Delete'), list);
    } else if (!s.viewed) { s.viewed = true; sb.from('status_views').upsert({ status_id: s.id, viewer_id: D.uid }, { onConflict: 'status_id,viewer_id', ignoreDuplicates: true }).then((r) => r.error && console.error(r.error)); }
  }

  // ---- create a status (text on a colour, or photo / video with caption)
  function compose() {
    const COLORS = ['#128c7e', '#6d4aff', '#e2521a', '#d6155f', '#0b78d1', '#1f2933', '#0e9f6e', '#b3122a'];
    let bg = COLORS[0], file = null;
    const ta = h('textarea', { class: 'input stc-ta', maxlength: '700', placeholder: 'Type a status', rows: '5' }), cap = h('input', { class: 'input', placeholder: 'Add a caption', maxlength: '300', hidden: '' });
    const prevBox = h('div', { class: 'stc-prev' }, ta), fileIn = h('input', { type: 'file', accept: 'image/*,video/*', hidden: '' }), post = h('button', { class: 'btn btn-primary', type: 'button', style: 'flex:1' }, 'Post');
    const paint = () => { prevBox.style.background = file ? '#000' : bg; };
    const sw = h('div', { class: 'stc-sw' }, ...COLORS.map((c) => h('button', { type: 'button', 'aria-label': 'Background colour', style: 'background:' + c, onclick: () => { bg = c; paint(); } })));
    const m = h('div', { class: 'modal stc' }, h('div', { class: 'modal-card stc-card' }, h('header', {}, h('h2', { style: 'margin:0;font-size:1.2rem' }, 'New status'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => m.remove() }, D.ic('x'))),
      h('div', { class: 'body stc-body' }, prevBox, sw, cap, h('div', { class: 'stc-actions' }, h('button', { class: 'btn', type: 'button', style: 'flex:1', onclick: () => fileIn.click() }, D.ic('image', 'sm'), ' Photo / video'), post), fileIn)));
    paint(); document.body.append(m); ta.focus();
    fileIn.onchange = () => {
      const f = fileIn.files[0]; if (!f) return;
      if (!/^(image|video)\//.test(f.type) || f.size > 30 * 1024 * 1024) return D.toast('Choose a photo or video up to 30 MB.', 'error');
      file = f; const u = URL.createObjectURL(f);
      prevBox.replaceChildren(f.type.startsWith('image/') ? h('img', { src: u, alt: '' }) : h('video', { src: u, controls: '' })); sw.hidden = true; cap.hidden = false; paint();
    };
    post.onclick = async () => {
      post.disabled = true;
      try {
        let row;
        if (file) {
          const ext = (file.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 6) || 'bin', path = `${D.uid}/${Date.now()}-${Math.random().toString(36).slice(2, 7)}.${ext}`;
          const up = await sb.storage.from('status-media').upload(path, file, { contentType: file.type }); if (up.error) throw up.error;
          row = { kind: file.type.startsWith('image/') ? 'image' : 'video', media_path: path, media_mime: file.type, caption: cap.value.trim() || null };
        } else {
          const t = ta.value.trim(); if (!t) { D.toast('Type something first.', 'info', 1800); post.disabled = false; return; }
          row = { kind: 'text', content: t, bg };
        }
        const { error } = await sb.from('statuses').insert({ user_id: D.uid, ...row }); if (error) throw error;
        m.remove(); D.toast('Status posted.', 'success', 2000); loadStatus();
      } catch (e) { D.toast(D.err(e), 'error'); post.disabled = false; }
    };
  }
})();

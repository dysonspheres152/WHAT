/* DYSON main app: conversations, one-to-one chat, user search, realtime, presence */
(async function () {
  const { sb, h, $ } = D;
  const session = await D.requireAuth();
  if (!session) return;
  const me = session.user;
  let tab = 'all', replyTo = null, mine, convs = [], active = null, presence = {}, otherRead = 0, lastDay = '';
  const seen = new Set(), msgs = new Map(), reacts = new Map();
  const el = { shell: $('#shell'), list: $('#list'), search: $('#search'), msgs: $('#msgs'), input: $('#input'), pane: $('#pane'), empty: $('#empty'), send: $('#sendBtn') };
  const modal = $('#modal'), uq = $('#uq'), results = $('#results');
  D.newMenu = (anchor) => D.popMenu([
    { icon: 'chat', label: 'New chat', fn: openModal },
    { icon: 'user-plus', label: 'New contact', fn: () => DC.add() },
    { icon: 'users', label: 'New group', fn: () => (window.DG ? DG.create() : D.toast('Groups are not available.', 'error')) },
  ], anchor);
  $('#newBtn').addEventListener('click', (e) => D.newMenu(e.currentTarget));
  $('#newBtn2').addEventListener('click', (e) => D.newMenu(e.currentTarget));
  document.addEventListener('dyson-groups', renderList);
  document.addEventListener('dyson-contacts', () => { DC.bust(); renderList(); });
  document.addEventListener('dyson-modal-close', () => closeModal());
  const COLS = 'id,sender_id,content,created_at,reply_to,msg_type,caption,media_path,media_mime,media_name,media_size,duration_ms,view_once,viewed_at';
  let cmap = new Map(); const nm = (c) => cmap.get(c.other_id) || nm(c); // saved contact names win
  const REACT = ['❤️', '👍', '😂', '😮', '😢', '🔥'];
  const EMOJI = '😀 😂 😊 😍 😎 🤔 😢 😡 👍 👎 🙏 👏 🎉 🔥 ❤️ 💯 ✅ 👋 🙌 🤝 💬 🚀 ⭐ 🌍'.split(' ');

  const soon = (() => { let t; return () => { clearTimeout(t); t = setTimeout(refreshList, 300); }; })();
  const nearBottom = () => el.msgs.scrollHeight - el.msgs.scrollTop - el.msgs.clientHeight < 120;
  const scrollDown = () => { el.msgs.scrollTop = el.msgs.scrollHeight; };
  const isOnline = (c) => { const p = presence[c.other_id]; return !!(p && p.online && Date.now() - new Date(p.hb) < 75000); };
  const statusText = (c) => {
    if (isOnline(c)) return 'Online';
    const p = presence[c.other_id];
    return p && p.last_seen ? D.fmtSeen(p.last_seen) : p ? 'Offline' : ''; // empty = hidden by their privacy setting
  };

  // ---- init
  el.list.replaceChildren(...[1, 2, 3, 4, 5].map(() => h('div', { class: 'skel' })));
  const { data: prof, error: pe } = await sb.from('profiles').select('*').eq('id', me.id).maybeSingle();
  if (pe || !prof) { D.toast(pe ? D.err(pe) : 'Your profile was not found. Contact support.', 'error', 8000); return; }
  mine = prof; await D.pullPrefs(me.id);
  if (!mine.onboarded) { location.replace('profile.html?welcome=1'); return; }
  D.me = mine; document.dispatchEvent(new Event('dyson-ready'));
  $('#meBtn').replaceChildren(D.avatar(mine, 'sm'), h('span', {}, h('b', {}, mine.full_name), h('small', {}, '@' + mine.username)));
  await refreshList();
  startRealtime();
  startPresence();

  // ---- conversation list
  async function refreshList() {
    const { data, error } = await sb.rpc('get_conversations');
    if (error) { D.toast(D.err(error), 'error'); el.list.replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'Could not load conversations'), h('button', { class: 'btn', onclick: refreshList }, 'Try again'))); return; }
    convs = data || []; cmap = await DC.names();
    const ids = convs.map((c) => c.other_id);
    if (ids.length) {
      // RLS returns only rows this user is allowed to see (online / last seen are separate privacy settings)
      const [a, b] = await Promise.all([sb.from('user_presence').select('user_id,online,last_seen').in('user_id', ids), sb.from('user_last_seen').select('user_id,last_seen').in('user_id', ids)]);
      (a.data || []).forEach((x) => (presence[x.user_id] = { ...presence[x.user_id], online: x.online, hb: x.last_seen }));
      (b.data || []).forEach((x) => (presence[x.user_id] = { ...presence[x.user_id], last_seen: x.last_seen }));
    }
    renderList();
    const total = convs.reduce((s, c) => s + Number(c.unread), 0);
    document.title = (total ? `(${total}) ` : '') + 'DYSON';
    const ud = document.getElementById('unreadDot'); if (ud) { ud.hidden = !total; ud.textContent = total > 99 ? '99+' : String(total); }
    if (active) { const c = convs.find((x) => x.conversation_id === active.conversation_id); if (c) { active = c; renderHeader(); } }
  }

  function renderList() {
    const q = el.search.value.trim().toLowerCase();
    const items = convs.filter((c) => tab === 'all' || (tab === 'unread' && Number(c.unread) > 0) || (tab === 'fav' && c.favorite)).filter((c) => !q || (nm(c) + ' ' + c.username).toLowerCase().includes(q));
    const gnodes = window.DG ? DG.nodes(q, tab) : [];
    if (!items.length && !gnodes.length) {
      if (convs.length || q) { el.list.replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'No matches'), h('p', {}, 'Try a different name or username.'))); return; }
      const holder = h('div'); el.list.replaceChildren(holder);
      DC.emptyState((uid) => startWith(uid)).then((n) => holder.replaceChildren(n)); return;
    }
    el.list.replaceChildren(...gnodes, ...items.map((c) => h('button', {
      class: 'conv' + (active && active.conversation_id === c.conversation_id ? ' active' : ''), role: 'listitem', onclick: () => openConv(c.conversation_id),
    }, D.avatar(c, 'md', isOnline(c), true),
      h('span', { class: 'conv-body' },
        h('span', { class: 'conv-top' }, h('b', {}, (c.favorite ? '★ ' : '') + nm(c) + (c.muted ? ' 🔕' : '')), h('time', {}, D.fmtList(c.last_at))),
        h('span', { class: 'conv-bot' }, h('span', { class: 'preview' }, c.last_content == null ? 'No messages yet' : c.last_content),
          Number(c.unread) > 0 ? h('span', { class: 'badge', 'aria-label': c.unread + ' unread messages' }, String(c.unread)) : '')))));
  }
  el.list.setAttribute('role', 'list');
  let mt;
  el.search.addEventListener('input', () => { renderList(); clearTimeout(mt); mt = setTimeout(searchMsgs, 400); });
  async function searchMsgs() { // full-text search; RLS restricts it to your own conversations
    const q = el.search.value.trim(), old = $('#msgHits'); if (old) old.remove();
    if (q.length < 3) return;
    const { data } = await sb.rpc('search_messages', { q });
    if (!data || !data.length || el.search.value.trim() !== q) return;
    el.list.append(h('div', { id: 'msgHits' }, h('b', { class: 'hits-h' }, 'Messages'), ...data.map((r) => {
      const c = convs.find((x) => x.conversation_id === r.conversation_id);
      return h('button', { class: 'conv', onclick: () => openConv(r.conversation_id) }, h('span', { class: 'conv-body' },
        h('span', { class: 'conv-top' }, h('b', {}, c ? nm(c) : 'Chat'), h('time', {}, D.fmtList(r.created_at))), h('span', { class: 'preview' }, r.content)));
    })));
  }
  document.querySelectorAll('.tab').forEach((b) => b.addEventListener('click', () => {
    tab = b.dataset.tab; document.querySelectorAll('.tab').forEach((x) => x.setAttribute('aria-selected', String(x === b))); renderList();
  }));
  async function toggle(col) { // per-user favorite / mute, synced across devices through conversation_settings
    if (!active) return;
    const { error } = await sb.from('conversation_settings').upsert({ user_id: me.id, conversation_id: active.conversation_id, [col]: !active[col] }, { onConflict: 'user_id,conversation_id' });
    if (error) return D.toast(D.err(error), 'error');
    soon();
  }
  $('#favBtn').addEventListener('click', () => toggle('favorite'));
  $('#muteBtn').addEventListener('click', () => toggle('muted'));

  // ---- open conversation
  async function openConv(id) {
    const c = convs.find((x) => x.conversation_id === id);
    if (!c) return;
    active = c; seen.clear(); msgs.clear(); reacts.clear(); replyTo = null; renderReply(); lastDay = '';
    el.shell.classList.add('chat-open'); el.empty.hidden = true; el.pane.hidden = false; document.dispatchEvent(new Event('dyson-chat'));
    renderHeader(); renderList();
    el.msgs.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading messages' })));
    const [m, r] = await Promise.all([
      sb.from('messages').select(COLS).eq('conversation_id', id).order('created_at', { ascending: false }).limit(200),
      sb.from('conversation_members').select('last_read_at').eq('conversation_id', id).eq('user_id', c.other_id).maybeSingle(),
    ]);
    if (!active || active.conversation_id !== id) return;
    if (m.error) { D.err(m.error); el.msgs.replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'Could not load messages'), h('button', { class: 'btn', onclick: () => openConv(id) }, 'Try again'))); return; }
    otherRead = r.data ? +new Date(r.data.last_read_at) : 0;
    el.msgs.replaceChildren();
    const list = m.data.reverse();
    if (!list.length) showThreadEmpty();
    else { await loadReacts(list.map((x) => x.id)); if (!active || active.conversation_id !== id) return; list.forEach(addMsg); }
    scrollDown(); markRead();
    if (matchMedia('(min-width:861px)').matches) el.input.focus();
  }

  function showThreadEmpty() {
    el.msgs.replaceChildren(h('div', { class: 'empty', id: 'threadEmpty' }, h('strong', {}, 'Your messages will appear here.'), h('p', {}, `Say hello to ${nm(active)}.`)));
  }

  function renderHeader() {
    const c = active; if (!c) return;
    $('#favBtn').replaceChildren(D.ic(c.favorite ? 'star-fill' : 'star')); $('#favBtn').setAttribute('aria-pressed', String(!!c.favorite)); $('#muteBtn').replaceChildren(D.ic(c.muted ? 'bell-off' : 'bell'));
    $('#headWho').replaceChildren(D.avatar(c, 'sm', isOnline(c), true), h('span', {}, h('b', {}, nm(c)), h('small', {}, statusText(c))));
    $('#info').replaceChildren(
      h('button', { class: 'btn', style: 'align-self:flex-end', onclick: () => el.shell.classList.remove('info-open') }, 'Close'),
      D.avatar(c, 'lg', isOnline(c), true), h('h2', {}, nm(c)), h('div', { class: 'tag' }, '@' + c.username),
      h('p', {}, statusText(c)), h('p', { class: 'bio' }, c.bio || 'No bio yet.'), h('p', {}, h('b', {}, 'Status: '), c.status || 'Available'));
  }

  // ---- messages
  function addMsg(m) {
    if (seen.has(m.id)) return;
    seen.add(m.id); msgs.set(m.id, m);
    const te = $('#threadEmpty'); if (te) te.remove();
    const day = new Date(m.created_at).toDateString();
    if (day !== lastDay) { lastDay = day; el.msgs.append(h('div', { class: 'day' }, D.fmtDay(m.created_at))); }
    const mineMsg = m.sender_id === me.id;
    const meta = h('span', { class: 'meta' }, h('time', {}, D.fmtTime(m.created_at)));
    if (mineMsg) { const t = h('span', { class: 'tick', 'data-ts': String(+new Date(m.created_at)), 'data-id': m.id }); paintTick(t); meta.append(t); }
    const q = m.reply_to && msgs.get(m.reply_to);
    const quote = m.reply_to ? h('div', { class: 'quote', onclick: () => { const t = el.msgs.querySelector(`[data-id="${m.reply_to}"]`); if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, h('b', {}, q ? (q.sender_id === me.id ? 'You' : nm(active)) : 'Reply'), h('span', {}, q ? q.content.slice(0, 90) : 'Earlier message')) : '';
    const bub = h('div', { class: 'bubble' }, quote, DM.body(m, me.id), meta, h('div', { class: 'reacts', id: 'r-' + m.id }));
    const row = h('div', { class: 'msg ' + (mineMsg ? 'sent' : 'recv'), 'data-id': m.id }, bub);
    // Long press (or right click): react with any emoji, reply, copy. Drag right to reply quickly.
    D.longPress(bub, (x, y) => D.msgMenu(row, { x, y, mine: mineMsg, text: (m.msg_type || 'text') === 'text' ? m.content : m.caption || '', mineReacts: (reacts.get(m.id) || []).filter((r) => r.user_id === me.id).map((r) => r.emoji), onReact: (e) => react(m.id, e), onReply: () => setReply(m) }));
    D.swipeReply(row, bub, () => setReply(m));
    el.msgs.append(row);
    renderReacts(m.id);
  }

  // ---- reactions + replies
  async function loadReacts(ids) {
    const { data } = await sb.from('message_reactions').select('message_id,user_id,emoji').in('message_id', ids);
    (data || []).forEach((r) => { if (!reacts.has(r.message_id)) reacts.set(r.message_id, []); reacts.get(r.message_id).push(r); });
  }
  function renderReacts(id) {
    const box = document.getElementById('r-' + id); if (!box) return;
    const by = {};
    (reacts.get(id) || []).forEach((r) => (by[r.emoji] = (by[r.emoji] || []).concat(r.user_id)));
    box.replaceChildren(...Object.entries(by).map(([e, u]) => h('button', { type: 'button', class: 'chip' + (u.includes(me.id) ? ' mine' : ''), 'aria-label': `${e} ${u.length}`, onclick: () => react(id, e) }, e + ' ' + u.length)));
  }
  async function react(id, e) {
    const has = (reacts.get(id) || []).some((r) => r.user_id === me.id && r.emoji === e);
    const { error } = has ? await sb.from('message_reactions').delete().match({ message_id: id, user_id: me.id, emoji: e })
      : await sb.from('message_reactions').insert({ message_id: id, user_id: me.id, emoji: e });
    if (error) D.toast(D.err(error), 'error'); // the UI updates from the realtime event
  }
  function setReply(m) { replyTo = m; renderReply(); el.input.focus(); }
  function renderReply() {
    const b = $('#replyBar'); b.hidden = !replyTo; if (!replyTo) return;
    b.replaceChildren(h('span', {}, '↩ ' + replyTo.content.slice(0, 80)), h('button', { type: 'button', 'aria-label': 'Cancel reply', onclick: () => { replyTo = null; renderReply(); } }, '✕'));
  }

  // Ticks: GREEN = not opened yet, RED = opened. View-once messages turn red only when actually opened.
  function paintTick(t) {
    const m = msgs.get(t.dataset.id), r = m && m.view_once ? !!m.viewed_at : +t.dataset.ts <= otherRead;
    t.textContent = r ? '✓✓' : '✓'; t.classList.toggle('read', r); t.title = r ? 'Opened' : 'Not opened yet';
  }
  function refreshMsg(n) {
    const m = msgs.get(n.id); if (!m) return; Object.assign(m, n);
    const old = el.msgs.querySelector(`[data-id="${n.id}"] .mbody`); if (old) old.replaceWith(DM.body(m, me.id));
    el.msgs.querySelectorAll('.tick').forEach(paintTick);
  }

  async function send() {
    const text = el.input.value.trim();
    if (!active) return;
    if (!text) { D.toast('Type a message first.', 'info', 1800); return; }
    if (text.length > 4000) { D.toast('Messages can be up to 4000 characters.', 'error'); return; }
    el.input.value = ''; autosize(); el.send.disabled = true;
    const { data, error } = await sb.from('messages').insert({ conversation_id: active.conversation_id, sender_id: me.id, content: text, reply_to: replyTo ? replyTo.id : null }).select(COLS).single();
    el.send.disabled = false;
    if (error) { el.input.value = text; autosize(); D.toast(D.err(error), 'error'); return; }
    addMsg(data); replyTo = null; renderReply(); scrollDown(); soon();
  }
  const autosize = () => { el.input.style.height = 'auto'; el.input.style.height = Math.min(el.input.scrollHeight, 140) + 'px'; };
  el.input.addEventListener('input', autosize);
  el.input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && D.flag('enter', true)) { e.preventDefault(); send(); } });
  el.send.addEventListener('click', send);

  let mrT;
  function markRead() {
    clearTimeout(mrT);
    mrT = setTimeout(async () => {
      if (!active || document.hidden) return;
      const { error } = await sb.rpc('mark_conversation_read', { cid: active.conversation_id });
      if (!error) soon();
    }, 250);
  }

  // ---- composer extras
  const panel = $('#emojiPanel');
  panel.replaceChildren(D.emojiPicker((e) => { const i = el.input, p = i.selectionStart; i.value = i.value.slice(0, p) + e + i.value.slice(i.selectionEnd); i.focus(); i.selectionStart = i.selectionEnd = p + e.length; autosize(); }));
  $('#emojiBtn').addEventListener('click', (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; });
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target)) panel.hidden = true; });
  DC.init({ chat: (uid) => startWith(uid) });
  DM.init({ me, cols: COLS, conv: () => active, reply: () => replyTo, refresh: refreshMsg, done: (d) => { addMsg(d); replyTo = null; renderReply(); scrollDown(); soon(); } });

  // ---- navigation
  $('#backBtn').addEventListener('click', () => {
    active = null; el.shell.classList.remove('chat-open', 'info-open'); el.pane.hidden = true; el.empty.hidden = false; renderList();
  });
  $('#headWho').addEventListener('click', () => el.shell.classList.toggle('info-open'));
  $('#logoutBtn').addEventListener('click', D.logout);
  $('#themeBtn').addEventListener('click', D.nextTheme);


  // ---- new conversation modal (user search)
  function openModal() { modal.hidden = false; uq.value = ''; hint(); uq.focus(); }
  function closeModal() { modal.hidden = true; }
  function hint() { return DC.list(results, (uid) => startWith(uid)); }
  $('#closeModal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); panel.hidden = true; el.shell.classList.remove('info-open'); } });
  let st;
  uq.addEventListener('input', () => { clearTimeout(st); st = setTimeout(searchUsers, 300); });
  async function searchUsers() {
    const q = uq.value.trim().replace(/[^\p{L}\p{N}_.@+ -]/gu, '').slice(0, 60);
    if (q.length < 2) return hint();
    results.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
    const { data, error } = await sb.rpc('find_users', { q }); // privacy-aware discovery (username, email, phone)
    if (uq.value.trim().length < 2) return;
    if (error) { results.replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'Search failed'), h('p', {}, D.err(error)))); return; }
    if (!data.length) { results.replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'No users found'), h('p', {}, 'Check the spelling or try their username.'))); return; }
    results.replaceChildren(...data.map((u) => h('div', { class: 'result' }, D.avatar(u, 'md'),
      h('div', {}, h('b', {}, u.full_name), h('small', {}, '@' + u.username)),
      h('button', { class: 'btn', onclick: (ev) => addContact(u.id, ev.currentTarget) }, 'Add'),
      h('button', { class: 'btn btn-primary', onclick: (ev) => startWith(u.id, ev.currentTarget) }, 'Message'))));
  }
  async function addContact(uid, b) {
    b.disabled = true;
    const { error } = await sb.from('contacts').insert({ owner_id: me.id, contact_id: uid });
    if (error && error.code !== '23505') { b.disabled = false; return D.toast(D.err(error), 'error'); }
    b.textContent = 'Added';
  }
  async function startWith(uid, b) {
    if (b) b.disabled = true;
    const { data, error } = await sb.rpc('start_direct_conversation', { other_user: uid });
    if (error) { if (b) b.disabled = false; D.toast(D.err(error), 'error'); return; }
    await refreshList(); closeModal(); openConv(data);
  }

  // ---- realtime (Supabase Realtime, RLS-filtered)
  function startRealtime() {
    sb.channel('dyson-live')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages' }, onMsg)
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'messages' }, (p) => refreshMsg(p.new))
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'conversation_members' }, (p) => {
        const n = p.new;
        if (active && n.conversation_id === active.conversation_id && n.user_id === active.other_id) { otherRead = +new Date(n.last_read_at); el.msgs.querySelectorAll('.tick').forEach(paintTick); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_presence' }, (p) => {
        const n = p.new;
        if (n && n.user_id && convs.some((c) => c.other_id === n.user_id)) { presence[n.user_id] = { ...presence[n.user_id], online: n.online, hb: n.last_seen }; renderList(); renderHeader(); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'user_last_seen' }, (p) => {
        const n = p.new; if (n && n.user_id) { presence[n.user_id] = { ...presence[n.user_id], last_seen: n.last_seen }; renderHeader(); }
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'message_reactions' }, (p) => {
        const r = p.new && p.new.message_id ? p.new : p.old;
        if (!r || !msgs.has(r.message_id)) return;
        const rest = (reacts.get(r.message_id) || []).filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji));
        if (p.eventType !== 'DELETE') rest.push(r);
        reacts.set(r.message_id, rest); renderReacts(r.message_id);
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'conversation_settings' }, soon)
      .subscribe((s) => { if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') D.toast('Live connection lost. Reconnecting…', 'error'); });
    setInterval(renderList, 30000); // refresh online dots when heartbeats stop
  }
  function onMsg(p) {
    const m = p.new, fromMe = m.sender_id === me.id;
    if (active && m.conversation_id === active.conversation_id) {
      const nb = nearBottom(); addMsg(m); if (nb || fromMe) scrollDown();
      if (!fromMe) { markRead(); if (document.hidden) notify(m); }
    } else if (!fromMe) notify(m);
    soon();
  }
  function notify(m) {
    if (localStorage.getItem('dyson-notify') === '0') return;
    const c = convs.find((x) => x.conversation_id === m.conversation_id);
    if (c && c.muted) return;
    D.toast((c ? nm(c) : 'New message') + (D.flag('previews', true) ? ': ' + m.content.slice(0, 80) : ''), 'msg', 5000, () => c && openConv(c.conversation_id));
    if (localStorage.getItem('dyson-sound') !== '0') D.beep();
  }

  // ---- presence: only claims "online" while this tab is visible and sending heartbeats
  function startPresence() {
    const ping = (on) => { const t = new Date().toISOString(); sb.from('user_last_seen').upsert({ user_id: me.id, last_seen: t }); return sb.from('user_presence').upsert({ user_id: me.id, online: on, last_seen: t }); };
    ping(true);
    setInterval(() => { if (!document.hidden) ping(true); }, 30000);
    document.addEventListener('visibilitychange', () => { ping(!document.hidden); if (!document.hidden && active) markRead(); });
    addEventListener('pagehide', () => ping(false));
    D.setOffline = () => ping(false);
  }
})();

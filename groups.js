/* DYSON groups: create a group, list groups with your chats, group conversation (text, reply, emoji, long-press reactions). Needs supabase_additions_v7_groups.sql */
(function () {
  const { h, $ } = D, sb = D.sb, DG = (window.DG = {});
  let groups = [], active = null, replyTo = null, lastDay = '', ppl = new Map(), names = new Map(), me = null;
  const msgs = new Map(), reacts = new Map(), seen = new Set();
  const REACT = ['❤️', '👍', '😂', '😮', '😢', '🙏'];

  // ---- pane (lives in the main chat area next to the 1:1 pane)
  const msgBox = h('div', { class: 'msgs', role: 'log', 'aria-live': 'polite', 'aria-label': 'Group messages' }), head = h('button', { class: 'who', type: 'button', 'aria-label': 'Group information' });
  const replyBar = h('div', { class: 'reply-bar', hidden: '' }), panel = h('div', { class: 'emoji-panel', hidden: '' });
  const input = h('textarea', { rows: '1', placeholder: 'Write a message', maxlength: '4000', autocomplete: 'off', 'aria-label': 'Message' });
  const sendBtn = h('button', { class: 'send', type: 'button', 'aria-label': 'Send message' }, D.ic('send'));
  const emojiBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Emoji' }, D.ic('smile'));
  const pane = h('section', { id: 'gpane', hidden: '', 'aria-label': 'Group conversation' },
    h('header', { class: 'chat-head' }, h('button', { class: 'icon-btn back', type: 'button', 'aria-label': 'Back', onclick: () => closePane() }, D.ic('back')), head),
    msgBox, replyBar, h('div', { class: 'composer' }, panel, emojiBtn, input, sendBtn));
  const mount = () => { const c = document.querySelector('main.chat'); if (c && !pane.isConnected) c.append(pane); };
  mount();

  const nameOf = (uid) => (uid === D.uid ? 'You' : names.get(uid) || (ppl.get(uid) && ppl.get(uid).full_name) || 'Member');
  const autosize = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 140) + 'px'; };
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing && D.flag('enter', true)) { e.preventDefault(); send(); } });
  sendBtn.onclick = send;
  panel.replaceChildren(D.emojiPicker((e) => { const s = input.selectionStart; input.value = input.value.slice(0, s) + e + input.value.slice(input.selectionEnd); input.focus(); input.selectionStart = input.selectionEnd = s + e.length; autosize(); }));
  emojiBtn.onclick = (e) => { e.stopPropagation(); panel.hidden = !panel.hidden; };
  document.addEventListener('click', (e) => { if (!panel.hidden && !panel.contains(e.target) && !emojiBtn.contains(e.target)) panel.hidden = true; });

  function closePane() { active = null; pane.hidden = true; $('#empty').hidden = false; $('#shell').classList.remove('chat-open'); renderIn(); }
  document.addEventListener('dyson-chat', () => { active = null; pane.hidden = true; }); // a 1:1 chat was opened

  // ---- data
  DG.load = async () => {
    const { data, error } = await sb.rpc('list_chat_groups');
    if (error) { DG.missing = true; groups = []; } else { DG.missing = false; groups = data || []; }
    document.dispatchEvent(new Event('dyson-groups'));
  };
  const renderIn = () => document.dispatchEvent(new Event('dyson-groups'));
  DG.count = () => groups.length;

  // Group rows for the chat list (shown with the "All" filter)
  DG.nodes = (q, tab) => {
    if (tab && tab !== 'all') return [];
    return groups.filter((g) => !q || g.name.toLowerCase().includes(q)).map((g) => h('button', { class: 'conv' + (active && active.id === g.id ? ' active' : ''), type: 'button', onclick: () => open(g.id) },
      D.avatar({ full_name: g.name }, 'md'),
      h('span', { class: 'conv-body' }, h('span', { class: 'conv-top' }, h('b', {}, '👥 ' + g.name), h('time', {}, D.fmtList(g.last_at))),
        h('span', { class: 'conv-bot' }, h('span', { class: 'preview' }, g.last_content == null ? Number(g.member_count) + ' members' : g.last_content)))));
  };

  async function open(id) {
    const g = groups.find((x) => x.id === id); if (!g) return;
    active = g; replyTo = null; renderReply(); seen.clear(); msgs.clear(); reacts.clear(); lastDay = '';
    const sh = $('#shell'); sh.classList.add('chat-open'); $('#empty').hidden = true; $('#pane').hidden = true; pane.hidden = false; document.dispatchEvent(new Event('dyson-group'));
    head.replaceChildren(D.avatar({ full_name: g.name }, 'sm'), h('span', {}, h('b', {}, g.name), h('small', {}, Number(g.member_count) + ' members')));
    head.onclick = () => info(g);
    msgBox.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner', role: 'status', 'aria-label': 'Loading' })));
    try { names = await window.DC.names(); } catch (e) { names = new Map(); }
    const [m, p] = await Promise.all([sb.from('chat_group_messages').select('id,sender_id,content,created_at,reply_to').eq('group_id', id).order('created_at', { ascending: false }).limit(200), sb.rpc('chat_group_people', { gid: id })]);
    if (!active || active.id !== id) return;
    if (m.error) { msgBox.replaceChildren(h('div', { class: 'empty small' }, h('strong', {}, 'Could not load messages'), h('p', {}, D.err(m.error)))); return; }
    ppl = new Map((p.data || []).map((x) => [x.user_id, x]));
    const list = m.data.reverse(); msgBox.replaceChildren();
    if (!list.length) msgBox.append(h('div', { class: 'empty', id: 'gEmpty' }, h('strong', {}, 'Say hello to the group.'), h('p', {}, 'Messages here are visible to all members.')));
    else { await loadReacts(list.map((x) => x.id)); list.forEach(add); }
    msgBox.scrollTop = msgBox.scrollHeight;
  }

  function info(g) {
    const rows = [...ppl.values()].map((x) => h('div', { class: 'result' }, D.avatar(x, 'md'), h('div', {}, h('b', {}, x.user_id === D.uid ? 'You' : names.get(x.user_id) || x.full_name), h('small', {}, '@' + x.username + (x.role === 'admin' ? ' · admin' : '')))));
    const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) m.remove(); } }, h('div', { class: 'modal-card' },
      h('header', {}, h('h2', { style: 'margin:0;font-size:1.2rem' }, g.name), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => m.remove() }, D.ic('x'))),
      h('div', { class: 'body' }, h('b', { class: 'hits-h' }, Number(g.member_count) + ' members'), ...rows,
        h('button', { class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:12px', onclick: async () => {
          if (!confirm('Leave "' + g.name + '"?')) return;
          const { error } = await sb.from('chat_group_members').delete().match({ group_id: g.id, user_id: D.uid }); if (error) return D.toast(D.err(error), 'error');
          m.remove(); closePane(); DG.load();
        } }, 'Leave group'))));
    document.body.append(m);
  }

  // ---- messages
  function add(m) {
    if (seen.has(m.id)) return; seen.add(m.id); msgs.set(m.id, m);
    const ge = $('#gEmpty'); if (ge) ge.remove();
    const day = new Date(m.created_at).toDateString(); if (day !== lastDay) { lastDay = day; msgBox.append(h('div', { class: 'day' }, D.fmtDay(m.created_at))); }
    const mine = m.sender_id === D.uid, q = m.reply_to && msgs.get(m.reply_to);
    const quote = m.reply_to ? h('div', { class: 'quote', onclick: () => { const t = msgBox.querySelector(`[data-id="${m.reply_to}"]`); if (t) t.scrollIntoView({ block: 'center', behavior: 'smooth' }); } }, h('b', {}, q ? nameOf(q.sender_id) : 'Reply'), h('span', {}, q ? q.content.slice(0, 90) : 'Earlier message')) : '';
    const bub = h('div', { class: 'bubble' }, mine ? '' : h('b', { class: 'sname' }, nameOf(m.sender_id)), quote, h('div', { class: 'mbody' }, h('p', {}, m.content)), h('span', { class: 'meta' }, h('time', {}, D.fmtTime(m.created_at))), h('div', { class: 'reacts', id: 'gr-' + m.id }));
    const row = h('div', { class: 'msg ' + (mine ? 'sent' : 'recv'), 'data-id': m.id }, bub);
    D.longPress(bub, (x, y) => D.msgMenu(row, { x, y, mine, text: m.content, mineReacts: (reacts.get(m.id) || []).filter((r) => r.user_id === D.uid).map((r) => r.emoji), onReact: (e) => react(m.id, e), onReply: () => setReply(m) }));
    D.swipeReply(row, bub, () => setReply(m));
    msgBox.append(row); renderReacts(m.id);
  }
  async function loadReacts(ids) { const { data } = await sb.from('chat_group_reactions').select('message_id,user_id,emoji').in('message_id', ids); (data || []).forEach((r) => { if (!reacts.has(r.message_id)) reacts.set(r.message_id, []); reacts.get(r.message_id).push(r); }); }
  function renderReacts(id) {
    const box = document.getElementById('gr-' + id); if (!box) return; const by = {};
    (reacts.get(id) || []).forEach((r) => (by[r.emoji] = (by[r.emoji] || []).concat(r.user_id)));
    box.replaceChildren(...Object.entries(by).map(([e, u]) => h('button', { type: 'button', class: 'chip' + (u.includes(D.uid) ? ' mine' : ''), onclick: () => react(id, e) }, e + ' ' + u.length)));
  }
  async function react(id, e) {
    const has = (reacts.get(id) || []).some((r) => r.user_id === D.uid && r.emoji === e);
    const { error } = has ? await sb.from('chat_group_reactions').delete().match({ message_id: id, user_id: D.uid, emoji: e }) : await sb.from('chat_group_reactions').insert({ message_id: id, user_id: D.uid, emoji: e });
    if (error) D.toast(D.err(error), 'error');
  }
  function setReply(m) { replyTo = m; renderReply(); input.focus(); }
  function renderReply() { replyBar.hidden = !replyTo; if (!replyTo) return; replyBar.replaceChildren(h('span', {}, '↩ ' + nameOf(replyTo.sender_id) + ': ' + replyTo.content.slice(0, 70)), h('button', { type: 'button', 'aria-label': 'Cancel reply', onclick: () => { replyTo = null; renderReply(); } }, '✕')); }
  async function send() {
    const t = input.value.trim(); if (!active || !t) return;
    input.value = ''; autosize(); sendBtn.disabled = true;
    const { data, error } = await sb.from('chat_group_messages').insert({ group_id: active.id, sender_id: D.uid, content: t, reply_to: replyTo ? replyTo.id : null }).select('id,sender_id,content,created_at,reply_to').single();
    sendBtn.disabled = false;
    if (error) { input.value = t; autosize(); return D.toast(D.err(error), 'error'); }
    add(data); replyTo = null; renderReply(); msgBox.scrollTop = msgBox.scrollHeight; DG.load();
  }

  // ---- realtime (RLS-filtered: you only receive groups you are in)
  DG.start = () => {
    sb.channel('dyson-groups')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'chat_group_messages' }, (p) => {
        const m = p.new;
        if (active && m.group_id === active.id) { const nb = msgBox.scrollHeight - msgBox.scrollTop - msgBox.clientHeight < 120; add(m); if (nb || m.sender_id === D.uid) msgBox.scrollTop = msgBox.scrollHeight; }
        else if (m.sender_id !== D.uid) { const g = groups.find((x) => x.id === m.group_id); D.toast((g ? g.name : 'Group') + ': ' + m.content.slice(0, 80), 'msg', 4000, () => g && open(g.id)); }
        DG.load();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_group_reactions' }, (p) => {
        const r = p.new && p.new.message_id ? p.new : p.old; if (!r || !msgs.has(r.message_id)) return;
        const rest = (reacts.get(r.message_id) || []).filter((x) => !(x.user_id === r.user_id && x.emoji === r.emoji)); if (p.eventType !== 'DELETE') rest.push(r);
        reacts.set(r.message_id, rest); renderReacts(r.message_id);
      }).subscribe();
  };
  document.addEventListener('dyson-ready', () => { DG.load(); DG.start(); });

  // ---- create a group: name + pick members from your saved contacts
  DG.create = async () => {
    let rows = []; try { rows = await window.DC.rows(true); } catch (e) { /* contacts not set up */ }
    const name = h('input', { class: 'input', maxlength: '60', placeholder: 'Group name', autocomplete: 'off' }), picked = new Set(), msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' });
    const count = h('small', { class: 'hint' }, '0 selected'), go = h('button', { class: 'btn btn-primary btn-block', type: 'button' }, 'Create group');
    const list = rows.length ? rows.map((x) => { const cb = h('input', { type: 'checkbox', 'aria-label': 'Add ' + (x.saved_name || x.full_name) }); cb.onchange = () => { cb.checked ? picked.add(x.contact_id) : picked.delete(x.contact_id); count.textContent = picked.size + ' selected'; };
      return h('label', { class: 'result pick' }, D.avatar(x, 'md'), h('div', {}, h('b', {}, x.saved_name || x.full_name), h('small', {}, x.saved_phone || x.saved_email || '@' + x.username)), cb); })
      : [h('div', { class: 'empty small' }, h('p', {}, 'Save some contacts first, then add them to a group.'), h('button', { class: 'btn', type: 'button', onclick: () => { m.remove(); window.DC.add(); } }, 'New contact'))];
    const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) m.remove(); } }, h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' },
      h('header', {}, h('h2', { style: 'margin:0;font-size:1.2rem' }, 'New group'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => m.remove() }, D.ic('x'))),
      h('div', { class: 'body' }, msg, h('div', { class: 'field' }, h('label', {}, 'Group name'), name), h('b', { class: 'hits-h' }, 'Add members'), ...list, count, h('div', { style: 'margin-top:10px' }, go))));
    document.body.append(m); name.focus();
    go.onclick = async () => {
      const n = name.value.trim(); msg.hidden = true;
      const say = (t) => { msg.textContent = t; msg.className = 'form-msg error'; msg.hidden = false; };
      if (!n) return say('Give the group a name.'); if (!picked.size) return say('Pick at least one member.');
      go.disabled = true; const { data, error } = await sb.rpc('create_chat_group', { p_name: n, p_members: [...picked] }); go.disabled = false;
      if (error) { const t = (error.message || '').toLowerCase(); return say(/function|does not exist|schema cache|could not find/.test(t) ? 'Groups are not set up yet. Run supabase_additions_v7_groups.sql once in Supabase (it only adds new tables).' : D.err(error)); }
      m.remove(); document.dispatchEvent(new Event('dyson-modal-close')); D.toast('Group created.', 'success', 1800); await DG.load(); open(data);
    };
  };
})();

/* DYSON contacts: add a person by name + phone + email, import/sync from your phone or Google, export, rename, remove */
(function () {
  const { h, $ } = D, sb = D.sb, DC = (window.DC = {});
  let chatCb = () => {}, cache = null, cacheT = 0, ownCode = null;
  const COUNTRIES = [['+256', 'Uganda'], ['+254', 'Kenya'], ['+255', 'Tanzania'], ['+250', 'Rwanda'], ['+257', 'Burundi'], ['+211', 'South Sudan'], ['+243', 'DR Congo'], ['+234', 'Nigeria'], ['+233', 'Ghana'], ['+27', 'South Africa'], ['+20', 'Egypt'], ['+44', 'United Kingdom'], ['+1', 'US / Canada'], ['+91', 'India'], ['+971', 'UAE'], ['+86', 'China'], ['+49', 'Germany'], ['+33', 'France']];
  DC.init = (o) => { chatCb = o.chat; };
  const nameOf = (r) => r.saved_name || r.full_name;

  async function rows(force) {
    if (!force && cache && Date.now() - cacheT < 60000) return cache;
    const { data, error } = await sb.rpc('list_contacts'); if (error) throw error;
    cache = data || []; cacheT = Date.now(); return cache;
  }
  DC.bust = () => { cache = null; };
  DC.rows = rows;
  // People saved before they joined DYSON live on this device until they can be matched (see Retry)
  const PK = () => 'dyson-pending-' + D.uid;
  const pending = () => { try { return JSON.parse(localStorage.getItem(PK()) || '[]'); } catch (e) { return []; } };
  const setPending = (a) => { try { localStorage.setItem(PK(), JSON.stringify(a)); } catch (e) { /* storage full */ } };
  DC.names = async () => { try { return new Map((await rows()).filter((r) => r.saved_name).map((r) => [r.contact_id, r.saved_name])); } catch (e) { return new Map(); } };

  async function defaultCode() {
    if (ownCode) return ownCode;
    try { const { data } = await sb.from('user_private').select('phone').eq('user_id', D.uid).maybeSingle(); const p = data && data.phone; if (p) { const m = COUNTRIES.map((c) => c[0]).filter((c) => p.startsWith(c)).sort((a, b) => b.length - a.length)[0]; if (m) return (ownCode = m); } } catch (e) { /* fall through */ }
    return (ownCode = '+256');
  }
  const norm = (raw, code) => {
    let p = String(raw || '').replace(/[\s().-]/g, ''); if (!p) return '';
    if (p.startsWith('+')) { /* keep */ } else if (p.startsWith('00')) p = '+' + p.slice(2); else if (p.startsWith('0')) p = code + p.slice(1); else p = (p.length >= 11 ? '+' : code) + p;
    return /^\+[1-9]\d{7,14}$/.test(p) ? p : '';
  };
  function modal(title, body) {
    const m = h('div', { class: 'modal', onclick: (e) => { if (e.target === m) m.remove(); } }, h('div', { class: 'modal-card', role: 'dialog', 'aria-modal': 'true' },
      h('header', {}, h('h2', { style: 'margin:0;font-size:1.2rem' }, title), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close', onclick: () => m.remove() }, D.ic('x'))), h('div', { class: 'body' }, body)));
    document.body.append(m); return m;
  }
  const field = (label, input) => h('div', { class: 'field' }, h('label', {}, label), input);
  const act = (icon, text, fn, cls = '') => h('button', { class: 'btn ' + cls, type: 'button', onclick: fn }, D.ic(icon, 'sm'), text);

  // ---- the add-contact form
  DC.add = async (pre = {}) => {
    const code = await defaultCode();
    const name = h('input', { class: 'input', placeholder: 'Full name', maxlength: '80', autocomplete: 'off', value: pre.name || '' });
    const cc = h('select', { class: 'input', 'aria-label': 'Country code' }, ...COUNTRIES.map(([c, n]) => { const o = h('option', { value: c }, `${n} (${c})`); if (c === code) o.selected = true; return o; }));
    const ph = h('input', { class: 'input', type: 'tel', placeholder: 'Phone number', autocomplete: 'off', value: pre.phone || '' }), em = h('input', { class: 'input', type: 'email', placeholder: 'Email address', autocomplete: 'off', value: pre.email || '' });
    const msg = h('div', { class: 'form-msg', role: 'alert', hidden: '' }), inv = h('div', { class: 'inv', hidden: '' });
    const save = h('button', { class: 'btn btn-primary', type: 'button', style: 'flex:1' }, 'Save and chat'), only = h('button', { class: 'btn', type: 'button', style: 'flex:1' }, 'Save only');
    const say = (t, type = 'error') => { msg.textContent = t; msg.className = 'form-msg ' + type; msg.hidden = !t; inv.hidden = true; };
    const m = modal('New contact', h('div', {}, msg, field('Name', name), h('div', { class: 'field' }, h('label', {}, 'Phone number'), h('div', { class: 'phrow' }, cc, ph)), field('Email (optional if you add a phone)', em), inv,
      h('p', { class: 'hint' }, 'Save with a phone number, an email, or both. People already on DYSON are linked straight away; others are kept on this device until they join.'), h('div', { style: 'display:flex;gap:8px' }, only, save)));
    const run = async (openChat) => {
      say(''); const n = name.value.trim(), p = norm(ph.value, cc.value), e = em.value.trim().toLowerCase();
      if (!n) return say('Enter a name.'); if (!p && !e) return say('Enter a phone number or an email.');
      if (ph.value.trim() && !p) return say('That phone number does not look right.');
      if (e && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) return say('That email does not look right.');
      save.disabled = only.disabled = true; const { data, error } = await sb.rpc('add_contact', { p_name: n, p_phone: p || null, p_email: e || null }); save.disabled = only.disabled = false;
      if (error) return say(D.err(error));
      if (!data) { // not on DYSON yet (or hidden by their privacy settings): keep the person and offer an invite
        say(`${n} is not on DYSON yet, or has turned off finding by ${p ? 'phone' : 'email'}. You can still save them and invite them:`, 'info');
        const link = new URL('register.html', location.href).href, text = `Hi ${n}, I'm using DYSON to chat. Join me here: ${link}`;
        inv.replaceChildren(...[act('user-plus', 'Save anyway', () => { setPending([{ name: n, phone: p, email: e }, ...pending().filter((x) => !(x.phone && x.phone === p) && !(x.email && x.email === e))]); m.remove(); D.toast(n + ' saved. We will link them once they join.', 'success', 3000); }, 'btn-primary'),
          navigator.share ? act('send', 'Share invite', () => navigator.share({ text }).catch(() => {})) : '', p ? h('a', { class: 'btn', href: `sms:${p}?body=${encodeURIComponent(text)}` }, 'Text them') : '', e ? h('a', { class: 'btn', href: `mailto:${e}?subject=${encodeURIComponent('Join me on DYSON')}&body=${encodeURIComponent(text)}` }, 'Email them') : '', act('clip', 'Copy link', () => navigator.clipboard.writeText(link).then(() => D.toast('Link copied.', 'success', 1500)))]);
        inv.hidden = false; return;
      }
      setPending(pending().filter((x) => !(x.phone && x.phone === p) && !(x.email && x.email === e)));
      DC.bust(); m.remove(); D.toast(n + ' saved to your contacts.', 'success', 2200); if (openChat) chatCb(data); else document.dispatchEvent(new Event('dyson-contacts'));
    };
    save.onclick = () => run(true); only.onclick = () => run(false);
    name.focus();
  };

  // Saved-but-not-yet-on-DYSON people: invite, retry matching, or remove
  const inviteTo = (x) => { const link = new URL('register.html', location.href).href, text = `Hi ${x.name}, I'm using DYSON to chat. Join me here: ${link}`; if (navigator.share) navigator.share({ text }).catch(() => {}); else navigator.clipboard.writeText(text).then(() => D.toast('Invite copied.', 'success', 1500)); };
  function pendingRows(after) {
    const list = pending(); if (!list.length) return [];
    const redo = after || (() => document.dispatchEvent(new Event('dyson-contacts')));
    return [h('b', { class: 'hits-h' }, 'Not on DYSON yet'), ...list.map((x) => h('div', { class: 'result' }, D.avatar({ full_name: x.name }, 'md'), h('div', {}, h('b', {}, x.name), h('small', {}, [x.phone, x.email].filter(Boolean).join(' · '))),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Invite', onclick: () => inviteTo(x) }, D.ic('send', 'sm')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Check again', onclick: async () => { const { data } = await sb.rpc('add_contact', { p_name: x.name, p_phone: x.phone || null, p_email: x.email || null }); if (data) { setPending(pending().filter((y) => y !== x && !(y.phone === x.phone && y.email === x.email))); DC.bust(); D.toast(x.name + ' is on DYSON now.', 'success'); } else D.toast(x.name + ' has not joined yet.', 'info', 2000); redo(); } }, D.ic('refresh', 'sm')),
      h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onclick: () => { setPending(pending().filter((y) => !(y.phone === x.phone && y.email === x.email && y.name === x.name))); redo(); } }, D.ic('trash', 'sm'))))];
  }
  // WhatsApp-style first-run state: "Start chatting" with your contacts as circles + Invite a friend
  DC.emptyState = async (pick) => {
    let r = []; try { r = await rows(); } catch (e) { /* not set up */ }
    return h('div', { class: 'empty start' }, h('strong', { style: 'font-size:1.6rem' }, 'Start chatting'),
      h('p', {}, r.length ? `Chat with your ${r.length} DYSON contact${r.length > 1 ? 's' : ''}, or invite a friend.` : 'Add a contact with their phone number or email, or invite a friend.'),
      r.length ? h('div', { class: 'start-row' }, ...r.slice(0, 8).map((x) => h('button', { class: 'start-p', type: 'button', onclick: () => pick(x.contact_id) }, D.avatar(x, 'lg'), h('span', {}, nameOf(x))))) : '',
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' }, h('button', { class: 'btn', type: 'button', onclick: () => inviteTo({ name: 'there' }) }, 'Invite a friend'), h('button', { class: 'btn btn-primary', type: 'button', onclick: () => DC.add() }, D.ic('user-plus', 'sm'), 'New contact')));
  };

  // ---- contact list (inside the New chat panel)
  DC.list = async (box, pick) => {
    box.replaceChildren(h('div', { class: 'loading' }, h('span', { class: 'spinner' })));
    const top = h('div', { class: 'dc-actions' }, act('user-plus', 'New contact', () => DC.add()), act('users', 'New group', () => window.DG && DG.create()), act('refresh', 'Import / sync', () => DC.sync()));
    try {
      const r = await rows(true);
      box.replaceChildren(top, ...pendingRows(), r.length ? h('b', { class: 'hits-h' }, 'Your contacts') : h('div', { class: 'empty small' }, h('p', {}, 'No contacts yet. Add one with their phone number or email, or search by name above.')),
        ...r.map((x) => h('button', { class: 'conv', type: 'button', onclick: () => pick(x.contact_id) }, D.avatar(x, 'md'), h('span', { class: 'conv-body' }, h('b', {}, nameOf(x)), h('span', { class: 'preview' }, x.saved_phone || x.saved_email || '@' + x.username)))));
    } catch (e) { box.replaceChildren(top, h('div', { class: 'empty small' }, h('p', {}, 'Contacts are not set up yet. Run the V6 SQL in Supabase.'))); console.error(e); }
  };

  // ---- full contact manager
  DC.manage = async () => {
    const box = h('div'), m = modal('Contacts', box);
    const render = async () => {
      let r; try { r = await rows(true); } catch (e) { box.replaceChildren(h('p', {}, D.err(e))); return; }
      box.replaceChildren(h('div', { class: 'dc-actions' }, act('user-plus', 'New contact', () => DC.add()), act('users', 'New group', () => { m.remove(); window.DG && DG.create(); }), act('refresh', 'Import / sync', () => DC.sync())), ...pendingRows(render),
        ...(r.length ? r.map((x) => h('div', { class: 'result' }, D.avatar(x, 'md', false, true), h('div', {}, h('b', {}, nameOf(x)), h('small', {}, [x.saved_phone, x.saved_email].filter(Boolean).join(' · ') || '@' + x.username)),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Message', onclick: () => { m.remove(); chatCb(x.contact_id); } }, D.ic('chat', 'sm')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Rename', onclick: async () => { const n = prompt('Contact name', nameOf(x)); if (!n || !n.trim()) return; const { error } = await sb.rpc('update_contact', { cid: x.contact_id, p_name: n.trim() }); if (error) return D.toast(D.err(error), 'error'); DC.bust(); render(); } }, D.ic('pen', 'sm')),
          h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Remove', onclick: async () => { if (!confirm('Remove ' + nameOf(x) + ' from your contacts? Your chat stays.')) return; const { error } = await sb.rpc('remove_contact', { cid: x.contact_id }); if (error) return D.toast(D.err(error), 'error'); DC.bust(); render(); } }, D.ic('trash', 'sm')))) : [h('div', { class: 'empty small' }, h('p', {}, 'No contacts yet.'))]));
    };
    render();
  };

  // ---- sync: phone contact picker, Google/phone files (.vcf / .csv), export
  const csv = (t) => { const out = []; let r = [], c = '', q = false; for (let i = 0; i < t.length; i++) { const ch = t[i]; if (q) { if (ch === '"') { if (t[i + 1] === '"') { c += '"'; i++; } else q = false; } else c += ch; } else if (ch === '"') q = true; else if (ch === ',') { r.push(c); c = ''; } else if (ch === '\n' || ch === '\r') { if (ch === '\r' && t[i + 1] === '\n') i++; r.push(c); c = ''; if (r.length > 1 || r[0]) out.push(r); r = []; } else c += ch; } if (c || r.length) { r.push(c); out.push(r); } return out; };
  const fromCsv = (t) => {
    const [hd, ...rest] = csv(t); if (!hd) return []; const L = hd.map((x) => x.toLowerCase().trim());
    const idx = (f) => L.map((x, i) => (f(x) ? i : -1)).filter((i) => i >= 0), skip = (x) => /type|label/.test(x);
    const nameI = idx((x) => x === 'name'), fn = idx((x) => x === 'first name' || x === 'given name'), ln = idx((x) => x === 'last name' || x === 'family name'), pi = idx((x) => x.includes('phone') && !skip(x)), ei = idx((x) => /e-?mail/.test(x) && !skip(x));
    return rest.map((r) => ({ name: (nameI.length && r[nameI[0]]) || [fn[0] != null ? r[fn[0]] : '', ln[0] != null ? r[ln[0]] : ''].join(' ').trim(), phones: pi.flatMap((i) => (r[i] || '').split(':::')), emails: ei.flatMap((i) => (r[i] || '').split(':::')) }));
  };
  const fromVcf = (t) => t.split(/BEGIN:VCARD/i).slice(1).map((b) => {
    let name = '', phones = [], emails = [];
    b.replace(/\r?\n[ \t]/g, '').split(/\r?\n/).forEach((l) => { const i = l.indexOf(':'); if (i < 0) return; const k = l.slice(0, i).toUpperCase(), v = l.slice(i + 1).trim(); if (k.startsWith('FN')) name = name || v; else if (k.startsWith('TEL')) phones.push(v); else if (k.startsWith('EMAIL')) emails.push(v); });
    return { name, phones, emails };
  });
  async function bulk(items) {
    const code = await defaultCode(), list = [];
    items.forEach((c) => { const p = c.phones.map((x) => norm(x, code)).find(Boolean) || '', e = (c.emails.map((x) => x.trim().toLowerCase()).find((x) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x))) || ''; if (p || e) list.push({ name: (c.name || p || e).slice(0, 80), phone: p, email: e }); });
    if (!list.length) return D.toast('No usable phone numbers or emails found.', 'info');
    D.toast('Matching ' + list.length + ' contacts…', 'info', 2500); let found = 0;
    for (let i = 0; i < list.length; i += 200) { const { data, error } = await sb.rpc('add_contacts_bulk', { items: list.slice(i, i + 200) }); if (error) return D.toast(D.err(error), 'error'); found += data || 0; }
    DC.bust(); D.toast(`${found} of ${list.length} contacts are on DYSON and were added.`, 'success', 6000);
  }
  const download = (name, type, text) => { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type })), download: name }); document.body.append(a); a.click(); a.remove(); };
  DC.sync = () => {
    const fileIn = h('input', { type: 'file', accept: '.vcf,.csv,text/vcard,text/csv', class: 'sr' });
    fileIn.onchange = async () => { const f = fileIn.files[0]; if (!f) return; const t = await f.text(); await bulk(/\.csv$/i.test(f.name) ? fromCsv(t) : fromVcf(t)); fileIn.value = ''; };
    const esc = (s) => String(s || '').replace(/[\\;,]/g, '\\$&').replace(/\n/g, ' ');
    const card = (icon, title, sub, fn) => h('button', { class: 'dc-card', type: 'button', onclick: fn }, D.ic(icon), h('span', {}, h('b', {}, title), h('small', {}, sub)));
    const supported = 'contacts' in navigator && 'ContactsManager' in window;
    modal('Import and sync contacts', h('div', {},
      supported ? card('phone', 'Pick from this phone', 'Choose contacts saved on your phone or Google account', async () => { try { const sel = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true }); await bulk(sel.map((c) => ({ name: (c.name && c.name[0]) || '', phones: c.tel || [], emails: c.email || [] }))); } catch (e) { if (e.name !== 'AbortError') D.toast('Could not read your contacts.', 'error'); } })
        : h('p', { class: 'hint' }, 'Picking contacts straight from the phone needs Chrome on Android. On other devices use a file below.'),
      card('upload', 'Import from Google or phone file', 'Choose a .vcf (vCard) or Google .csv export', () => fileIn.click()),
      card('download', 'Export my DYSON contacts', 'Download a .vcf you can import into Google Contacts or your phone', async () => { const r = await rows(true); if (!r.length) return D.toast('No contacts to export.', 'info'); download('dyson-contacts.vcf', 'text/vcard', r.map((x) => `BEGIN:VCARD\r\nVERSION:3.0\r\nN:${esc(nameOf(x))};;;;\r\nFN:${esc(nameOf(x))}\r\n${x.saved_phone ? 'TEL;TYPE=CELL:' + x.saved_phone + '\r\n' : ''}${x.saved_email ? 'EMAIL:' + x.saved_email + '\r\n' : ''}END:VCARD`).join('\r\n')); }),
      h('p', { class: 'hint' }, 'Google Contacts: open contacts.google.com, choose Export (vCard or Google CSV), then import that file here. To send DYSON contacts to Google, export here and use Import on contacts.google.com. Your phone syncs with Google automatically.'), fileIn));
  };
  const b = $('#contactsBtn'); if (b) b.onclick = DC.manage;
  DC.newMenu = null;
})();

/* DYSON settings: appearance, privacy, notifications, password, logout */
(async function () {
  const { sb, h, $ } = D;
  const session = await D.requireAuth();
  if (!session) return;
  const uid = session.user.id;
  const { data: p, error } = await sb.from('profiles').select('show_online,show_last_seen').eq('id', uid).single();
  if (error) { D.toast(D.err(error), 'error'); return; }

  // Appearance + chats (saved on this device and synced to your account)
  await D.pullPrefs(uid);
  const cur = { light: 'daylight', dark: 'midnight' }[localStorage.getItem('dyson-theme')] || localStorage.getItem('dyson-theme') || 'system';
  const NAMES = { system: 'Auto', daylight: 'Daylight', midnight: 'Midnight', emerald: 'Emerald', sunset: 'Sunset', amethyst: 'Amethyst', rose: 'Rose', ocean: 'Ocean', 'wa-dark': 'Classic dark', 'wa-light': 'Classic light', crimson: 'Crimson', gold: 'Gold', forest: 'Forest', lavender: 'Lavender', coral: 'Coral', slate: 'Slate', mint: 'Mint', sky: 'Sky' };
  ['system', ...D.THEMES].forEach((t) => {
    const i = h('input', { type: 'radio', name: 'theme', value: t }); i.checked = t === cur;
    i.addEventListener('change', () => { D.savePref('theme', t); D.toast('Theme updated.', 'success', 1500); });
    $('#themes').append(h('label', { class: 'sw', 'data-theme': t === 'system' ? 'midnight' : t }, i, h('span', { class: 'sw-demo' }, h('i'), h('i')), NAMES[t]));
  });
  ['font', 'wall'].forEach((k) => { const x = $('#' + k); x.value = localStorage.getItem('dyson-' + k) || (k === 'font' ? 'medium' : 'dots'); x.addEventListener('change', () => D.savePref(k, x.value)); });
  [['enter', true], ['vo', false], ['dl_photos', true], ['dl_videos', false], ['previews', true], ['notify', true], ['sound', true]].forEach(([k, d]) => { const i = $('#' + k); i.checked = D.flag(k, d); i.addEventListener('change', () => { D.savePref(k, i.checked); if (i.checked && k === 'sound') D.beep(); }); });

  // Background image: resized and kept on this device
  $('#wallFile').addEventListener('change', (e) => {
    const f = e.target.files[0]; if (!f) return; const err = D.checkImage(f); if (err) return D.toast(err, 'error');
    const img = new Image(); img.onload = () => {
      const k = Math.min(1, 1280 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = img.width * k; c.height = img.height * k; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      try { localStorage.setItem('dyson-wallimg', c.toDataURL('image/jpeg', 0.72)); D.savePref('wall', 'image'); $('#wall').value = 'image'; D.toast('Background set.', 'success', 1800); } catch (x) { D.toast('That image is too large to store. Try a smaller one.', 'error'); }
    }; img.src = URL.createObjectURL(f);
  });
  $('#wallClear').addEventListener('click', () => { localStorage.removeItem('dyson-wallimg'); D.savePref('wall', 'dots'); $('#wall').value = 'dots'; D.toast('Background removed.', 'success', 1800); });
  // Install
  const ir = $('#installRow'), showInstall = () => { ir.hidden = false; };
  if (D.installEv) showInstall(); document.addEventListener('dyson-installable', showInstall);
  if (/iphone|ipad/i.test(navigator.userAgent) && !matchMedia('(display-mode: standalone)').matches) { showInstall(); $('#installHint').textContent = 'In Safari tap Share, then Add to Home Screen'; $('#installBtn').hidden = true; }
  $('#installBtn').addEventListener('click', async () => { if (!D.installEv) return; D.installEv.prompt(); await D.installEv.userChoice; D.installEv = null; ir.hidden = true; });

  // Privacy (enforced in the database through privacy_settings and RLS)
  const { data: ps, error: pse } = await sb.from('privacy_settings').select('*').eq('user_id', uid).single();
  if (pse) D.toast(D.err(pse), 'error');
  const savePriv = async (col, val) => {
    const { error: e } = await sb.from('privacy_settings').update({ [col]: val }).eq('user_id', uid);
    if (e) { D.toast(D.err(e), 'error'); return false; }
    D.toast('Privacy setting saved.', 'success', 2000); return true;
  };
  ['last_seen', 'online'].forEach((k) => { const s = $('#' + k); s.value = ps ? ps[k] : 'everyone'; s.addEventListener('change', () => savePriv(k, s.value)); });
  ['discover_username', 'discover_email', 'discover_phone'].forEach((k) => { const i = $('#' + k); i.checked = ps ? ps[k] : false; i.addEventListener('change', async () => { if (!(await savePriv(k, i.checked))) i.checked = !i.checked; }); });

  // Notifications (stored on this device)
  const bindLocal = (id, key) => {
    const i = $('#' + id); i.checked = localStorage.getItem(key) !== '0';
    i.addEventListener('change', () => { localStorage.setItem(key, i.checked ? '1' : '0'); if (i.checked && key === 'dyson-sound') D.beep(); });
  };

  // Change password
  const form = $('#pwForm'), msg = $('#pwMsg'), btn = $('#pwBtn');
  const say = (t, type = 'error') => { msg.textContent = t; msg.className = 'form-msg ' + type; msg.hidden = !t; };
  form.addEventListener('submit', async (e) => {
    e.preventDefault(); say('');
    const pw = $('#password').value, pw2 = $('#confirm').value;
    if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return say('Use at least 8 characters with a letter and a number.');
    if (pw !== pw2) return say('Passwords do not match.');
    btn.disabled = true; btn.replaceChildren(h('span', { class: 'spinner sm' }), ' Updating…');
    const { error: ue } = await sb.auth.updateUser({ password: pw });
    btn.disabled = false; btn.textContent = 'Update password';
    if (ue) return say(D.err(ue));
    form.reset(); say('Password updated.', 'success');
  });

  $('#thisDev').textContent = (navigator.userAgentData && navigator.userAgentData.platform || navigator.platform || 'This browser') + ' · ' + (session.user.email || '');
  $('#othersBtn').addEventListener('click', async () => {
    if (!confirm('Log out of all other devices?')) return;
    const { error: oe } = await sb.auth.signOut({ scope: 'others' });
    D.toast(oe ? D.err(oe) : 'Other devices were logged out.', oe ? 'error' : 'success', 2500);
  });
  $('#logoutBtn').addEventListener('click', D.logout);
})();

/* DYSON profile: view and edit own profile */
(async function () {
  const { sb, h, $ } = D;
  const session = await D.requireAuth();
  if (!session) return;
  const uid = session.user.id;
  const form = $('#form'), btn = $('#submit'), msg = $('#formMsg'), file = $('#avatar');
  const say = (t, type = 'error') => { msg.textContent = t; msg.className = 'form-msg ' + type; msg.hidden = !t; };
  const fe = (id, t) => { $('#' + id + '-err').textContent = t || ''; $('#' + id).setAttribute('aria-invalid', t ? 'true' : 'false'); return !t; };

  const { data: p, error } = await sb.from('profiles').select('*').eq('id', uid).single();
  if (error) { say(D.err(error)); return; }
  $('#full_name').value = p.full_name; $('#username').value = p.username;
  $('#bio').value = p.bio || ''; $('#status').value = p.status || ''; $('#email').value = session.user.email;
  $('#about').value = p.about || '';
  const { data: pv } = await sb.from('user_private').select('phone').eq('user_id', uid).maybeSingle();
  $('#phone').value = pv ? pv.phone : '';
  const box = $('#avatarBox'); box.replaceChildren(D.avatar(p, 'lg'));
  form.hidden = false; $('#loading').hidden = true;
  if (new URLSearchParams(location.search).has('welcome')) say('Welcome to DYSON. Choose your username and confirm your details to continue.', 'info');

  let cropped = null; // the circular crop (512x512 JPEG) that will be uploaded
  file.addEventListener('change', async () => {
    const f = file.files[0], e = D.checkImage(f); fe('avatar', e); file.value = '';
    if (!f || e) return;
    const c = await D.crop(f); if (!c) return;
    cropped = c; box.replaceChildren(D.avatar({ full_name: p.full_name, avatar_url: URL.createObjectURL(c) }, 'lg'));
  });

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault(); say('');
    const full = $('#full_name').value.trim(), user = $('#username').value.trim().toLowerCase().replace(/^@/, '');
    const bio = $('#bio').value.trim(), status = $('#status').value.trim(), f = cropped;
    let ok = true;
    ok = fe('full_name', full.length >= 2 && full.length <= 60 ? '' : 'Enter your name (2 to 60 characters)') && ok;
    ok = fe('username', /^[a-z0-9_]{3,20}$/.test(user) ? '' : 'Use 3 to 20 letters, numbers or underscores') && ok;
    ok = fe('bio', bio.length <= 160 ? '' : 'Bio can be up to 160 characters') && ok;
    ok = fe('status', status.length <= 60 ? '' : 'Status can be up to 60 characters') && ok;
    const phone = $('#phone').value.replace(/[\s-]/g, ''), about = $('#about').value.trim();
    ok = fe('phone', !phone || /^\+[1-9]\d{7,14}$/.test(phone) ? '' : 'Use international format, e.g. +256700000000') && ok;
    ok = fe('about', about.length <= 300 ? '' : 'About can be up to 300 characters') && ok;
    ok = fe('avatar', D.checkImage(f)) && ok;
    if (!ok) return;
    btn.disabled = true; btn.replaceChildren(h('span', { class: 'spinner sm' }), ' Saving…');
    try {
      if (user !== p.username) {
        const a = await sb.rpc('username_available', { uname: user });
        if (a.error) throw a.error;
        if (!a.data) { fe('username', 'That username is taken'); return; }
      }
      const patch = { full_name: full, username: user, bio, status, about, onboarded: true };
      if (f) patch.avatar_url = await D.uploadAvatar(f, uid);
      const { data, error: ue } = await sb.from('profiles').update(patch).eq('id', uid).select().single();
      if (ue) throw ue;
      const pr = phone ? await sb.from('user_private').upsert({ user_id: uid, phone }) : await sb.from('user_private').delete().eq('user_id', uid);
      if (pr.error) { say(pr.error.code === '23505' ? 'That phone number is already in use.' : D.err(pr.error)); return; }
      Object.assign(p, data); cropped = null;
      D.toast('Profile saved.', 'success');
      if (new URLSearchParams(location.search).has('welcome')) setTimeout(() => location.replace('app.html'), 800);
    } catch (e) { say(D.err(e)); }
    finally { btn.disabled = false; btn.textContent = 'Save changes'; }
  });
})();

/* DYSON auth: login, register, forgot password, reset password (Supabase Auth) */
(function () {
  const { $, h } = D;
  const page = document.body.dataset.page;
  const form = $('#form'), btn = $('#submit'), msg = $('#formMsg');
  const say = (t, type = 'error') => { msg.textContent = t; msg.className = 'form-msg ' + type; msg.hidden = !t; };
  const fe = (id, t) => { const e = $('#' + id + '-err'); if (e) e.textContent = t || ''; const i = $('#' + id); if (i) i.setAttribute('aria-invalid', t ? 'true' : 'false'); return !t; };
  const busy = (on, label) => {
    btn.disabled = on; btn.dataset.label = btn.dataset.label || btn.textContent;
    btn.replaceChildren(...(on ? [h('span', { class: 'spinner sm' }), ' ' + label] : [btn.dataset.label]));
  };
  if (!D.configured) { D.banner(); btn.disabled = true; return; }
  if (page !== 'reset') D.sb.auth.getSession().then(({ data }) => { if (data.session) location.replace('app.html'); });
  if (new URLSearchParams(location.search).has('expired')) say('Your session has ended. Sign in again.', 'info');
  const url = (f) => new URL(f, location.href).href;

  const strength = (p) => {
    let s = 0;
    if (p.length >= 8) s++; if (p.length >= 12) s++; if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s++; if (/\d/.test(p)) s++; if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };
  const pwOk = (p) => p.length >= 8 && /[A-Za-z]/.test(p) && /\d/.test(p);
  const meter = $('#meter i');
  if (meter && $('#password')) $('#password').addEventListener('input', (e) => {
    const s = strength(e.target.value);
    meter.style.width = s * 20 + '%'; meter.style.background = s < 3 ? 'var(--danger)' : s < 4 ? '#e5a100' : 'var(--ok)';
  });

  const handlers = {
    async login() {
      const id = $('#identifier').value.trim(), pw = $('#password').value;
      const a = fe('identifier', id ? '' : 'Enter your email or username'), b = fe('password', pw ? '' : 'Enter your password');
      if (!a || !b) return;
      busy(true, 'Signing in…');
      try {
        let email = id;
        if (!id.includes('@')) {
          const { data, error } = await D.sb.rpc('email_for_username', { uname: id });
          if (error) throw error;
          if (!data) throw { message: 'invalid login' };
          email = data;
        }
        const rem = $('#remember').checked;
        localStorage.setItem('dyson-remember', rem ? '1' : '0');
        D.sb = D.makeClient(rem);
        const { error } = await D.sb.auth.signInWithPassword({ email, password: pw });
        if (error) throw error;
        location.replace('app.html');
      } catch (e) { say(D.err(e)); busy(false); }
    },

    async register() {
      const v = (id) => $('#' + id).value.trim();
      const full = v('full_name'), user = v('username').toLowerCase().replace(/^@/, ''), email = v('email');
      const pw = $('#password').value, pw2 = $('#confirm').value, file = $('#avatar').files[0];
      let ok = true;
      ok = fe('full_name', full.length >= 2 && full.length <= 60 ? '' : 'Enter your full name (2 to 60 characters)') && ok;
      ok = fe('username', /^[a-z0-9_]{3,20}$/.test(user) ? '' : 'Use 3 to 20 letters, numbers or underscores') && ok;
      ok = fe('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Enter a valid email address') && ok;
      ok = fe('password', pwOk(pw) ? '' : 'Use at least 8 characters with a letter and a number') && ok;
      ok = fe('confirm', pw === pw2 ? '' : 'Passwords do not match') && ok;
      ok = fe('avatar', D.checkImage(file)) && ok;
      if (!ok) return;
      busy(true, 'Creating account…');
      try {
        const av = await D.sb.rpc('username_available', { uname: user });
        if (av.error) throw av.error;
        if (!av.data) { fe('username', 'That username is taken'); return busy(false); }
        localStorage.setItem('dyson-remember', '1');
        const { data, error } = await D.sb.auth.signUp({
          email, password: pw,
          options: { data: { username: user, full_name: full }, emailRedirectTo: url('login.html') },
        });
        if (error) throw error;
        if (data.user && data.user.identities && data.user.identities.length === 0) throw { message: 'already registered' };
        if (!data.session) {
          say('Account created. Check your email to confirm your address, then sign in.', 'success');
          form.reset(); return busy(false);
        }
        if (file) {
          try {
            const avatar_url = await D.uploadAvatar(file, data.user.id);
            const { error: ue } = await D.sb.from('profiles').update({ avatar_url }).eq('id', data.user.id);
            if (ue) throw ue;
          } catch (e) { console.error(e); D.toast('Account created, but the photo could not be uploaded. Add it in your profile.', 'error', 6000); await new Promise((r) => setTimeout(r, 1200)); }
        }
        location.replace('app.html');
      } catch (e) { say(D.err(e)); busy(false); }
    },

    async forgot() {
      const email = $('#email').value.trim();
      if (!fe('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'Enter a valid email address')) return;
      busy(true, 'Sending…');
      const { error } = await D.sb.auth.resetPasswordForEmail(email, { redirectTo: url('reset-password.html') });
      if (error) { say(D.err(error)); return busy(false); }
      say('If an account exists for that email, a reset link is on its way.', 'success'); busy(false);
    },

    async reset() {
      const pw = $('#password').value, pw2 = $('#confirm').value;
      const a = fe('password', pwOk(pw) ? '' : 'Use at least 8 characters with a letter and a number'), b = fe('confirm', pw === pw2 ? '' : 'Passwords do not match');
      if (!a || !b) return;
      busy(true, 'Saving…');
      const { error } = await D.sb.auth.updateUser({ password: pw });
      if (error) { say(D.err(error)); return busy(false); }
      say('Password updated. Redirecting…', 'success');
      setTimeout(() => location.replace('app.html'), 1200);
    },
  };

  if (page === 'register') {
    const av = $('#avatar'), box = $('#avatarBox');
    box.append(D.avatar({ full_name: '+' }, 'lg'));
    av.addEventListener('change', () => {
      const f = av.files[0], e = D.checkImage(f);
      fe('avatar', e);
      if (f && !e) box.replaceChildren(D.avatar({ full_name: '?', avatar_url: URL.createObjectURL(f) }, 'lg'));
    });
  }
  if (page === 'reset') {
    busy(true, 'Verifying link…');
    const ready = () => busy(false);
    D.sb.auth.onAuthStateChange((ev) => { if (ev === 'PASSWORD_RECOVERY' || ev === 'SIGNED_IN') ready(); });
    setTimeout(async () => { const { data } = await D.sb.auth.getSession(); if (data.session) ready(); else say('This reset link is invalid or has expired. Request a new one.'); }, 1500);
  }
  const g = $('#google'); // Google OAuth via Supabase: DYSON never sees a Google password
  if (g) g.addEventListener('click', async () => {
    g.disabled = true; localStorage.setItem('dyson-remember', '1');
    const { error } = await D.sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: url('app.html') } });
    if (error) { say(D.err(error)); g.disabled = false; }
  });
  form.addEventListener('submit', (e) => { e.preventDefault(); say(''); handlers[page](); });
})();

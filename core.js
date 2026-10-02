/* DYSON core: Supabase client, theme, helpers. Loaded on every page. */
(function () {
  const cfg = window.DYSON_CONFIG || {};
  const D = (window.D = {});
  D.configured = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !/YOUR_/.test(cfg.SUPABASE_URL + cfg.SUPABASE_ANON_KEY));
  D.$ = (s, r = document) => r.querySelector(s);

  // Safe DOM builder: all text goes through text nodes, so message content can never inject HTML.
  const h = (tag, ...r) => D.h(tag, ...r);
  D.h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const k in attrs) {
      if (k.startsWith('on')) e.addEventListener(k.slice(2), attrs[k]);
      else if (k === 'class') e.className = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach((x) => e.append(x && x.nodeType ? x : document.createTextNode(x === false || x == null ? '' : x)));
    return e;
  };

  // Themes: 7 colour themes + "system" (follows the OS light/dark setting)
  D.THEMES = ['wa-dark', 'wa-light', 'daylight', 'midnight', 'emerald', 'sunset', 'amethyst', 'rose', 'ocean', 'crimson', 'gold', 'forest', 'lavender', 'coral', 'slate', 'mint', 'sky'];
  const PK = { theme: 'dyson-theme', wall: 'dyson-wall', font: 'dyson-font', enter: 'dyson-enter', vo: 'dyson-vo', dl_photos: 'dyson-dlp', dl_videos: 'dyson-dlv', previews: 'dyson-preview', notify: 'dyson-notify', sound: 'dyson-sound' };
  const mq = matchMedia('(prefers-color-scheme: dark)');
  D.applyTheme = () => {
    let t = localStorage.getItem(PK.theme) || 'system'; t = { light: 'daylight', dark: 'midnight' }[t] || t;
    if (!D.THEMES.includes(t)) t = mq.matches ? 'wa-dark' : 'wa-light';
    const r = document.documentElement; r.dataset.theme = t; r.dataset.font = localStorage.getItem(PK.font) || 'medium'; r.dataset.wall = localStorage.getItem(PK.wall) || 'dots';
    const wi = localStorage.getItem('dyson-wallimg'); r.style.setProperty('--chat-bg', wi ? `url(${wi})` : 'none');
    const m = document.querySelector('meta[name=theme-color]'); if (m) m.content = getComputedStyle(r).getPropertyValue('--bg').trim() || m.content;
  };
  D.applyTheme(); mq.addEventListener('change', D.applyTheme);
  D.flag = (k, d) => { const v = localStorage.getItem(PK[k]); return v == null ? d : v === '1'; };
  // Preferences live on this device and sync to the user_preferences table (see supabase_additions.sql)
  D.savePref = (k, v) => { localStorage.setItem(PK[k], typeof v === 'boolean' ? (v ? '1' : '0') : v); D.applyTheme(); if (D.uid) D.sb.from('user_preferences').upsert({ user_id: D.uid, [k]: v, updated_at: new Date().toISOString() }).then((r) => r.error && console.error(r.error)); };
  D.pullPrefs = async (uid) => { const { data } = await D.sb.from('user_preferences').select('*').eq('user_id', uid).maybeSingle(); if (!data) return; for (const k in PK) if (data[k] != null) localStorage.setItem(PK[k], typeof data[k] === 'boolean' ? (data[k] ? '1' : '0') : data[k]); D.applyTheme(); };
  D.ic = (n, c = '') => { const NS = 'http://www.w3.org/2000/svg', v = document.createElementNS(NS, 'svg'), u = document.createElementNS(NS, 'use'); v.setAttribute('class', 'ic ' + c); v.setAttribute('aria-hidden', 'true'); u.setAttribute('href', 'icons.svg#i-' + n); v.append(u); return v; };
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(console.error));
  addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); D.installEv = e; document.dispatchEvent(new Event('dyson-installable')); });
  D.nextTheme = () => { const i = D.THEMES.indexOf(document.documentElement.dataset.theme); D.savePref('theme', D.THEMES[(i + 1) % D.THEMES.length]); };
  document.addEventListener('DOMContentLoaded', () => document.querySelectorAll('[data-theme-toggle]').forEach((b) => b.addEventListener('click', D.nextTheme)));

  // Supabase client. "Remember me" decides localStorage (persistent) vs sessionStorage.
  D.makeClient = (remember) =>
    window.supabase.createClient(cfg.SUPABASE_URL || 'https://placeholder.supabase.co', cfg.SUPABASE_ANON_KEY || 'placeholder', {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storage: remember ? localStorage : sessionStorage },
    });
  D.sb = D.makeClient(localStorage.getItem('dyson-remember') !== '0');

  D.banner = () =>
    document.body.append(D.h('div', { class: 'cfg-banner', role: 'alert' }, 'DYSON is not configured yet. Add your Supabase URL and anon key to config.js (see README).'));

  D.toast = (msg, type = 'info', ms = 4000, onclick) => {
    let box = document.getElementById('toasts');
    if (!box) { box = D.h('div', { id: 'toasts', 'aria-live': 'polite' }); document.body.append(box); }
    const t = D.h('div', { class: 'toast ' + type, role: type === 'error' ? 'alert' : 'status' }, msg);
    if (onclick) t.addEventListener('click', () => { onclick(); t.remove(); });
    box.append(t);
    setTimeout(() => t.remove(), ms);
  };

  // Friendly errors. Raw errors go to the console only.
  D.err = (e) => {
    console.error(e);
    const m = ((e && e.message) || '').toLowerCase();
    if (!navigator.onLine || m.includes('failed to fetch') || m.includes('network')) return 'Network problem. Check your connection and try again.';
    if (m.includes('invalid login')) return 'Incorrect email/username or password.';
    if (m.includes('email not confirmed')) return 'Confirm your email address first, then sign in.';
    if (m.includes('already registered')) return 'That email is already registered. Try signing in.';
    if (m.includes('database error')) return 'Could not create the account. The username may already be taken.';
    if (m.includes('jwt') || m.includes('expired')) return 'Your session has expired. Sign in again.';
    if (m.includes('user not found')) return 'That user could not be found.';
    if (e && (e.code === '42501' || m.includes('row-level security') || m.includes('not a member'))) return 'You do not have permission to do that.';
    if (e && e.code === '23505') return 'That username is already taken.';
    if (m.includes('already opened')) return 'This message was already opened.';
    if (m.includes('password')) return e.message;
    return 'Something went wrong. Please try again.';
  };

  D.requireAuth = async () => {
    if (!D.configured) { D.banner(); return null; }
    const { data: { session } } = await D.sb.auth.getSession();
    if (!session) { location.replace('login.html'); return null; }
    D.uid = session.user.id;
    D.sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_OUT') location.replace('login.html?expired=1'); });
    return session;
  };

  D.logout = async () => {
    try { if (D.setOffline) await D.setOffline(); await D.sb.auth.signOut(); } catch (e) { console.error(e); }
    location.replace('login.html');
  };

  D.checkImage = (f) => {
    if (!f) return '';
    if (!/^image\/(png|jpeg|webp|gif)$/.test(f.type)) return 'Use a PNG, JPG, WebP or GIF image.';
    if (f.size > 2 * 1024 * 1024) return 'Image must be 2 MB or smaller.';
    return '';
  };
  D.uploadAvatar = async (file, uid) => {
    const ext = file.type.split('/')[1].replace('jpeg', 'jpg');
    const path = `${uid}/avatar-${Date.now()}.${ext}`;
    const { error } = await D.sb.storage.from('avatars').upload(path, file, { contentType: file.type, upsert: true });
    if (error) throw error;
    return D.sb.storage.from('avatars').getPublicUrl(path).data.publicUrl;
  };

  D.avatar = (p, size = 'md', online = false, zoom = false) => {
    const name = (p && p.full_name) || '?';
    const w = D.h('span', { class: `avatar ${size}` + (online ? ' online' : '') });
    let hue = 0; for (const c of name) hue = (hue * 31 + c.charCodeAt(0)) % 360;
    const initials = () => { w.style.background = `hsl(${hue} 65% 42%)`; w.prepend(document.createTextNode(name.split(/\s+/).slice(0, 2).map((s) => s[0]).join('').toUpperCase())); };
    const url = p && p.avatar_url;
    if (url && /^https?:\/\//.test(url)) {
      const i = D.h('img', { alt: '', loading: 'lazy' });
      i.src = url; i.onerror = () => { i.remove(); initials(); };
      w.append(i);
    } else initials();
    if (zoom) { w.classList.add('zoom'); w.setAttribute('role', 'button'); w.setAttribute('aria-label', 'View profile photo'); w.addEventListener('click', (e) => { e.stopPropagation(); D.viewPhoto(p); }); }
    return w;
  };

  // Tap a profile picture to see it full size
  D.viewPhoto = (p) => {
    const o = h('div', { class: 'photoview', role: 'dialog', 'aria-label': 'Profile photo', onclick: () => o.remove() },
      h('div', { class: 'pv-head' }, D.avatar(p, 'sm'), h('b', {}, (p && p.full_name) || ''), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Close' }, D.ic('x'))),
      p && p.avatar_url && /^https?:\/\//.test(p.avatar_url) ? D.zoomable(h('img', { class: 'pv-img', src: p.avatar_url, alt: ((p && p.full_name) || '') + ' profile photo', onclick: (e) => e.stopPropagation() })) : D.avatar(p, 'xl'));
    document.body.append(o);
    const k = (e) => { if (e.key === 'Escape') { o.remove(); removeEventListener('keydown', k); } }; addEventListener('keydown', k);
  };
  const sameDay = (a, b) => new Date(a).toDateString() === new Date(b).toDateString();
  D.fmtTime = (d) => new Date(d).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  D.fmtDay = (d) => sameDay(d, Date.now()) ? 'Today' : sameDay(d, Date.now() - 864e5) ? 'Yesterday' : new Date(d).toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  D.fmtList = (d) => sameDay(d, Date.now()) ? D.fmtTime(d) : sameDay(d, Date.now() - 864e5) ? 'Yesterday' : new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' });
  D.fmtSeen = (d) => 'Last seen ' + (sameDay(d, Date.now()) ? 'today at ' + D.fmtTime(d) : D.fmtList(d));

  D.beep = () => {
    try {
      const a = new (window.AudioContext || window.webkitAudioContext)(), o = a.createOscillator(), g = a.createGain();
      o.frequency.value = 880; g.gain.value = 0.05; o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + 0.12);
    } catch (e) { /* audio may be blocked until user interaction */ }
  };
})();

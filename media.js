/* DYSON media: attachments, voice notes, video notes, view-once, media rendering */
(function () {
  const { h, $, sb } = D, DM = (window.DM = {});
  let X;
  const cfg = window.DYSON_CONFIG || {}, MAX = 50 * 1024 * 1024;
  const OK = /^(image\/(jpeg|png|webp|gif)|video\/(mp4|webm|quicktime)|audio\/(mpeg|mp4|aac|ogg|wav|webm|x-m4a|x-wav)|application\/(pdf|zip|msword|vnd\.ms-excel|vnd\.ms-powerpoint|vnd\.openxmlformats-officedocument\.[a-z.]+)|text\/(plain|csv))$/;
  const LABEL = { image: '📷 Photo', video: '🎥 Video', audio: '🎵 Audio', voice: '🎤 Voice message', videonote: '⏺ Video message', file: '📄 Document' };
  const kind = (t) => (t.startsWith('image/') ? 'image' : t.startsWith('video/') ? 'video' : t.startsWith('audio/') ? 'audio' : 'file');
  const dur = (ms) => { const s = Math.round((ms || 0) / 1000); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const size = (b) => (b > 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB');
  const url = async (path, dl) => { const { data, error } = await sb.storage.from('chat-media').createSignedUrl(path, 300, dl ? { download: dl } : undefined); if (error) throw error; return data.signedUrl; };

  async function upload(file, path, prog) { // XHR so we can show upload progress
    const { data: { session } } = await sb.auth.getSession();
    return new Promise((ok, no) => {
      const x = new XMLHttpRequest(), fd = new FormData();
      fd.append('cacheControl', '3600'); fd.append('', file);
      x.open('POST', `${cfg.SUPABASE_URL}/storage/v1/object/chat-media/${path.split('/').map(encodeURIComponent).join('/')}`);
      x.setRequestHeader('Authorization', 'Bearer ' + session.access_token); x.setRequestHeader('apikey', cfg.SUPABASE_ANON_KEY);
      x.upload.onprogress = (e) => e.lengthComputable && prog(e.loaded / e.total);
      x.onload = () => (x.status < 300 ? ok() : no(new Error(x.status === 403 ? 'row-level security' : 'upload failed ' + x.status)));
      x.onerror = () => no(new Error('network'));
      x.send(fd);
    });
  }

  // it: { file, type, caption, once, ms }
  DM.send = async (it) => {
    const c = X.conv(), f = it.file; if (!c) return;
    if (f.size > MAX) return D.toast('Files can be up to 50 MB.', 'error');
    if (!OK.test(f.type)) return D.toast('That file type is not supported.', 'error');
    const ext = (f.name.split('.').pop() || 'bin').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) || 'bin';
    const path = `${c.conversation_id}/${X.me.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const bar = $('#upl'), fill = $('#uplFill'); bar.hidden = false; $('#uplName').textContent = 'Sending ' + f.name;
    try {
      await upload(f, path, (p) => (fill.style.width = p * 100 + '%'));
      const label = (it.once ? '🔒 ' : '') + LABEL[it.type] + (it.caption ? ': ' + it.caption : '');
      const { data, error } = await sb.from('messages').insert({ conversation_id: c.conversation_id, sender_id: X.me.id, content: label.slice(0, 4000), reply_to: X.reply() ? X.reply().id : null, msg_type: it.type, caption: it.caption || null, media_path: path, media_mime: f.type, media_name: f.name, media_size: f.size, duration_ms: it.ms || null, view_once: !!it.once }).select(X.cols).single();
      if (error) throw error;
      X.done(data);
    } catch (e) { D.toast(D.err(e), 'error'); } finally { bar.hidden = true; fill.style.width = '0'; }
  };

  function stage(files) { // preview + caption + view-once switch
    files = [...files]; if (!files.length || !X.conv()) return;
    const cap = $('#prevCap'), once = $('#prevOnce'); cap.value = '';
    const media = files.every((f) => /^(image|video)\//.test(f.type));
    once.parentElement.hidden = !media; once.checked = media && D.flag('vo', false);
    $('#prevBody').replaceChildren(...files.map((f) => { const k = kind(f.type), u = URL.createObjectURL(f);
      return k === 'image' ? h('img', { src: u, alt: '' }) : k === 'video' ? h('video', { src: u, controls: '' }) : h('div', { class: 'fcard' }, h('span', { class: 'fi' }, D.ic(k === 'audio' ? 'music' : 'file')), h('span', { class: 'fn' }, h('b', {}, f.name), h('small', {}, size(f.size)))); }));
    $('#prev').hidden = false;
    $('#prevSend').onclick = async () => { $('#prev').hidden = true; for (const [i, f] of files.entries()) await DM.send({ file: f, type: kind(f.type), caption: i ? '' : cap.value.trim(), once: media && once.checked }); };
  }

  async function record(video) { // voice note (audio) or video note (round video, max 60 s)
    if (!X.conv()) return;
    if (!navigator.mediaDevices || !window.MediaRecorder) return D.toast('Recording is not supported in this browser.', 'error');
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia(video ? { audio: true, video: { facingMode: 'user', width: 480, height: 480 } } : { audio: true }); }
    catch (e) { return D.toast('Allow microphone' + (video ? ' and camera' : '') + ' access to record.', 'error'); }
    const types = video ? ['video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'] : ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4', 'audio/ogg;codecs=opus'];
    const mime = types.find((t) => MediaRecorder.isTypeSupported(t)) || '';
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined), chunks = [], t0 = Date.now(), vid = $('#recVid');
    let send = false;
    $('#rec').hidden = false; vid.hidden = !video; if (video) { vid.srcObject = stream; vid.play().catch(() => {}); }
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    rec.onstop = () => {
      clearInterval(tk); stream.getTracks().forEach((t) => t.stop()); $('#rec').hidden = true; vid.srcObject = null;
      if (!send) return;
      const base = (rec.mimeType || mime || (video ? 'video/webm' : 'audio/webm')).split(';')[0];
      DM.send({ file: new File(chunks, (video ? 'video-note.' : 'voice-note.') + base.split('/')[1], { type: base }), type: video ? 'videonote' : 'voice', ms: Date.now() - t0 });
    };
    rec.start(250);
    const tk = setInterval(() => { const s = Date.now() - t0; $('#recTime').textContent = dur(s); if (s >= (video ? 60000 : 600000)) $('#recSend').click(); }, 250);
    $('#recCancel').onclick = () => { send = false; rec.stop(); };
    $('#recSend').onclick = () => { send = true; rec.stop(); };
  }

  function view(src, k, cap, once) {
    const V = $('#viewer'), b = $('#viewBody'); V.hidden = false;
    b.replaceChildren(once ? h('span', { class: 'tag' }, '🔒 View once · this will not open again') : '', k === 'image' ? D.zoomable(h('img', { src, alt: '' })) : h('video', { src, controls: '', autoplay: '', playsinline: '' }), cap ? h('p', {}, cap) : '');
    $('#viewClose').onclick = () => { V.hidden = true; b.replaceChildren(); if (once) URL.revokeObjectURL(src); };
  }

  DM.openOnce = async (m) => { // server marks it opened, we keep it in memory and delete the stored file
    try {
      const { data, error } = await sb.rpc('open_view_once', { mid: m.id }); if (error) throw error;
      const r = Array.isArray(data) ? data[0] : data, blob = await (await fetch(await url(r.media_path))).blob();
      sb.storage.from('chat-media').remove([r.media_path]).catch(console.error);
      m.viewed_at = new Date().toISOString(); X.refresh(m);
      view(URL.createObjectURL(blob), m.msg_type, m.caption, true);
    } catch (e) { D.toast(D.err(e), 'error'); }
  };

  function player(m, k) {
    let a; const go = h('button', { class: 'play', type: 'button', 'aria-label': 'Play' }, D.ic('play')), bar = h('input', { type: 'range', min: 0, max: 100, value: 0, 'aria-label': 'Seek' }), t = h('small', {}, dur(m.duration_ms));
    const total = () => (isFinite(a.duration) ? a.duration : (m.duration_ms || 1) / 1000);
    go.onclick = async () => {
      try {
        if (!a) {
          a = new Audio(await url(m.media_path));
          a.ontimeupdate = () => { bar.value = (a.currentTime / total()) * 100; t.textContent = dur(a.currentTime * 1000); };
          a.onended = () => { go.replaceChildren(D.ic('play')); bar.value = 0; t.textContent = dur(m.duration_ms); };
          bar.oninput = () => { a.currentTime = (bar.value / 100) * total(); };
        }
        if (a.paused) { a.play(); go.replaceChildren(D.ic('pause')); } else { a.pause(); go.replaceChildren(D.ic('play')); }
      } catch (e) { D.toast(D.err(e), 'error'); }
    };
    return h('div', { class: 'aud' }, go, h('span', { class: 'aud-mid' }, bar, k === 'audio' ? h('small', { class: 'nm' }, m.media_name || 'Audio') : '', t));
  }

  function mediaEl(m, k) {
    if (k === 'voice' || k === 'audio') return player(m, k);
    if (k === 'file') return h('div', { class: 'fcard' }, h('span', { class: 'fi' }, D.ic('file')), h('span', { class: 'fn' }, h('b', {}, m.media_name), h('small', {}, size(m.media_size || 0))),
      h('button', { class: 'btn', type: 'button', onclick: async () => { try { location.href = await url(m.media_path, m.media_name); } catch (e) { D.toast(D.err(e), 'error'); } } }, 'Save'));
    const round = k === 'videonote', slot = h('div', { class: 'vis' + (round ? ' round' : '') });
    const load = async () => {
      slot.replaceChildren(h('span', { class: 'spinner' }));
      try {
        const u = await url(m.media_path);
        if (k === 'image') slot.replaceChildren(h('img', { src: u, alt: m.media_name || '', onclick: () => view(u, 'image', m.caption) }));
        else { const v = h('video', { src: u, playsinline: '', preload: 'metadata' }); if (round) { v.loop = true; v.onclick = () => (v.paused ? v.play() : v.pause()); v.play().catch(() => {}); } else v.controls = true; slot.replaceChildren(v); }
      } catch (e) { slot.replaceChildren(ph); }
    };
    const ph = h('button', { class: 'ph', type: 'button', onclick: load }, round ? '▶ Video message' : LABEL[k], h('small', {}, (round ? dur(m.duration_ms) + ' · ' : '') + size(m.media_size || 0)));
    slot.append(ph);
    if ((k === 'image' && D.flag('dl_photos', true)) || (k === 'video' && D.flag('dl_videos', false))) load();
    return slot;
  }

  DM.body = (m, uid) => {
    const box = h('div', { class: 'mbody' }), k = m.msg_type || 'text';
    if (k === 'text') { box.append(h('p', {}, m.content)); return box; }
    if (m.view_once) {
      const name = LABEL[k].replace(/^\S+\s/, '');
      box.append(m.viewed_at ? h('span', { class: 'once done' }, '🔓 Opened')
        : m.sender_id === uid ? h('span', { class: 'once' }, '🔒 ' + name + ' · View once')
        : h('button', { class: 'once', type: 'button', onclick: () => DM.openOnce(m) }, '🔒 ' + name + ' · Tap to view once'));
      return box;
    }
    box.append(mediaEl(m, k)); if (m.caption) box.append(h('p', { class: 'cap' }, m.caption));
    return box;
  };

  DM.init = (ctx) => {
    X = ctx; const menu = $('#attachMenu'), inp = $('#fileIn');
    $('#attachBtn').onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; };
    document.addEventListener('click', () => (menu.hidden = true));
    menu.querySelectorAll('button').forEach((b) => (b.onclick = () => { inp.accept = b.dataset.accept; b.dataset.cap ? inp.setAttribute('capture', 'environment') : inp.removeAttribute('capture'); inp.click(); }));
    inp.onchange = () => { stage(inp.files); inp.value = ''; };
    $('#micBtn').onclick = () => record(false); $('#vidBtn').onclick = () => record(true);
    $('#prevCancel').onclick = () => ($('#prev').hidden = true);
    const pane = $('#pane');
    pane.addEventListener('dragover', (e) => e.preventDefault());
    pane.addEventListener('drop', (e) => { e.preventDefault(); stage(e.dataTransfer.files); });
    $('#input').addEventListener('paste', (e) => { const f = [...(e.clipboardData.files || [])]; if (f.length) { e.preventDefault(); stage(f); } });
  };
})();

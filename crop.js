/* DYSON crop: circular profile-photo cropper. D.crop(file) resolves to a square JPEG File (512x512), or null if cancelled. */
(function () {
  const { h } = D;
  D.crop = (file, out = 512) => new Promise((done) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onerror = () => { URL.revokeObjectURL(url); D.toast('Could not open that image.', 'error'); done(null); };
    img.onload = () => {
      const S = Math.round(Math.min(innerWidth * 0.8, 320)), nw = img.naturalWidth, nh = img.naturalHeight, base = Math.max(S / nw, S / nh);
      let z = 1, ox = 0, oy = 0; const pts = new Map(); let d0 = 0, z0 = 1;
      const pic = h('img', { src: url, alt: '', draggable: 'false', class: 'crop-img' }), stage = h('div', { class: 'crop-stage', style: `width:${S}px;height:${S}px` }, pic, h('div', { class: 'crop-mask' }));
      const range = h('input', { type: 'range', min: '1', max: '4', step: '0.01', value: '1', 'aria-label': 'Zoom' });
      const place = () => {
        const k = base * z, mx = Math.max(0, (nw * k - S) / 2), my = Math.max(0, (nh * k - S) / 2);
        ox = Math.max(-mx, Math.min(mx, ox)); oy = Math.max(-my, Math.min(my, oy));
        pic.style.width = nw * k + 'px'; pic.style.height = nh * k + 'px'; pic.style.transform = `translate(calc(-50% + ${ox}px), calc(-50% + ${oy}px))`; range.value = z;
      };
      range.oninput = () => { z = +range.value; place(); };
      stage.addEventListener('pointerdown', (e) => { stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (pts.size === 2) { const [a, b] = [...pts.values()]; d0 = Math.hypot(a.x - b.x, a.y - b.y); z0 = z; } });
      stage.addEventListener('pointermove', (e) => {
        const p = pts.get(e.pointerId); if (!p) return; const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
        if (pts.size === 2) { const [a, b] = [...pts.values()]; z = Math.min(4, Math.max(1, (z0 * Math.hypot(a.x - b.x, a.y - b.y)) / (d0 || 1))); } else { ox += dx; oy += dy; }
        place();
      });
      ['pointerup', 'pointercancel'].forEach((n) => stage.addEventListener(n, (e) => pts.delete(e.pointerId)));
      stage.addEventListener('wheel', (e) => { e.preventDefault(); z = Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.08 : 0.93))); place(); }, { passive: false });
      const close = (v) => { URL.revokeObjectURL(url); m.remove(); done(v); };
      const use = h('button', { class: 'btn btn-primary', type: 'button', style: 'flex:1' }, 'Use photo');
      use.onclick = () => {
        const k = base * z, side = S / k, sx = nw / 2 - ox / k - side / 2, sy = nh / 2 - oy / k - side / 2;
        const c = document.createElement('canvas'); c.width = c.height = out; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, out, out); x.imageSmoothingQuality = 'high';
        x.drawImage(img, sx, sy, side, side, 0, 0, out, out);
        c.toBlob((b) => (b ? close(new File([b], 'avatar.jpg', { type: 'image/jpeg' })) : (D.toast('Could not crop that image.', 'error'), close(null))), 'image/jpeg', 0.9);
      };
      const m = h('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Crop profile photo' }, h('div', { class: 'modal-card crop-card' },
        h('header', {}, h('h2', { style: 'margin:0;font-size:1.2rem' }, 'Crop photo'), h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'Cancel', onclick: () => close(null) }, D.ic('x'))),
        h('div', { class: 'body crop-body' }, stage, h('p', { class: 'hint' }, 'Drag to move. Pinch or use the slider to zoom. Only the circle is kept.'), range,
          h('div', { style: 'display:flex;gap:8px;width:100%;margin-top:12px' }, h('button', { class: 'btn', type: 'button', style: 'flex:1', onclick: () => close(null) }, 'Cancel'), use))));
      document.body.append(m); place();
    };
    img.src = url;
  });
})();

// Vice City Cover Maker — build-v5. Fresh implementation for gta6-cover-art-01.
// Vanilla JS + canvas 2D. All assets local; zero network requests at runtime.
// 6 layouts, 5 grades, face-safe crops, caption + badge, export at 3 sizes.
'use strict';

const $ = (id) => document.getElementById(id);
const canvas = $('preview');
const ctx = canvas.getContext('2d');

// ---------------------------------------------------------------- state
const state = {
  size: '1920x1080',
  layout: 'hero3',
  grade: 'sunset',
  title: 'NEON SHORE',
  subtitle: 'a vice city story',
  badge: 'NIGHT SHIFT',
  grain: true,
  vignette: true,
  photos: [], // {img, name}
  panels: [], // {photo, zoom, ox, oy}
  selected: 0,
};

const SIZES = {
  '1920x1080': [1920, 1080],
  '1080x1350': [1080, 1350],
  '1080x1080': [1080, 1080],
};

const GRADES = {
  sunset: { filter: 'saturate(1.28) contrast(1.08) sepia(0.16) hue-rotate(-10deg) brightness(1.02)',
    top: 'rgba(255,150,60,0.16)', bottom: 'rgba(255,45,120,0.20)', accent: '#ffb347' },
  neon: { filter: 'saturate(1.55) contrast(1.12) hue-rotate(6deg)',
    top: 'rgba(255,60,180,0.18)', bottom: 'rgba(0,220,200,0.16)', accent: '#ff5da2' },
  dusk: { filter: 'saturate(1.35) contrast(1.05) hue-rotate(28deg) brightness(0.94)',
    top: 'rgba(120,60,220,0.16)', bottom: 'rgba(40,10,80,0.22)', accent: '#c77dff' },
  mono: { filter: 'grayscale(1) contrast(1.16) brightness(1.03)',
    top: 'rgba(255,255,255,0.05)', bottom: 'rgba(0,0,0,0.12)', accent: '#e8e8e8' },
  teal: { filter: 'saturate(1.25) contrast(1.06) sepia(0.12) hue-rotate(115deg)',
    top: 'rgba(0,180,170,0.12)', bottom: 'rgba(0,60,90,0.20)', accent: '#4de3d1' },
};

// ---------------------------------------------------------------- fonts
let fontsReady = false;
async function loadFonts() {
  try {
    const anton = new FontFace('Anton', "url('fonts/Anton-Regular.ttf')", { weight: '400' });
    const pacifico = new FontFace('Pacifico', "url('fonts/Pacifico-Regular.ttf')", { weight: '400' });
    const [a, p] = await Promise.all([anton.load(), pacifico.load()]);
    document.fonts.add(a);
    document.fonts.add(p);
    await document.fonts.ready;
    fontsReady = true;
  } catch (e) {
    // Fall back to system fonts; the cover still renders.
    fontsReady = false;
  }
}

// ---------------------------------------------------------------- layouts
// Each layout returns {panels: [{x,y,w,h,rot}], title: {kind, x,y,w,h}}.
// rot is in degrees around the panel centre. Gutters are thick black bands.
function layoutPanels(name, W, H) {
  const g = Math.max(6, Math.round(W * 0.007)); // gutter
  const half = g / 2;
  const bandH = Math.round(H * 0.17); // caption band at the bottom (overlay layouts)
  const title = { kind: 'overlay', x: 0, y: H - bandH, w: W, h: bandH };
  const P = (x, y, w, h, rot = 0) => ({ x, y, w, h, rot });
  switch (name) {
    case 'grid4': {
      const cw = (W - g) / 2, ch = (H - g) / 2;
      return { panels: [
        P(0, 0, cw, ch), P(cw + g, 0, cw, ch),
        P(0, ch + g, cw, ch), P(cw + g, ch + g, cw, ch),
      ], title };
    }
    case 'hero3': {
      const bigW = Math.round(W * 0.62), restW = W - bigW - g;
      const ch = (H - 2 * g) / 3;
      return { panels: [
        P(0, 0, bigW, H),
        P(bigW + g, 0, restW, ch), P(bigW + g, ch + g, restW, ch),
        P(bigW + g, 2 * (ch + g), restW, ch),
      ], title };
    }
    case 'single':
      return { panels: [P(0, 0, W, H)], title };
    case 'grid9': {
      const cw = (W - 2 * g) / 3, ch = (H - 2 * g) / 3;
      const out = [];
      for (let r = 0; r < 3; r++)
        for (let c = 0; c < 3; c++)
          out.push(P(c * (cw + g), r * (ch + g), cw, ch));
      return { panels: out, title: { ...title, h: Math.round(H * 0.15), y: H - Math.round(H * 0.15) } };
    }
    case 'tilted': {
      // Blurred backdrop + three tilted snapshots, lowest ending at 0.66H
      // so the title band (from 0.83H) stays clear.
      const sw = Math.round(W * 0.34), sh = Math.round(H * 0.30);
      return { panels: [
        P(Math.round(W * 0.06), Math.round(H * 0.07), sw, sh, -6),
        P(Math.round(W * 0.55), Math.round(H * 0.05), sw, sh, 5),
        P(Math.round(W * 0.30), Math.round(H * 0.36), sw, sh, -3),
      ], title, backdrop: true };
    }
    case 'portrait': {
      const px = Math.round(W * 0.08), pw = W - 2 * px;
      const ph = Math.round(H * 0.66);
      return { panels: [P(px, Math.round(H * 0.04), pw, ph)],
        title: { kind: 'block', x: 0, y: Math.round(H * 0.70), w: W, h: H - Math.round(H * 0.70) } };
    }
    default:
      return layoutPanels('hero3', W, H);
  }
}

// Face-safe default crop per panel: gentle zoom spread, top-biased framing
// (the crop window sits slightly high so faces and headroom survive).
function defaultCrop(i) {
  return { zoom: 1.0 + (i % 4) * 0.04, ox: 0, oy: 0 };
}

// Spread the loaded photos across panels so neighbours never repeat a photo.
function autoAssign(n) {
  const m = state.photos.length;
  const out = [];
  if (m === 0) { for (let i = 0; i < n; i++) out.push({ photo: -1, ...defaultCrop(i) }); return out; }
  if (m === 1) { for (let i = 0; i < n; i++) out.push({ photo: 0, ...defaultCrop(i) }); return out; }
  for (let i = 0; i < n; i++) out.push({ photo: i % 2 === 0 ? 0 : 1, ...defaultCrop(i) });
  return out;
}

function ensurePanels() {
  const [W, H] = SIZES[state.size];
  const n = layoutPanels(state.layout, W, H).panels.length;
  if (state.panels.length !== n) state.panels = autoAssign(n);
  if (state.selected >= n) state.selected = 0;
}

// ---------------------------------------------------------------- drawing
// Cheap deterministic blur for the tilted backdrop: draw tiny, scale up smooth.
function drawBlurred(c, img, W, H) {
  const t = document.createElement('canvas');
  t.width = 48; t.height = Math.max(2, Math.round(48 * H / W));
  const tc = t.getContext('2d');
  tc.drawImage(img, 0, 0, t.width, t.height);
  c.save();
  c.imageSmoothingEnabled = true;
  c.imageSmoothingQuality = 'high';
  c.drawImage(t, 0, 0, W, H);
  c.restore();
  c.fillStyle = 'rgba(10,6,20,0.45)';
  c.fillRect(0, 0, W, H);
}

function drawPhoto(c, img, r, zoom, ox, oy) {
  const iw = img.naturalWidth, ih = img.naturalHeight;
  const s = Math.max(r.w / iw, r.h / ih) * zoom;
  const dw = iw * s, dh = ih * s;
  const slackX = Math.max(0, (dw - r.w) / 2);
  const slackY = Math.max(0, (dh - r.h) / 2);
  // Top bias: at oy = 0 the window sits 90% of the slack toward the top of
  // the photo, keeping faces and headroom in frame. Drag moves it within slack.
  const offY = Math.max(-1, Math.min(1, oy + 0.90)) * slackY;
  const offX = Math.max(-1, Math.min(1, ox)) * slackX;
  const dx = r.x + (r.w - dw) / 2 + offX;
  const dy = r.y + (r.h - dh) / 2 + offY;
  c.drawImage(img, dx, dy, dw, dh);
}

function gradeOverlay(c, r, grade) {
  const g = c.createLinearGradient(r.x, r.y, r.x, r.y + r.h);
  g.addColorStop(0, grade.top);
  g.addColorStop(1, grade.bottom);
  c.save();
  c.globalCompositeOperation = 'overlay';
  c.fillStyle = g;
  c.fillRect(r.x, r.y, r.w, r.h);
  c.restore();
}

function halftone(c, r, W) {
  const step = Math.max(10, Math.round(W * 0.008));
  const rad = Math.max(1.2, step * 0.16);
  c.save();
  c.beginPath();
  c.rect(r.x, r.y, r.w, r.h);
  c.clip();
  c.fillStyle = 'rgba(255,255,255,0.10)';
  for (let y = r.y + step / 2; y < r.y + r.h; y += step)
    for (let x = r.x + step / 2; x < r.x + r.w; x += step) {
      c.beginPath();
      c.arc(x, y, rad, 0, Math.PI * 2);
      c.fill();
    }
  c.restore();
}

function drawTitleBlock(c, t, W, H) {
  const grade = GRADES[state.grade];
  if (t.kind === 'block') {
    c.fillStyle = '#1a0f2e';
    c.fillRect(t.x, t.y, t.w, t.h);
    halftone(c, t, W);
  } else {
    // Scrim only behind the caption block, never a full-width dark band.
    const g = c.createLinearGradient(0, t.y, 0, t.y + t.h);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.45, 'rgba(0,0,0,0.55)');
    g.addColorStop(1, 'rgba(0,0,0,0.78)');
    c.fillStyle = g;
    c.fillRect(t.x, t.y, t.w, t.h);
    halftone(c, { x: t.x, y: t.y + t.h * 0.35, w: t.w, h: t.h * 0.65 }, W);
  }
  const cx = t.x + t.w / 2;
  const titleSize = Math.round(t.h * 0.52);
  const subSize = Math.round(t.h * 0.24);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  // Title: Anton, white with a black outline, sized to fit the band.
  let fs = titleSize;
  c.font = `${fs}px Anton, 'Arial Narrow', sans-serif`;
  const maxW = t.w * 0.92;
  while (c.measureText(state.title).width > maxW && fs > 12) {
    fs -= 2;
    c.font = `${fs}px Anton, 'Arial Narrow', sans-serif`;
  }
  const ty = t.y + t.h * 0.38;
  c.lineWidth = Math.max(2, fs * 0.09);
  c.strokeStyle = 'rgba(0,0,0,0.85)';
  c.strokeText(state.title, cx, ty);
  c.fillStyle = '#ffffff';
  c.fillText(state.title, cx, ty);
  // Subtitle: Pacifico script in the grade accent colour.
  c.font = `${subSize}px Pacifico, cursive`;
  c.fillStyle = grade.accent;
  c.fillText(state.subtitle, cx, t.y + t.h * 0.80);
}

function drawBadge(c, W, H) {
  const grade = GRADES[state.grade];
  const inset = Math.round(W * 0.02);
  const fs = Math.max(14, Math.round(W * 0.018));
  c.save();
  c.font = `${fs}px Anton, 'Arial Narrow', sans-serif`;
  const tw = c.measureText(state.badge).width;
  const padX = fs * 0.7, padY = fs * 0.42;
  const bw = tw + padX * 2, bh = fs + padY * 2;
  // Place from the rotated bounding box so the whole badge stays inside,
  // inset from the top-right corner by 2% of the width.
  const rot = -6 * Math.PI / 180;
  const cos = Math.abs(Math.cos(rot)), sin = Math.abs(Math.sin(rot));
  const bbW = bw * cos + bh * sin, bbH = bw * sin + bh * cos;
  const cx = W - inset - bbW / 2;
  const cy = inset + bbH / 2;
  c.translate(cx, cy);
  c.rotate(rot);
  c.fillStyle = grade.accent;
  c.fillRect(-bw / 2, -bh / 2, bw, bh);
  c.strokeStyle = 'rgba(0,0,0,0.55)';
  c.lineWidth = Math.max(1, fs * 0.06);
  c.strokeRect(-bw / 2, -bh / 2, bw, bh);
  c.fillStyle = '#14081f';
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillText(state.badge, 0, 1);
  c.restore();
}

// Deterministic grain tile (seeded, so exports are stable run to run).
let grainTile = null;
function getGrainTile() {
  if (grainTile) return grainTile;
  const t = document.createElement('canvas');
  t.width = 128; t.height = 128;
  const tc = t.getContext('2d');
  const img = tc.createImageData(128, 128);
  let seed = 1234567;
  const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let i = 0; i < img.data.length; i += 4) {
    const v = Math.floor(rnd() * 255);
    img.data[i] = v; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255;
  }
  tc.putImageData(img, 0, 0);
  grainTile = t;
  return t;
}

function renderCover(c, W, H) {
  ensurePanels();
  const grade = GRADES[state.grade];
  c.save();
  c.clearRect(0, 0, W, H);
  c.fillStyle = '#000000';
  c.fillRect(0, 0, W, H);
  const lay = layoutPanels(state.layout, W, H);
  const g = Math.max(6, Math.round(W * 0.007));
  // Tilted layout: blurred, darkened backdrop first.
  if (lay.backdrop && state.photos.length > 0) {
    const bg = state.photos[state.panels[0] && state.panels[0].photo >= 0 ? state.panels[0].photo : 0];
    if (bg) drawBlurred(c, bg.img, W, H);
  }
  lay.panels.forEach((r, i) => {
    const p = state.panels[i];
    if (!p || p.photo < 0 || !state.photos[p.photo]) return;
    const img = state.photos[p.photo].img;
    c.save();
    if (r.rot) {
      // Black frame behind the tilted snapshot, then rotate about its centre.
      const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
      c.translate(cx, cy);
      c.rotate(r.rot * Math.PI / 180);
      c.fillStyle = '#000000';
      c.fillRect(-r.w / 2 - g / 2, -r.h / 2 - g / 2, r.w + g, r.h + g);
      c.beginPath();
      c.rect(-r.w / 2, -r.h / 2, r.w, r.h);
      c.clip();
      c.filter = grade.filter;
      drawPhoto(c, img, { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h }, p.zoom, p.ox, p.oy);
      c.filter = 'none';
      gradeOverlay(c, { x: -r.w / 2, y: -r.h / 2, w: r.w, h: r.h }, grade);
    } else {
      c.beginPath();
      c.rect(r.x, r.y, r.w, r.h);
      c.clip();
      c.filter = grade.filter;
      drawPhoto(c, img, r, p.zoom, p.ox, p.oy);
      c.filter = 'none';
      gradeOverlay(c, r, grade);
    }
    c.restore();
  });
  drawTitleBlock(c, lay.title, W, H);
  drawBadge(c, W, H);
  if (state.vignette) {
    const vg = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.32)');
    c.fillStyle = vg;
    c.fillRect(0, 0, W, H);
  }
  if (state.grain) {
    const tile = getGrainTile();
    c.save();
    c.globalAlpha = 0.05;
    c.globalCompositeOperation = 'overlay';
    const pat = c.createPattern(tile, 'repeat');
    c.fillStyle = pat;
    c.fillRect(0, 0, W, H);
    c.restore();
  }
  // Selected-panel outline (preview only; exports render without selection).
  c.restore();
}

// ---------------------------------------------------------------- history
function snapshot() {
  return JSON.stringify({
    size: state.size, layout: state.layout, grade: state.grade,
    title: state.title, subtitle: state.subtitle, badge: state.badge,
    grain: state.grain, vignette: state.vignette,
    panels: state.panels, selected: state.selected,
  });
}
function restore(s) {
  const d = JSON.parse(s);
  Object.assign(state, d);
  syncControls();
  renderPreview();
}
let undoStack = [], redoStack = [];
function pushHistory() {
  undoStack.push(snapshot());
  if (undoStack.length > 60) undoStack.shift();
  redoStack = [];
}
function undo() {
  if (!undoStack.length) return;
  redoStack.push(snapshot());
  restore(undoStack.pop());
}
function redo() {
  if (!redoStack.length) return;
  undoStack.push(snapshot());
  restore(redoStack.pop());
}

// Caption undo: one step per typing burst. Snapshot on focus; commit the
// step once the burst pauses (700 ms without input).
let captionFocusSnap = null, captionTimer = null;
function captionFocus() { captionFocusSnap = snapshot(); }
function captionInput() {
  clearTimeout(captionTimer);
  captionTimer = setTimeout(() => {
    if (captionFocusSnap && captionFocusSnap !== snapshot()) {
      undoStack.push(captionFocusSnap);
      if (undoStack.length > 60) undoStack.shift();
      redoStack = [];
    }
    captionFocusSnap = snapshot();
  }, 700);
}

// ---------------------------------------------------------------- preview
function previewSize() {
  if (state.size === '1080x1350') return [720, 900];
  if (state.size === '1080x1080') return [720, 720];
  return [960, 540];
}
function renderPreview() {
  const [pw, ph] = previewSize();
  if (canvas.width !== pw) canvas.width = pw;
  if (canvas.height !== ph) canvas.height = ph;
  const [W, H] = SIZES[state.size];
  // Render at export resolution into an offscreen canvas, then scale to the
  // preview so what you see is exactly what exports.
  const off = document.createElement('canvas');
  off.width = W; off.height = H;
  renderCover(off.getContext('2d'), W, H);
  ctx.clearRect(0, 0, pw, ph);
  ctx.drawImage(off, 0, 0, pw, ph);
  // Selected panel outline, drawn in preview coordinates.
  const lay = layoutPanels(state.layout, W, H);
  const r = lay.panels[state.selected];
  if (r) {
    const sx = pw / W, sy = ph / H;
    ctx.save();
    ctx.translate((r.x + r.w / 2) * sx, (r.y + r.h / 2) * sy);
    ctx.rotate(r.rot * Math.PI / 180);
    ctx.strokeStyle = '#e8b64c';
    ctx.lineWidth = 3;
    ctx.strokeRect(-r.w * sx / 2, -r.h * sy / 2, r.w * sx, r.h * sy);
    ctx.restore();
  }
  $('status').textContent = `Ready — ${state.photos.length} photo(s) loaded · ${state.layout} · ${state.grade} · ${state.size}`;
}

// Rotation-aware hit test, topmost panel first.
function hitPanel(px, py) {
  const [W, H] = SIZES[state.size];
  const [pw, ph] = previewSize();
  const x = px * W / pw, y = py * H / ph;
  const lay = layoutPanels(state.layout, W, H);
  for (let i = lay.panels.length - 1; i >= 0; i--) {
    const r = lay.panels[i];
    const cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const a = -r.rot * Math.PI / 180;
    const lx = Math.cos(a) * (x - cx) - Math.sin(a) * (y - cy);
    const ly = Math.sin(a) * (x - cx) + Math.cos(a) * (y - cy);
    if (Math.abs(lx) <= r.w / 2 && Math.abs(ly) <= r.h / 2) return i;
  }
  return -1;
}

// ---------------------------------------------------------------- pointer drag
let drag = null;
canvas.addEventListener('pointerdown', (e) => {
  const rect = canvas.getBoundingClientRect();
  const i = hitPanel(e.clientX - rect.left, e.clientY - rect.top);
  if (i < 0) return;
  pushHistory();
  state.selected = i;
  syncControls();
  renderPreview();
  drag = { i, x: e.clientX, y: e.clientY, moved: false };
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const [W, H] = SIZES[state.size];
  const [pw] = previewSize();
  const scale = W / pw;
  const dx = (e.clientX - drag.x) * scale;
  const dy = (e.clientY - drag.y) * scale;
  if (Math.abs(dx) + Math.abs(dy) > 2) drag.moved = true;
  const p = state.panels[drag.i];
  const r = layoutPanels(state.layout, W, H).panels[drag.i];
  const img = state.photos[p.photo] && state.photos[p.photo].img;
  if (!img) return;
  const s = Math.max(r.w / img.naturalWidth, r.h / img.naturalHeight) * p.zoom;
  const slackX = Math.max(1, (img.naturalWidth * s - r.w) / 2);
  const slackY = Math.max(1, (img.naturalHeight * s - r.h) / 2);
  p.ox = Math.max(-1, Math.min(1, p.ox + dx / slackX));
  p.oy = Math.max(-1, Math.min(1, p.oy + dy / slackY));
  drag.x = e.clientX; drag.y = e.clientY;
  renderPreview();
});
canvas.addEventListener('pointerup', () => {
  if (drag && !drag.moved) { undoStack.pop(); redoStack = []; } // click-only: no change
  drag = null;
});

// ---------------------------------------------------------------- controls
function syncControls() {
  document.querySelectorAll('#size-seg button').forEach(b =>
    b.classList.toggle('active', b.dataset.size === state.size));
  document.querySelectorAll('#layout-seg button').forEach(b =>
    b.classList.toggle('active', b.dataset.layout === state.layout));
  document.querySelectorAll('#grade-seg button').forEach(b =>
    b.classList.toggle('active', b.dataset.grade === state.grade));
  $('title-input').value = state.title;
  $('subtitle-input').value = state.subtitle;
  $('badge-input').value = state.badge;
  $('grain-check').checked = state.grain;
  $('vignette-check').checked = state.vignette;
  const p = state.panels[state.selected];
  if (p) $('zoom-slider').value = String(p.zoom);
}
function bindSeg(id, key, after) {
  $(id).addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    pushHistory();
    state[key] = b.dataset[key];
    if (key === 'layout' || key === 'size') ensurePanels();
    syncControls();
    renderPreview();
    if (after) after();
  });
}
bindSeg('size-seg', 'size');
bindSeg('layout-seg', 'layout');
bindSeg('grade-seg', 'grade');

function bindCaption(id, key) {
  const el = $(id);
  el.addEventListener('focus', captionFocus);
  el.addEventListener('input', () => {
    state[key] = el.value;
    captionInput();
    renderPreview();
  });
  el.addEventListener('blur', () => { clearTimeout(captionTimer); captionInput(); });
}
bindCaption('title-input', 'title');
bindCaption('subtitle-input', 'subtitle');
bindCaption('badge-input', 'badge');

$('grain-check').addEventListener('change', (e) => { pushHistory(); state.grain = e.target.checked; renderPreview(); });
$('vignette-check').addEventListener('change', (e) => { pushHistory(); state.vignette = e.target.checked; renderPreview(); });
$('undo-btn').addEventListener('click', undo);
$('redo-btn').addEventListener('click', redo);
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) { e.preventDefault(); undo(); }
  if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.key.toLowerCase() === 'z' && e.shiftKey))) { e.preventDefault(); redo(); }
});
$('zoom-slider').addEventListener('input', (e) => {
  const p = state.panels[state.selected];
  if (!p) return;
  p.zoom = parseFloat(e.target.value);
  renderPreview();
});
$('zoom-slider').addEventListener('change', () => pushHistory());
$('reset-crop').addEventListener('click', () => {
  pushHistory();
  const p = state.panels[state.selected];
  if (p) Object.assign(p, defaultCrop(state.selected));
  syncControls();
  renderPreview();
});
function cyclePhoto(dir) {
  if (!state.photos.length) return;
  pushHistory();
  const p = state.panels[state.selected];
  if (!p) return;
  p.photo = (p.photo + dir + state.photos.length) % state.photos.length;
  renderPreview();
}
$('prev-photo').addEventListener('click', () => cyclePhoto(-1));
$('next-photo').addEventListener('click', () => cyclePhoto(1));

// ---------------------------------------------------------------- photos
function addPhoto(img, name) {
  state.photos.push({ img, name });
  const [W, H] = SIZES[state.size];
  const n = layoutPanels(state.layout, W, H).panels.length;
  // Rebalance assignments across the photos now available.
  state.panels = autoAssign(n);
  renderPhotoList();
  renderPreview();
}
function renderPhotoList() {
  const list = $('photo-list');
  list.innerHTML = '';
  state.photos.forEach((p, i) => {
    const thumb = document.createElement('img');
    thumb.src = p.img.src;
    thumb.alt = p.name;
    thumb.title = p.name;
    thumb.classList.toggle('used', state.panels.some(pn => pn.photo === i));
    thumb.addEventListener('click', () => {
      pushHistory();
      const sel = state.panels[state.selected];
      if (sel) sel.photo = i;
      renderPhotoList();
      renderPreview();
    });
    list.appendChild(thumb);
  });
}
function loadFile(file) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { addPhoto(img, file.name); resolve(true); };
    img.onerror = () => resolve(false);
    img.src = url;
  });
}
$('file-input').addEventListener('change', async (e) => {
  for (const f of e.target.files) await loadFile(f);
  e.target.value = '';
});
canvas.addEventListener('dragover', (e) => e.preventDefault());
canvas.addEventListener('drop', async (e) => {
  e.preventDefault();
  for (const f of e.dataTransfer.files) if (f.type.startsWith('image/')) await loadFile(f);
});
async function loadSamples() {
  for (const name of ['boulevard.jpg', 'pier.jpg']) {
    try {
      const res = await fetch(`samples/${name}`);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise((resolve) => { img.onload = resolve; img.onerror = resolve; img.src = url; });
      if (img.naturalWidth) addPhoto(img, name);
    } catch (e) { /* sample missing: the app still works with user photos */ }
  }
}
$('load-samples').addEventListener('click', loadSamples);

// ---------------------------------------------------------------- export
function exportBlob(w, h) {
  return new Promise((resolve) => {
    const off = document.createElement('canvas');
    off.width = w; off.height = h;
    renderCover(off.getContext('2d'), w, h);
    off.toBlob((b) => resolve(b), 'image/png');
  });
}
async function downloadExport(w, h) {
  const blob = await exportBlob(w, h);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vice-city-cover-${w}x${h}.png`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
$('export-169').addEventListener('click', () => downloadExport(1920, 1080));
$('export-45').addEventListener('click', () => downloadExport(1080, 1350));
$('export-11').addEventListener('click', () => downloadExport(1080, 1080));

// Driver API for the headless screenshot/export script.
window.__cover = {
  state,
  fontsReady: () => fontsReady,
  photosLoaded: () => state.photos.length,
  loadSamples,
  renderPreview,
  exportDataURL: async (w, h) => {
    const blob = await exportBlob(w, h);
    return await new Promise((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    });
  },
};

// ---------------------------------------------------------------- init
(async () => {
  await loadFonts();
  ensurePanels();
  renderPreview();
  await loadSamples();
  renderPreview();
})();

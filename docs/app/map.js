// The star map: every charted world at its square on the Standard Galactic Grid, lit by what happens
// there during the span of time the era ribbon is showing. Region rings are measured from the worlds'
// own grid squares (the Deep Core sits at about K-10).
import { token, norm } from './data.js';
import { uToT, fmtTime } from './scale.js';
import { esc } from './field.js';

const CX = 11.6, CY = 10.4;             // galactic core in 1-based grid units (column A = 1)
const COLS = 23, ROWS = 21;
const RINGS = [
  ['Deep Core', 1.1], ['Core Worlds', 2.2], ['Colonies', 3.1], ['Inner Rim', 4.0],
  ['Expansion Region', 5.2], ['Mid Rim', 7.0], ['Outer Rim Territories', 10.0], ['Wild Space', 11.4],
];
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function hash(s) { let h = 2166136261; for (const c of s) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); } return (h >>> 0) / 4294967296; }

export class GalaxyMap {
  constructor({ canvas, tip, store, field, hooks }) {
    Object.assign(this, { canvas, tip, S: store, field, hooks });
    this.ctx = canvas.getContext('2d');
    this.zt = d3.zoomIdentity;
    this.on = false; this.sel = null; this.hover = null;
    this.lit = new Map();
    this.place();
    this.initZoom();
    this.initPointer();
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
  }

  // grid square → position; worlds sharing a square fan out around its centre
  place() {
    const cells = new Map();
    this.worlds = this.S.places.filter((w) => w.g);
    for (const w of this.worlds) {
      const [c, r] = w.g.split('-');
      const key = w.g;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(w);
      w.gc = c.charCodeAt(0) - 64; w.gr = +r;
    }
    for (const list of cells.values()) {
      list.sort((a, b) => b.n - a.n);
      list.forEach((w, i) => {
        const a = hash(w.k) * Math.PI * 2 + i * 2.39996, rad = i === 0 ? 0.12 : Math.min(0.42, 0.16 + 0.07 * Math.sqrt(i));
        w.mx = w.gc + Math.cos(a) * rad; w.my = w.gr + Math.sin(a) * rad;
      });
    }
    this.labelled = new Set(this.worlds.slice().sort((a, b) => b.n - a.n).slice(0, 34).map((w) => w.k));
  }

  resize() {
    const r = this.canvas.parentElement.getBoundingClientRect();
    const w = Math.max(200, r.width), h = Math.max(200, r.height);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    const pad = 26;
    this.cell = Math.min((w - pad * 2) / (COLS + 0.5), (h - pad * 2) / (ROWS + 0.5));
    this.ox = (w - this.cell * COLS) / 2 - this.cell * 0.5; this.oy = (h - this.cell * ROWS) / 2 - this.cell * 0.5;
    if (this.zoom) this.zoom.extent([[0, 0], [w, h]]).translateExtent([[-w * 0.3, -h * 0.3], [w * 1.3, h * 1.3]]);
    this.draw();
  }

  sx(gx) { return this.zt.applyX(this.ox + gx * this.cell); }
  sy(gy) { return this.zt.applyY(this.oy + gy * this.cell); }

  initZoom() {
    this.zoom = d3.zoom().scaleExtent([0.8, 14]).on('zoom', (e) => { this.zt = e.transform; this.draw(); });
    d3.select(this.canvas).call(this.zoom).on('dblclick.zoom', null);
  }

  initPointer() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const hit = e.buttons ? null : this.pick(e.clientX - r.left, e.clientY - r.top);
      this.hover = hit;
      c.classList.toggle('point', !!hit);
      this.showTip(hit, e.clientX - r.left, e.clientY - r.top);
      this.draw();
    });
    c.addEventListener('pointerleave', () => { this.hover = null; this.showTip(null); this.draw(); });
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      const hit = this.pick(e.clientX - r.left, e.clientY - r.top);
      this.hooks.onPick && this.hooks.onPick(hit);
    });
  }

  show(on) {
    this.on = on;
    this.canvas.hidden = !on;
    this.field.canvas.hidden = on;
    if (on) { this.resize(); this.refresh(); }
    else this.showTip(null);
  }

  select(w) { this.sel = w; if (this.on) this.draw(); }
  reskin() { this.draw(); }

  // which worlds are active in the ribbon's window
  refresh() {
    if (!this.on) return;
    const [ua, ub] = this.field.visibleU();
    this.ta = uToT(ua); this.tb = uToT(ub);
    const lit = new Map();
    const add = (k, n) => lit.set(k, (lit.get(k) || 0) + n);
    for (const r of this.S.records) {
      if (r.u < ua || r.u > ub || (r.leg && !this.S.legendsOn)) continue;
      for (const pi of r.pl || []) add(this.S.places[pi].k, 1);
    }
    for (const e of this.S.events) if (e.u >= ua && e.u <= ub) for (const k of e.places || []) add(k, 1.5);
    if (this.S.legendsOn) for (const e of this.S.levents) if (e.u >= ua && e.u <= ub) for (const k of e.places || []) add(k, 1);
    this.lit = lit;
    this.litMax = Math.max(1, ...lit.values());
    this.draw();
  }

  pick(px, py) {
    let best = null, bd = 10;
    for (const w of this.worlds) {
      const d = Math.hypot(this.sx(w.mx) - px, this.sy(w.my) - py);
      if (d < bd) { bd = d; best = w; }
    }
    return best ? { kind: 'w', item: best } : null;
  }

  showTip(hit, px, py) {
    const tip = this.tip;
    if (!hit) { tip.classList.remove('on'); return; }
    const w = hit.item, n = this.lit.get(w.k) || 0;
    tip.innerHTML = `<div class="tk">${esc(w.r || 'Uncharted region')}${w.g ? ', grid ' + esc(w.g) : ''}</div><div class="tt">${esc(w.k)}</div>
      <div class="td">${n ? `${Math.round(n)} in this span` : 'Quiet in this span'}, ${w.n} entries in all</div>`;
    tip.classList.add('on');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = px + 16, y = py + 14;
    if (x + tw > this.w - 6) x = px - tw - 14;
    if (y + th > this.h - 6) y = py - th - 12;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  draw() {
    if (!this.on || !this.w) return;
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = token('--c-map-bg', '#060a12'); ctx.fillRect(0, 0, w, h);
    const k = this.zt.k, cx = this.sx(CX), cy = this.sy(CY), unit = this.cell * k;
    const ui = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();
    const disp = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim();
    // the galactic disc: a faint glow toward the core
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, unit * 11.5);
    g.addColorStop(0, 'rgba(255, 230, 190, 0.16)'); g.addColorStop(0.18, 'rgba(127, 216, 255, 0.07)'); g.addColorStop(1, 'rgba(127, 216, 255, 0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, unit * 11.5, 0, Math.PI * 2); ctx.fill();
    // the Standard Galactic Grid
    ctx.strokeStyle = token('--c-map-grid', 'rgba(169,125,69,.1)'); ctx.lineWidth = 1;
    ctx.font = `500 ${clamp(10 * Math.sqrt(k), 10, 13)}px ${ui}`; ctx.fillStyle = token('--c-map-ring-text', '#4f6384');
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    for (let c = 1; c <= COLS; c++) {
      const x = this.sx(c - 0.5);
      ctx.beginPath(); ctx.moveTo(x, this.sy(0.5)); ctx.lineTo(x, this.sy(ROWS + 0.5)); ctx.stroke();
      if (c <= COLS) ctx.fillText(String.fromCharCode(64 + c), this.sx(c), Math.max(10, this.sy(0.5) - 9));
    }
    for (let r = 1; r <= ROWS + 1; r++) {
      const y = this.sy(r - 0.5);
      ctx.beginPath(); ctx.moveTo(this.sx(0.5), y); ctx.lineTo(this.sx(COLS + 0.5), y); ctx.stroke();
      if (r <= ROWS) ctx.fillText(String(r), Math.max(10, this.sx(0.5) - 11), this.sy(r));
    }
    // region rings
    ctx.strokeStyle = token('--c-map-ring', 'rgba(127,216,255,.1)');
    ctx.font = `600 ${clamp(10 * Math.sqrt(k), 10, 13)}px ${disp}`;
    ctx.fillStyle = token('--c-map-ring-text', '#4f6384');
    RINGS.forEach(([name, rad], i) => {
      ctx.lineWidth = i === 6 ? 1.4 : 1;
      ctx.beginPath(); ctx.arc(cx, cy, rad * unit, 0, Math.PI * 2); ctx.stroke();
      const inner = i ? RINGS[i - 1][1] : 0;
      if ((rad - inner) * unit > 16) {
        const yy = cy - ((rad + inner) / 2) * unit;
        ctx.fillText(name.toUpperCase(), cx, yy);
      }
    });
    // the Unknown Regions: the unmapped western reach
    ctx.fillStyle = token('--c-map-unknown', 'rgba(3,5,10,.7)');
    ctx.beginPath(); ctx.arc(cx, cy, 12.4 * unit, Math.PI * 0.78, Math.PI * 1.22); ctx.arc(cx, cy, 4.6 * unit, Math.PI * 1.22, Math.PI * 0.78, true); ctx.closePath(); ctx.fill();
    ctx.fillStyle = token('--c-map-ring-text', '#4f6384');
    ctx.save(); ctx.translate(cx - 9.6 * unit, cy); ctx.rotate(-Math.PI / 2); ctx.fillText('UNKNOWN REGIONS', 0, 0); ctx.restore();

    // worlds
    const P = { dot: token('--c-map-planet', '#6f86a3'), lit: token('--c-map-lit', '#7fd8ff'), loc: token('--locator', '#ffcf7a'), ink: token('--ink', '#e8f3f8'), dim: token('--dim', '#92a3b7'), bg: token('--c-map-bg', '#060a12') };
    const labels = [];
    const sorted = this.worlds.slice().sort((a, b) => (this.lit.get(a.k) || 0) - (this.lit.get(b.k) || 0));
    for (const wd of sorted) {
      const x = this.sx(wd.mx), y = this.sy(wd.my);
      if (x < -20 || y < -20 || x > w + 20 || y > h + 20) continue;
      const n = this.lit.get(wd.k) || 0;
      const base = clamp(1.2 + Math.log2(1 + wd.n) * 0.55, 1.4, 4.2) * Math.sqrt(Math.min(k, 4));
      if (n) {
        const r = base + 2.2 * Math.sqrt(n / this.litMax) * Math.sqrt(Math.min(k, 4)) + 1;
        ctx.shadowColor = P.lit; ctx.shadowBlur = 8 + 10 * Math.sqrt(n / this.litMax);
        ctx.fillStyle = P.lit; ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
        labels.push({ wd, x, y, r, pri: 2 + n / this.litMax, lit: true });
      } else {
        ctx.globalAlpha = 0.55; ctx.fillStyle = P.dot;
        ctx.beginPath(); ctx.arc(x, y, base * 0.8, 0, Math.PI * 2); ctx.fill();
        if (this.labelled.has(wd.k) || k > 3.2) labels.push({ wd, x, y, r: base, pri: k > 3.2 ? 0.5 + wd.n / 200 : 1 + wd.n / 400, lit: false });
      }
    }
    ctx.globalAlpha = 1;
    // selected world
    const focus = [this.sel, this.hover && this.hover.item].filter(Boolean);
    for (const wd of focus) {
      const x = this.sx(wd.mx), y = this.sy(wd.my);
      ctx.strokeStyle = P.loc; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2); ctx.stroke();
      labels.push({ wd, x, y, r: 9, pri: 99, lit: true, sel: true });
    }
    // labels, most important first, no overlaps
    labels.sort((a, b) => b.pri - a.pri);
    const boxes = [];
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    for (const L of labels) {
      const f = L.sel ? `600 13px ${ui}` : L.lit ? `600 12px ${ui}` : `500 11px ${ui}`;
      ctx.font = f;
      const tw = ctx.measureText(L.wd.k).width;
      const bx = [L.x + L.r + 4, L.y - 7, tw + 4, 14];
      if (boxes.some((b) => bx[0] < b[0] + b[2] && bx[0] + bx[2] > b[0] && bx[1] < b[1] + b[3] && bx[1] + bx[3] > b[1])) continue;
      boxes.push(bx);
      ctx.fillStyle = L.sel ? P.loc : L.lit ? P.ink : P.dim;
      ctx.globalAlpha = L.lit ? 1 : 0.75;
      ctx.fillText(L.wd.k, bx[0] + 1, L.y + 0.5);
    }
    ctx.globalAlpha = 1;
    // what span the map is showing, bottom left, on a plate so the grid never runs through it
    const span = `${fmtTime(this.ta, 1)} to ${fmtTime(this.tb, 1)}`;
    const sub = `${this.lit.size} worlds active. Move the ribbon window to travel in time.`;
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.font = `500 12px ${ui}`; const sw = ctx.measureText(sub).width;
    ctx.fillStyle = P.bg; ctx.globalAlpha = 0.85; ctx.fillRect(8, h - 50, Math.max(sw, 200) + 12, 44); ctx.globalAlpha = 1;
    ctx.font = `600 14px ${ui}`; ctx.fillStyle = P.loc; ctx.fillText(span, 14, h - 30);
    ctx.font = `500 12px ${ui}`; ctx.fillStyle = P.dim; ctx.fillText(sub, 14, h - 13);
  }

  // search helper: world by loose name
  find(q) { const n = norm(q); return this.S.places.find((w) => norm(w.k) === n) || null; }
}

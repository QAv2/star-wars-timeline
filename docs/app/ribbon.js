// The era ribbon: all of galactic time at a glance, with record density and the field's current
// window. Click to jump, drag the window to pan, double-click an era to fit it.
import { SEGMENTS } from './scale.js';
import { token } from './data.js';

export class Ribbon {
  constructor(canvas, store, field) {
    Object.assign(this, { canvas, S: store, field });
    this.ctx = canvas.getContext('2d');
    this.drag = null;
    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    this.initPointer();
    this.resize();
  }

  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.w = Math.max(100, r.width); this.h = Math.max(30, r.height);
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(this.w * this.dpr); this.canvas.height = Math.round(this.h * this.dpr);
    this.x0 = 2; this.x1 = this.w - 2;
    this.bin();
    this.draw();
  }

  bin() {
    const n = Math.max(60, Math.floor((this.x1 - this.x0) / 3));
    const bins = new Float32Array(n);
    for (const r of this.S.records) if (!r.leg || this.S.legendsOn) bins[Math.min(n - 1, Math.floor(r.u * n))] += 1;
    for (const e of this.S.events) bins[Math.min(n - 1, Math.floor(e.u * n))] += 0.6;
    if (this.S.legendsOn) for (const e of this.S.levents) bins[Math.min(n - 1, Math.floor(e.u * n))] += 0.6;
    this.bins = bins; this.binMax = Math.max(...bins);
  }

  X(u) { return this.x0 + u * (this.x1 - this.x0); }
  U(x) { return (x - this.x0) / (this.x1 - this.x0); }

  draw() {
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const blockH = 18, blockTop = h - blockH - 1;
    const n = this.bins.length, bw = (this.x1 - this.x0) / n, dh = blockTop - 5;
    ctx.fillStyle = token('--c-ribbon-density', '#28436a');
    for (let i = 0; i < n; i++) {
      if (!this.bins[i]) continue;
      const bh = Math.max(1.5, Math.sqrt(this.bins[i] / this.binMax) * dh);
      ctx.fillRect(this.x0 + i * bw, blockTop - 3 - bh, Math.max(1, bw - 1), bh);
    }
    const blocks = token('--c-era-blocks', '#1a2a44 #203352').split(/\s+/);
    const ui = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim();
    ctx.font = `600 12px ${ui}`; ctx.textBaseline = 'middle';
    SEGMENTS.forEach((s, i) => {
      const a = this.X(s.u0) + (i ? 1 : 0), b = this.X(s.u1) - 1;
      ctx.fillStyle = blocks[i % blocks.length];
      ctx.fillRect(a, blockTop, Math.max(1, b - a), blockH);
      const label = b - a > 70 ? s.short : '';
      if (label) {
        ctx.fillStyle = token('--c-axis-text', '#d9c29a');
        const tw = ctx.measureText(label).width;
        if (tw < b - a - 8) ctx.fillText(label, a + 6, blockTop + blockH / 2 + 0.5);
      }
    });
    const [ua, ub] = this.field.visibleU();
    let xa = this.X(ua), xb = this.X(ub);
    if (xb - xa < 6) { const m = (xa + xb) / 2; xa = m - 3; xb = m + 3; }
    this.win = [xa, xb];
    ctx.fillStyle = token('--c-ribbon-window', 'rgba(255,207,122,.12)');
    ctx.fillRect(xa, 0, xb - xa, h);
    ctx.strokeStyle = token('--locator', '#ffcf7a'); ctx.lineWidth = 1.5;
    ctx.strokeRect(xa + 0.75, 0.75, xb - xa - 1.5, h - 1.5);
  }

  initPointer() {
    const c = this.canvas;
    const pos = (e) => { const r = c.getBoundingClientRect(); return e.clientX - r.left; };
    c.addEventListener('pointerdown', (e) => {
      const x = pos(e);
      c.setPointerCapture(e.pointerId);
      const [a, b] = this.win || [0, 0];
      if (x >= a - 4 && x <= b + 4) this.drag = { dx: x - (a + b) / 2 };
      else { this.drag = { dx: 0 }; this.field.centerU(this.U(x), 450); }
    });
    c.addEventListener('pointermove', (e) => {
      if (!this.drag || !e.buttons) return;
      this.field.centerU(this.U(pos(e) - this.drag.dx), 0);
    });
    c.addEventListener('pointerup', () => { this.drag = null; });
    c.addEventListener('dblclick', (e) => {
      const u = this.U(pos(e));
      const s = SEGMENTS.find((x) => u >= x.u0 && u <= x.u1);
      if (s) this.field.fitU(s.u0, s.u1);
    });
  }
}

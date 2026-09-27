// The stacks: a zoomable canvas of lanes (one per series), the chronicle, vision arcs, worldlines,
// and overlays for lineages, offices and relics. Every colour comes from the active skin.
import { SEGMENTS, tToU, uToT, ticks, fmtTime, boundaryLabel } from './scale.js';
import { token, visionColor } from './data.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const ease = (x) => 1 - Math.pow(1 - x, 3);
const MAXZ = 6000;

function lowerBound(arr, u) {
  let lo = 0, hi = arr.length;
  while (lo < hi) { const m = (lo + hi) >> 1; if (arr[m].u < u) lo = m + 1; else hi = m; }
  return lo;
}

export class Field {
  constructor({ stage, canvas, labels, tip, store, hooks }) {
    Object.assign(this, { stage, canvas, labelsEl: labels, tip, S: store, hooks });
    this.ctx = canvas.getContext('2d');
    this.zt = d3.zoomIdentity;
    this.muted = new Set();
    this.mode = 'continuum';
    this.sel = null; this.hover = null; this.hoverX = null;
    this.worlds = []; this.overlay = null; this.world = null;
    this.reveal = 1; this.tw = new Map(); this.raf = 0; this.lanes = [];
    this.fonts();
    this.prepare();
    this.initZoom();
    this.initPointer();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(stage);
    this.resize();
  }

  fonts() {
    const ui = getComputedStyle(document.documentElement).getPropertyValue('--font-ui').trim() || 'sans-serif';
    const disp = getComputedStyle(document.documentElement).getPropertyValue('--font-display').trim() || 'serif';
    this.F = { label: `600 12px ${ui}`, small: `500 11.5px ${ui}`, axis: `500 12px ${ui}`, era: `600 11px ${disp}`, row: `600 12px ${ui}` };
    this.tw.clear();
  }

  // colours are read once per skin and cached
  pal() {
    if (this._pal) return this._pal;
    const t = (n, f) => token(n, f);
    this._pal = {
      bgTop: t('--c-stage-top', '#0c1628'), bgBot: t('--c-stage-bot', '#070b14'), shelf: t('--c-shelf', 'rgba(127,216,255,.03)'),
      shelfLine: t('--c-shelf-line', 'rgba(127,216,255,.1)'), grid: t('--c-grid', '#111b2e'), eraLine: t('--c-era-line', '#26324a'),
      eraText: t('--c-era-text', '#55688a'), axisLine: t('--c-axis-line', '#a97d45'), axisTick: t('--c-axis-tick', '#5d4b33'),
      axisMajor: t('--c-axis-major', '#a97d45'), axisText: t('--c-axis-text', '#d9c29a'), axisDim: t('--c-axis-dim', '#7a8aa2'),
      label: t('--c-label', '#d5e4ec'), labelDim: t('--c-label-dim', '#9fb3c4'), event: t('--c-event', '#eadcbf'), eventText: t('--c-event-text', '#c6b999'),
      legEvent: t('--c-leg-event', '#b8a4e3'), locator: t('--locator', '#ffcf7a'), conflict: t('--conflict', '#e5484d'), accent: t('--accent', '#7fd8ff'),
      world1: t('--c-world-1', '#ffcf7a'), world2: t('--c-world-2', '#bfefff'), calloutBg: t('--c-callout-bg', '#070b14'), glow: t('--c-glow', 'rgba(127,216,255,.5)'),
      ink: t('--ink', '#e8f3f8'), dim: t('--dim', '#92a3b7'), frame: t('--frame', '#a97d45'), frameHi: t('--frame-hi', '#dfb77c'),
    };
    return this._pal;
  }
  reskin() { this._pal = null; this.fonts(); this.S.recolor(); this.w = 0; this.resize(); this.renderLaneLabels(); this.requestDraw(); }

  // ── data prep ─────────────────────────────────────────────────────
  prepare() {
    const S = this.S;
    this.byLane = new Map(S.lanes.map((l) => [l.id, []]));
    for (const r of S.records) (this.byLane.get(r.l) || this.byLane.get('FILM')).push(r);
    for (const arr of this.byLane.values()) arr.sort((a, b) => a.u - b.u);
    this.spans = new Map();
    for (const [id, arr] of this.byLane) {
      const spans = [];
      let cur = null;
      for (const r of arr) {
        if (cur && r.t - cur.t1 < 2) { cur.t1 = r.t; cur.u1 = r.u; cur.n++; }
        else { cur = { t0: r.t, t1: r.t, u0: r.u, u1: r.u, n: 1 }; spans.push(cur); }
      }
      this.spans.set(id, spans);
    }
    this.legs = S.visions.flatMap((v) => v.legs);
  }

  visibleLanes() { return this.S.lanes.filter((l) => l.id !== 'LEGENDS' || this.S.legendsOn); }

  // ── geometry ──────────────────────────────────────────────────────
  resize() {
    const r = this.stage.getBoundingClientRect();
    const w = Math.max(200, r.width), h = Math.max(200, r.height);
    if (w === this.w && h === this.h) return;
    this.w = w; this.h = h;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(w * this.dpr); this.canvas.height = Math.round(h * this.dpr);
    this.narrow = w < 640;
    const lw = parseFloat(token('--lane-label-w', '96')) || 96;   // a skin with a wide face widens the lane gutter
    this.labelW = this.narrow ? Math.round(lw * 0.73) : lw;
    this.px0 = this.labelW + 10; this.px1 = w - 12; this.pw = this.px1 - this.px0;
    this.layout();
    if (this.zoom) {
      this.zoom.extent([[this.px0, 0], [this.px1, h]]).translateExtent([[this.px0, 0], [this.px1, h]]);
      if (this.lastVis) this.fitU(this.lastVis[0], this.lastVis[1], null, 0, 1);
    }
    this.requestDraw();
  }

  layout() {
    const H = this.h, lanes = this.visibleLanes();
    this.axisH = 30;
    const weights = lanes.map((l) => (l.id === 'HISTORY' ? 3 : l.id === 'LEGENDS' ? 2.2 : l.id === 'FILM' ? 1.3 : 1));
    const minArc = this.narrow ? 64 : 92;
    const avail = H - this.axisH - minArc - 4;
    const unit = clamp(avail / weights.reduce((a, b) => a + b, 0), 10, 30);
    const used = unit * weights.reduce((a, b) => a + b, 0);
    this.arcTop = 6;
    let y = H - this.axisH - 4 - used;
    this.lanesTop = y;
    this.lanes = lanes.map((l, i) => { const h = unit * weights[i]; const L = { ...l, color: l.color, y0: y, y1: y + h, yc: y + h / 2, h }; y += h; return L; });
    this.laneMap = new Map(this.lanes.map((l) => [l.id, l]));
    this.unit = unit;
    this.renderLaneLabels();
  }

  renderLaneLabels() {
    const counts = new Map();
    for (const r of this.S.records) counts.set(r.l, (counts.get(r.l) || 0) + 1);
    counts.set('HISTORY', this.S.events.length);
    counts.set('LEGENDS', (counts.get('LEGENDS') || 0) + this.S.levents.length);
    const hide = !!this.overlay || this.mode === 'map';
    this.labelsEl.innerHTML = this.lanes.map((l) => {
      const ph = Math.min(l.h - 3, l.id === 'HISTORY' || l.id === 'LEGENDS' ? 24 : 20);
      const lane = this.S.laneById.get(l.id);
      return `<button class="lanelabel${this.muted.has(l.id) ? ' muted' : ''}${hide ? ' off' : ''}" data-lane="${l.id}" title="${lane.sub}: show or mute this lane"
        style="top:${(l.yc - ph / 2).toFixed(1)}px;height:${ph.toFixed(1)}px;max-width:${this.labelW}px;background:${lane.color}">
        ${this.narrow ? l.nar || l.label.split(' ')[0] : l.label}<span class="n">${counts.get(l.id) || ''}</span></button>`;
    }).join('');
  }

  laneAt(py) { return this.lanes.find((l) => py >= l.y0 && py < l.y1) || null; }
  X(u) { return this.zt.k * (this.px0 + u * this.pw) + this.zt.x; }
  uAt(px) { return ((px - this.zt.x) / this.zt.k - this.px0) / this.pw; }
  visibleU() { return [Math.max(0, this.uAt(this.px0)), Math.min(1, this.uAt(this.px1))]; }
  yearsPerPx(u) { const a = uToT(u), b = uToT(Math.min(1, u + 1 / (this.pw * this.zt.k))); return Math.abs(b - a); }
  laneY(id) { const L = this.laneMap.get(id) || this.laneMap.get('HISTORY'); return L.yc; }

  // ── zoom & pointer ────────────────────────────────────────────────
  initZoom() {
    const sel = d3.select(this.canvas);
    this.zoom = d3.zoom()
      .scaleExtent([1, MAXZ])
      .extent([[this.px0, 0], [this.px1, this.h]])
      .translateExtent([[this.px0, 0], [this.px1, this.h]])
      .clickDistance(5)
      .filter((e) => (!e.ctrlKey || e.type === 'wheel') && !e.button)
      .on('zoom', (e) => {
        this.zt = e.transform;
        this.lastVis = this.visibleU();
        this.requestDraw();
        this.hooks.onView && this.hooks.onView(false);
      })
      .on('end', () => this.hooks.onView && this.hooks.onView(true));
    sel.call(this.zoom).on('dblclick.zoom', null);
    this.canvas.addEventListener('wheel', (e) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault(); e.stopImmediatePropagation();
      this.zoom.translateBy(sel, -dx / this.zt.k, 0);
    }, { capture: true, passive: false });
  }

  initPointer() {
    const c = this.canvas;
    c.addEventListener('pointermove', (e) => {
      const r = c.getBoundingClientRect();
      const px = e.clientX - r.left, py = e.clientY - r.top;
      this.hoverX = px >= this.px0 && px <= this.px1 ? px : null;
      const hit = e.buttons ? null : this.pick(px, py);
      this.hover = hit;
      c.classList.toggle('point', !!hit);
      c.classList.toggle('grab', !hit);
      this.showTip(hit, px, py);
      if (this.hoverX != null) this.hooks.onHover && this.hooks.onHover(uToT(this.uAt(px)), this.yearsPerPx(this.uAt(px)));
      this.requestDraw();
    });
    c.addEventListener('pointerleave', () => {
      this.hover = null; this.hoverX = null; this.showTip(null);
      this.hooks.onHover && this.hooks.onHover(null);
      this.requestDraw();
    });
    c.addEventListener('click', (e) => {
      const r = c.getBoundingClientRect();
      this.hooks.onPick && this.hooks.onPick(this.pick(e.clientX - r.left, e.clientY - r.top));
    });
    this.labelsEl.addEventListener('click', (e) => {
      const b = e.target.closest('[data-lane]');
      if (!b) return;
      const id = b.dataset.lane;
      if (this.muted.has(id)) this.muted.delete(id); else this.muted.add(id);
      b.classList.toggle('muted', this.muted.has(id));
      this.requestDraw();
      this.hooks.onView && this.hooks.onView(true);
    });
  }

  // ── camera ────────────────────────────────────────────────────────
  transformFor(ua, ub, center) {
    const base = (u) => this.px0 + u * this.pw;
    const k = clamp((this.px1 - this.px0) * 0.88 / Math.max(1e-9, base(ub) - base(ua)), 1, MAXZ);
    const c = center == null ? (ua + ub) / 2 : center;
    return d3.zoomIdentity.translate((this.px0 + this.px1) / 2 - k * base(c), 0).scale(k);
  }
  fitU(ua, ub, center = null, dur = 750, pad = 0.88) {
    let t = this.transformFor(ua, ub, center);
    if (pad === 1) {
      const k = clamp((this.px1 - this.px0) / Math.max(1e-9, (ub - ua) * this.pw), 1, MAXZ);
      t = d3.zoomIdentity.translate(this.px0 - (this.px0 + ua * this.pw) * k, 0).scale(k);
    }
    const sel = d3.select(this.canvas);
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!dur || reduce || this.mode === 'map') sel.call(this.zoom.transform, t);
    else sel.transition().duration(dur).ease(d3.easeCubicInOut).call(this.zoom.transform, t);
  }
  bringIntoView(t, spanYears = 2) {
    const u = tToU(t);
    const ua = tToU(t - spanYears / 2), ub = tToU(t + spanYears / 2);
    const [va, vb] = this.visibleU();
    const want = Math.max(ub - ua, 0.0006);
    const x = this.X(u);
    const inView = x > this.px0 + 30 && x < this.px1 - 30;
    if (inView && vb - va <= want * 6) return;
    this.fitU(u - want / 2, u + want / 2, u);
  }
  centerU(u, dur = 0) {
    const [va, vb] = this.visibleU();
    const half = (vb - va) / 2;
    this.fitU(u - half, u + half, u, dur, 1);
  }
  zoomBy(f) { d3.select(this.canvas).transition().duration(250).call(this.zoom.scaleBy, f, [(this.px0 + this.px1) / 2, this.h / 2]); }

  // ── state from the app ────────────────────────────────────────────
  setMode(m) { const was = this.mode; this.mode = m; if ((was === 'map') !== (m === 'map')) this.renderLaneLabels(); this.requestDraw(); }
  select(sel) { this.sel = sel; this.requestDraw(); }
  setWorlds(people) { const p = this.pal(); this.worlds = people.map((x, i) => ({ p: x, color: i % 2 ? p.world2 : p.world1 })); this.requestDraw(); }
  setWorld(w) { this.world = w; this.requestDraw(); }
  setLegends() { this.layout(); this.requestDraw(); }
  setVantage(v) { this.vantage = v || null; this.requestDraw(); }
  setOverlay(ov) {
    this.overlay = ov ? this.buildOverlay(ov) : null;
    this.renderLaneLabels();
    this.requestDraw();
  }
  startReveal() {
    this.hold = false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { this.reveal = 1; this.requestDraw(); return; }
    this.reveal = 0; this.revealStart = performance.now();
    this.requestDraw();
    setTimeout(() => { if (this.reveal < 1) { this.reveal = 1; this.requestDraw(); } }, 1500);
  }

  inView() {
    const [ua, ub] = this.visibleU();
    const out = [];
    for (const r of this.S.records) if (r.u >= ua && r.u <= ub && !this.muted.has(r.l) && (!r.leg || this.S.legendsOn)) out.push(r);
    if (!this.muted.has('HISTORY')) for (const e of this.S.events) if (e.u >= ua && e.u <= ub) out.push(e);
    if (this.S.legendsOn && !this.muted.has('LEGENDS')) for (const e of this.S.levents) if (e.u >= ua && e.u <= ub) out.push(e);
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // ── overlays: lineage trees, named lines, offices, relics ────────
  buildOverlay(ov) {
    const S = this.S, rows = [], links = [];
    const life = (p) => {
      const d = p.dossier || {};
      const own = p.recs.filter((r) => !r.leg);
      const t0 = d.born && typeof d.born.t === 'number' ? d.born.t : own.length ? own[0].t : null;
      const t1 = d.died && typeof d.died.t === 'number' ? d.died.t : own.length ? own[own.length - 1].t : null;
      return t0 == null ? null : { t0, t1: t1 == null ? t0 : t1, kind: 'life' };
    };
    const tradColor = (tr) => (/sith|dark|inquisit|nightsister/i.test(tr || '') ? this.pal().conflict : this.pal().accent);
    if (ov.kind === 'tree' || ov.kind === 'line') {
      const members = ov.kind === 'tree' ? ov.item.members.map((m) => m.p) : ov.item.persons;
      const idx = new Map(members.map((p, i) => [p.k, i]));
      members.forEach((p, i) => {
        const spans = [];
        const lf = life(p); if (lf) spans.push(lf);
        for (const e of p.masters || []) {
          if (!idx.has(e.mp.k) || e.t0 == null) continue;
          spans.push({ t0: e.t0, t1: e.t1 == null ? e.t0 + 1 : e.t1, kind: 'appr', color: tradColor(e.tradition), edge: e });
          links.push({ a: idx.get(e.mp.k), b: i, t: e.t0, color: tradColor(e.tradition), edge: e });
        }
        rows.push({ p, label: p.name, spans, marks: p.recs.filter((r) => !r.leg).map((r) => r.t) });
      });
      // a named line's own links: families join at the child's birth (or the year given)
      if (ov.kind === 'line') {
        for (const l of ov.item.links || []) {
          if (!idx.has(l.a) || !idx.has(l.b) || l.relation === 'master') continue;
          const child = members[idx.get(l.b)], lf = life(child);
          const t = l.t != null ? l.t : typeof l.y === 'number' ? l.y + 0.5 : lf ? lf.t0 : null;
          if (t != null) links.push({ a: idx.get(l.a), b: idx.get(l.b), t, color: this.pal().frameHi, rel: l.relation });
        }
      }
    } else if (ov.kind === 'office') {
      for (const h of ov.item.holders) {
        const t0 = h.t0, t1 = h.t1 == null ? t0 : h.t1;
        if (t0 == null) continue;
        rows.push({ p: h.p, label: h.p.name, spans: [{ t0, t1: Math.max(t1, t0 + 0.05), kind: 'hold', color: this.pal().frameHi, h }], marks: [] });
      }
    } else if (ov.kind === 'relic') {
      const a = ov.item;
      rows.push({ p: null, label: 'Seen on screen', spans: [], marks: a.srcRecs.map((r) => r.t), recs: a.srcRecs });
      for (const c of a.custody) {
        if (c.t0 == null) continue;
        rows.push({ p: c.p, label: c.p.name, spans: [{ t0: c.t0, t1: Math.max(c.t1 == null ? c.t0 : c.t1, c.t0 + 0.05), kind: 'hold', color: this.pal().frameHi, c }], marks: [] });
      }
    }
    return { ...ov, rows, links };
  }

  overlayGeo() {
    const top = this.lanesTop - 2, bot = this.h - this.axisH - 4;
    const n = Math.max(1, this.overlay.rows.length);
    const rowH = clamp((bot - top - 8) / n, 9, 28);
    return { top, bot, rowH, y: (i) => top + 6 + rowH * (i + 0.5) };
  }

  // ── hit testing ───────────────────────────────────────────────────
  pick(px, py) {
    if (px < this.px0 - 4 || px > this.px1 + 4) return null;
    const u = this.uAt(px);
    if (this.overlay) {
      const g = this.overlayGeo();
      if (py >= g.top && py <= g.bot) {
        const i = Math.floor((py - g.top - 6) / g.rowH);
        const row = this.overlay.rows[i];
        if (!row) return null;
        if (row.recs) {
          let best = null, bd = 8;
          for (const r of row.recs) { const d = Math.abs(this.X(r.u) - px); if (d < bd) { bd = d; best = r; } }
          return best ? { kind: 'r', item: best } : null;
        }
        const t = uToT(u), tol = this.yearsPerPx(u) * 8;
        const sp = row.spans.find((s) => t >= s.t0 - tol && t <= s.t1 + tol);
        return sp && row.p ? { kind: 'p', item: row.p, span: sp } : null;
      }
      return null;
    }
    const lane = this.laneAt(py);
    const near = (arr, tol) => {
      const du = tol / (this.pw * this.zt.k);
      let i = lowerBound(arr, u - du), best = null, bd = tol + 1;
      for (; i < arr.length && arr[i].u <= u + du; i++) {
        const d = Math.abs(this.X(arr[i].u) - px);
        if (d < bd) { bd = d; best = arr[i]; }
      }
      return best;
    };
    if (lane && !this.muted.has(lane.id)) {
      if (lane.id === 'HISTORY') { const e = near(this.S.events, 7); if (e) return { kind: 'e', item: e }; }
      else {
        if (lane.id === 'LEGENDS') { const e = near(this.S.levents, 6); if (e && Math.abs(py - (lane.yc + (e.row - 1) * lane.h * 0.26)) < 7) return { kind: 'e', item: e }; }
        const r = near(this.byLane.get(lane.id) || [], 7);
        if (r) return { kind: 'r', item: r };
      }
    }
    let best = null, bd = 7;
    for (const g of this.legs) {
      const geo = this.arcGeo(g);
      if (!geo) continue;
      for (let i = 0; i <= 28; i++) {
        const t = i / 28, a = (1 - t) * (1 - t), b = 2 * (1 - t) * t, c = t * t;
        const d = Math.hypot(a * geo.x0 + b * geo.cx + c * geo.x1 - px, a * geo.y0 + b * geo.cy + c * geo.y1 - py);
        if (d < bd) { bd = d; best = g; }
      }
    }
    return best ? { kind: 'v', item: best.v, leg: best } : null;
  }

  showTip(hit, px, py) {
    const tip = this.tip;
    if (!hit) { tip.classList.remove('on'); return; }
    const it = hit.item, S = this.S;
    let k, t, d;
    if (hit.kind === 'r') { k = it.s === 'FLM' ? 'Film' : `${S.series[it.s] || it.s}${it.n ? ' ' + it.n : ''}`; t = it.ti; d = it.tt; }
    else if (hit.kind === 'e') { k = it.leg ? 'Legends chronicle' : 'Chronicle'; t = it.title; d = it.tText || ''; }
    else if (hit.kind === 'v') { const g = hit.leg; k = 'Vision'; t = it.title; d = `${g.from.tText} → ${g.to.tText}`; }
    else if (hit.kind === 'p') { const sp = hit.span; k = sp.kind === 'appr' ? `Apprentice of ${sp.edge.mp.name}` : sp.kind === 'hold' ? (sp.c ? `Held by` : 'In office') : 'Life on record'; t = it.name; d = sp.kind === 'appr' ? `${sp.edge.from.tText || ''}${sp.edge.to && sp.edge.to.tText ? ' → ' + sp.edge.to.tText : ''}` : sp.h ? `${sp.h.from && sp.h.from.tText || ''}${sp.h.to && sp.h.to.tText ? ' → ' + sp.h.to.tText : ''}` : sp.c ? `${sp.c.from && sp.c.from.tText || ''}${sp.c.to && sp.c.to.tText ? ' → ' + sp.c.to.tText : ''}` : `${fmtTime(sp.t0)} → ${fmtTime(sp.t1)}`; }
    tip.innerHTML = `<div class="tk">${esc(k)}</div><div class="tt">${esc(t)}</div><div class="td">${esc(d)}</div>`;
    tip.classList.add('on');
    const tw = tip.offsetWidth, th = tip.offsetHeight;
    let x = px + 16, y = py + 14;
    if (x + tw > this.w - 6) x = px - tw - 14;
    if (y + th > this.h - 6) y = py - th - 12;
    tip.style.transform = `translate(${Math.max(4, x)}px, ${Math.max(4, y)}px)`;
  }

  // ── drawing ───────────────────────────────────────────────────────
  requestDraw() {
    if (this.raf) return;
    this.raf = requestAnimationFrame((now) => this.draw(now));
    clearTimeout(this.rafT);
    this.rafT = setTimeout(() => { if (this.raf) { cancelAnimationFrame(this.raf); this.raf = 0; this.draw(performance.now()); } }, 300);
  }

  alphaFor(laneId) {
    if (this.muted.has(laneId)) return 0.1;
    if (this.overlay) return 0.12;
    if (this.world) return 0.28;
    if (this.mode === 'anomalies') return laneId === 'HISTORY' ? 1 : 0.35;
    if (this.worlds.length) return 0.32;
    if (this.mode === 'visions') return 0.5;
    return 1;
  }

  draw(now) {
    this.raf = 0;
    clearTimeout(this.rafT);
    if (this.hold || this.mode === 'map') return;
    const { ctx, w, h, dpr } = this;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const P = this.pal();
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, P.bgTop); bg.addColorStop(1, P.bgBot);
    ctx.clearRect(0, 0, w, h);   // a skin may leave the stage translucent to show its own backdrop
    ctx.fillStyle = bg; ctx.fillRect(0, 0, w, h);
    if (this.reveal < 1) this.reveal = Math.min(1, Math.max(0, (performance.now() - this.revealStart) / 1300));
    const [ua, ub] = this.visibleU();
    ctx.save();
    ctx.beginPath(); ctx.rect(this.px0 - 3, 0, this.pw + 6, h); ctx.clip();
    if (this.reveal < 1) { ctx.beginPath(); ctx.rect(this.px0 - 3, 0, (this.pw + 6) * ease(this.reveal), h); ctx.clip(); }
    const layer = (name, fn) => {
      try { ctx.save(); fn(); } catch (err) { console.error(`field layer ${name}:`, err); } finally { ctx.restore(); ctx.globalAlpha = 1; ctx.setLineDash([]); }
    };
    layer('eras', () => this.drawEras());
    layer('lanes', () => this.drawLanes());
    layer('records', () => this.drawRecords(ua, ub));
    layer('events', () => this.drawEvents(ua, ub));
    layer('arcs', () => this.drawArcs(now));
    layer('worlds', () => this.drawWorlds());
    layer('labels', () => this.drawLabels(ua, ub));
    layer('overlay', () => this.drawOverlay());
    layer('vantage', () => this.drawVantage());
    layer('selection', () => this.drawSelection());
    layer('hover', () => this.drawHoverLine());
    ctx.restore();
    layer('axis', () => this.drawAxis());
    if (this.reveal < 1) this.requestDraw();
    else if (this.animating() && !this.flowTimer) this.flowTimer = setTimeout(() => { this.flowTimer = 0; this.requestDraw(); }, 40);
  }

  // an archive's vantage: the moment its record was compiled from (the skin names it; the Whills have none)
  drawVantage() {
    const v = this.vantage;
    if (!v || typeof v.t !== 'number') return;
    const x = Math.round(this.X(tToU(v.t))) + 0.5;
    if (x < this.px0 || x > this.px1) return;
    const ctx = this.ctx, P = this.pal(), bot = this.h - this.axisH;
    ctx.strokeStyle = P.frameHi; ctx.globalAlpha = 0.7; ctx.lineWidth = 1; ctx.setLineDash([7, 3, 1, 3]);
    ctx.beginPath(); ctx.moveTo(x, this.lanesTop); ctx.lineTo(x, bot); ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = this.F.small; ctx.textBaseline = 'middle';
    const w = this.textW(v.label, this.F.small), lx = x + 7 + w < this.px1 - 4 ? x + 7 : x - 7 - w;
    ctx.globalAlpha = 0.85; ctx.fillStyle = P.bgBot; ctx.fillRect(lx - 4, bot - 21, w + 8, 16);
    ctx.globalAlpha = 1; ctx.fillStyle = P.frameHi; ctx.fillText(v.label, lx, bot - 13);
  }

  animating() {
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
    return !!(this.sel && this.sel.kind === 'v');
  }

  drawEras() {
    const ctx = this.ctx, P = this.pal();
    const top = this.arcTop, bot = this.h - this.axisH;
    ctx.font = this.F.era; ctx.textBaseline = 'top';
    for (const s of SEGMENTS) {
      const x0 = this.X(s.u0), x1 = this.X(s.u1);
      if (x1 < this.px0 || x0 > this.px1) continue;
      if (s.u0 > 0) {
        ctx.strokeStyle = P.eraLine; ctx.lineWidth = 1; ctx.setLineDash([2, 5]);
        ctx.beginPath(); ctx.moveTo(Math.round(x0) + 0.5, top); ctx.lineTo(Math.round(x0) + 0.5, bot); ctx.stroke();
        ctx.setLineDash([]);
      }
      const vis0 = Math.max(x0, this.px0), vis1 = Math.min(x1, this.px1);
      if (vis1 - vis0 > 90) {
        ctx.fillStyle = P.eraText;
        const label = s.label.toUpperCase();
        const tw = this.textW(label, this.F.era);
        ctx.fillText(label, clamp(vis0 + 8, vis0 + 4, vis1 - tw - 6), top + 4);
      }
    }
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (const tk of this.ticksCache || []) {
      if (!tk.major || tk.boundary) continue;
      ctx.beginPath(); ctx.moveTo(Math.round(tk.x) + 0.5, this.lanesTop); ctx.lineTo(Math.round(tk.x) + 0.5, bot); ctx.stroke();
    }
  }

  drawLanes() {
    const ctx = this.ctx, P = this.pal();
    this.lanes.forEach((L, i) => {
      if (i % 2 === 0) { ctx.fillStyle = P.shelf; ctx.fillRect(this.px0, L.y0, this.pw, L.h); }
      ctx.fillStyle = P.shelfLine; ctx.fillRect(this.px0, Math.round(L.yc), this.pw, 1);
      const spans = this.spans.get(L.id) || [];
      const a = this.alphaFor(L.id);
      ctx.fillStyle = L.color; ctx.globalAlpha = 0.13 * a;
      const bh = Math.min(10, L.h * 0.5);
      for (const s of spans) {
        const x0 = this.X(s.u0) - 4, x1 = this.X(s.u1) + 4;
        if (x1 < this.px0 || x0 > this.px1) continue;
        roundRect(ctx, x0, L.yc - bh / 2, Math.max(8, x1 - x0), bh, bh / 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    });
  }

  tickW() { return clamp(2.2 + Math.log2(this.zt.k) * 0.45, 2.2, 7); }

  drawRecords(ua, ub) {
    const ctx = this.ctx, tw = this.tickW(), P = this.pal();
    const margin = 10 / (this.pw * this.zt.k);
    const wf = this.world, glow = this.zt.k > 40;
    for (const L of this.lanes) {
      if (L.id === 'HISTORY') continue;
      const arr = this.byLane.get(L.id) || [];
      const a = this.alphaFor(L.id);
      const th = Math.min(L.h * 0.62, 16);
      let i = lowerBound(arr, ua - margin);
      for (; i < arr.length && arr[i].u <= ub + margin; i++) {
        const r = arr[i];
        const x = this.X(r.u);
        const hit = wf && (r.pl || []).includes(wf.i);
        ctx.globalAlpha = hit ? 1 : a;
        if (glow && (a > 0.5 || hit)) { ctx.shadowColor = L.color; ctx.shadowBlur = hit ? 12 : 6; }
        ctx.fillStyle = hit ? P.locator : L.color;
        roundRect(ctx, x - tw / 2, L.yc - th / 2, tw, th, tw / 2); ctx.fill();
        ctx.shadowBlur = 0;
        if (r.k === 'film') { ctx.globalAlpha = a; ctx.strokeStyle = P.frameHi; ctx.lineWidth = 1; ctx.strokeRect(x - tw / 2 - 2, L.yc - th / 2 - 2, tw + 4, th + 4); }
      }
    }
    ctx.globalAlpha = 1;
  }

  drawEvents(ua, ub) {
    const ctx = this.ctx, P = this.pal();
    const margin = 10 / (this.pw * this.zt.k);
    const one = (L, list, color, legends) => {
      if (!L) return;
      const a = this.alphaFor(L.id);
      let i = lowerBound(list, ua - margin * 40);
      const rowOff = L.h * (legends ? 0.26 : 0.22);
      for (; i < list.length && list[i].u <= ub + margin; i++) {
        const e = list[i];
        const x = this.X(e.u), y = L.yc + (e.row - 1) * rowOff;
        const wf = this.world && (e.places || []).includes(this.world.k);
        const flag = e.conflict || (this.mode === 'anomalies' && e.filed);   // in contested mode, the register's entries light too
        let al = this.mode === 'anomalies' && !flag ? 0.25 : a;
        if (wf) al = 1;
        // a war or an age: a thin bar behind the diamond
        if (e.u2 != null && this.X(e.u2) - x > 6) {
          ctx.globalAlpha = al * 0.35; ctx.fillStyle = flag ? P.conflict : color;
          ctx.fillRect(x, y - 1, Math.min(this.X(e.u2), this.px1 + 5) - x, 2);
        }
        const s = e.w >= 3 ? 5.5 : e.w === 2 ? 4.2 : 3.2;
        ctx.globalAlpha = al;
        ctx.fillStyle = wf ? P.locator : flag ? P.conflict : color;
        ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s, y); ctx.closePath(); ctx.fill();
      }
    };
    one(this.laneMap.get('HISTORY'), this.S.events, P.event, false);
    if (this.S.legendsOn) one(this.laneMap.get('LEGENDS'), this.S.levents, P.legEvent, true);
    ctx.globalAlpha = 1;
  }

  arcGeo(g) {
    const x0 = this.X(g.u0), x1 = this.X(g.u1);
    if ((x0 < this.px0 - 50 && x1 < this.px0 - 50) || (x0 > this.px1 + 50 && x1 > this.px1 + 50)) return null;
    if (!this.laneMap.has(g.fromLane) || !this.laneMap.has(g.toLane)) {
      if (!this.laneMap.has('HISTORY')) return null;
    }
    const y0 = this.laneY(g.fromLane), y1 = this.laneY(g.toLane);
    const dt = Math.abs(g.to.t - g.from.t);
    const f = clamp(Math.log10(1 + dt) / 3.4, 0.12, 1);
    const topY = this.arcTop + 18;
    const apex = Math.min(y0, y1) - 10 - (Math.min(y0, y1) - 10 - topY) * f;
    return { x0, y0, x1, y1, cx: (x0 + x1) / 2, cy: 2 * apex - (y0 + y1) / 2, loop: Math.abs(x1 - x0) < 3 };
  }

  drawArcs(now) {
    if (this.overlay) return;
    const ctx = this.ctx, P = this.pal();
    const selV = this.sel && this.sel.kind === 'v' ? this.sel.item : null;
    const hovV = this.hover && this.hover.kind === 'v' ? this.hover.item : null;
    const selRec = this.sel && this.sel.kind === 'r' ? this.sel.item : null;
    const people = new Set(this.worlds.map((w) => w.p.k));
    let base = this.mode === 'visions' ? 0.7 : 0.16;
    if (this.worlds.length) base = 0.08;
    if (selV) base = 0.09; else if (selRec) base *= 0.55;
    for (const g of this.legs) {
      const geo = this.arcGeo(g);
      if (!geo) continue;
      const v = g.v;
      const mine = people.size && (v.experiencers || []).some((k) => people.has(k));
      const hot = v === selV || v === hovV || (selRec && v.srcRecs.includes(selRec)) || mine;
      ctx.globalAlpha = hot ? 1 : base;
      ctx.strokeStyle = v === selV ? P.locator : visionColor(v.kind);
      ctx.lineWidth = hot ? 2.2 : 1.2;
      if (v === selV && !matchMedia('(prefers-reduced-motion: reduce)').matches) { ctx.setLineDash([7, 6]); ctx.lineDashOffset = -(now / 45) % 13; }
      else ctx.setLineDash(v.kind === 'force-ghost' || v.kind === 'echo' ? [3, 4] : []);
      ctx.beginPath();
      if (geo.loop) ctx.arc(geo.x0, geo.y0 - 12, 9, 0, Math.PI * 2);
      else { ctx.moveTo(geo.x0, geo.y0); ctx.quadraticCurveTo(geo.cx, geo.cy, geo.x1, geo.y1); }
      ctx.stroke(); ctx.setLineDash([]);
      if (hot || this.mode === 'visions') {
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath(); ctx.arc(geo.x1, geo.y1, hot ? 4 : 2.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(geo.x0, geo.y0, hot ? 3.2 : 2, 0, Math.PI * 2); ctx.lineWidth = 1.5; ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  drawWorlds() {
    if (!this.worlds.length || this.overlay) return;
    const ctx = this.ctx, P = this.pal();
    for (const w of this.worlds) {
      const wl = this.S.worldline(w.p);
      if (!wl.length) continue;
      const pts = wl.map((pt) => ({ x: this.X(pt.u), y: this.laneMap.has(pt.l) ? this.laneY(pt.l) : this.laneY('HISTORY'), pt }));
      ctx.lineJoin = 'round';
      for (const pass of [[7, 0.14], [1.8, 0.95]]) {
        ctx.strokeStyle = w.color; ctx.lineWidth = pass[0];
        for (let i = 1; i < pts.length; i++) {
          const a = pts[i - 1], b = pts[i];
          if ((a.x < this.px0 - 400 && b.x < this.px0 - 400) || (a.x > this.px1 + 400 && b.x > this.px1 + 400)) continue;
          ctx.beginPath(); ctx.moveTo(a.x, a.y);
          if (b.pt.span || a.pt.span || b.pt.ghost) {
            if (pass[0] > 2) continue;
            ctx.globalAlpha = 0.8; ctx.lineWidth = 1.4; ctx.setLineDash([2, 4]);
            ctx.lineTo(b.x, b.y); ctx.stroke(); ctx.setLineDash([]); ctx.lineWidth = pass[0];
            continue;
          }
          ctx.globalAlpha = pass[1];
          ctx.lineTo(b.x, b.y); ctx.stroke();
        }
      }
      ctx.font = this.F.label; ctx.textBaseline = 'bottom';
      let lastMark = -1e9;
      for (const q of pts) {
        if (!q.pt.mark || q.x < this.px0 - 5 || q.x > this.px1 + 5) continue;
        ctx.globalAlpha = 1; ctx.fillStyle = P.calloutBg; ctx.strokeStyle = w.color; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(q.x, q.y - 5); ctx.lineTo(q.x + 5, q.y); ctx.lineTo(q.x, q.y + 5); ctx.lineTo(q.x - 5, q.y); ctx.closePath(); ctx.fill(); ctx.stroke();
        if (q.x - lastMark < 12) continue;
        const label = q.pt.mark, tw = this.textW(label, this.F.label);
        ctx.fillStyle = P.calloutBg; ctx.fillRect(q.x - 2, q.y - 23, tw + 6, 15);
        ctx.fillStyle = w.color; ctx.fillText(label, q.x + 1, q.y - 9);
        lastMark = q.x + tw;
      }
      for (const q of pts) {
        if (!q.pt.r || q.x < this.px0 - 5 || q.x > this.px1 + 5) continue;
        ctx.globalAlpha = 1;
        ctx.beginPath(); ctx.arc(q.x, q.y, 2.8, 0, Math.PI * 2);
        if (q.pt.ghost) { ctx.strokeStyle = w.color; ctx.lineWidth = 1.4; ctx.stroke(); } else { ctx.fillStyle = w.color; ctx.fill(); }
      }
      // appearances by hologram, voice or vision: hollow marks on the lane
      ctx.globalAlpha = 0.8; ctx.strokeStyle = w.color; ctx.lineWidth = 1.2;
      for (const r of w.p.remote) {
        if (r.leg && !this.S.legendsOn) continue;
        const x = this.X(r.u);
        if (x < this.px0 - 5 || x > this.px1 + 5 || !this.laneMap.has(r.l)) continue;
        ctx.beginPath(); ctx.arc(x, this.laneY(r.l), 3.4, 0, Math.PI * 2); ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;
  }

  textW(s, font) {
    const key = font + '|' + s;
    let w = this.tw.get(key);
    if (w == null) { this.ctx.font = font; w = this.ctx.measureText(s).width; this.tw.set(key, w); }
    return w;
  }
  fit(s, room, font) {
    let lo = 0, hi = s.length;
    while (lo < hi) { const m = (lo + hi + 1) >> 1; if (this.textW(s.slice(0, m) + '…', font) <= room) lo = m; else hi = m - 1; }
    return s.slice(0, lo) + '…';
  }

  drawLabels(ua, ub) {
    if (this.overlay) return;
    const ctx = this.ctx, tw = this.tickW(), P = this.pal();
    ctx.font = this.F.label; ctx.textBaseline = 'middle';
    const margin = 2 / (this.pw * this.zt.k);
    const yl = (t0, t1) => {
      const a = Math.floor(t0), b = Math.floor(t1);
      const f = (y) => (y < 0 ? `${-y} BBY` : `${y} ABY`);
      return a === b ? f(a) : a < 0 && b < 0 ? `${-a}–${-b} BBY` : a >= 0 && b >= 0 ? `${a}–${b} ABY` : `${f(a)} – ${f(b)}`;
    };
    for (const L of this.lanes) {
      if (L.id === 'HISTORY' || this.muted.has(L.id)) continue;
      const arr = this.byLane.get(L.id) || [];
      let i = lowerBound(arr, ua - margin);
      const end = lowerBound(arr, ub + margin);
      ctx.globalAlpha = this.worlds.length || this.world ? 0.4 : 0.92;
      const spans = this.spans.get(L.id) || [];
      const dense = spans.some((sp) => sp.n > 1 && (this.X(sp.u1) - this.X(sp.u0)) / (sp.n - 1) < 16);
      if (dense || end - i > 90) {
        const vis = spans.filter((sp) => this.X(sp.u1) >= this.px0 - 4 && this.X(sp.u0) <= this.px1 + 4);
        vis.forEach((sp, j) => {
          const x = this.X(sp.u1) + tw / 2 + 7;
          const nx = j + 1 < vis.length ? this.X(vis[j + 1].u0) - 6 : this.px1;
          let label;
          if (sp.n === 1) { const r = arr.find((q) => q.u >= sp.u0 && q.u <= sp.u1); label = r ? r.sh || r.ti : ''; }
          else label = yl(sp.t0, sp.t1);
          const w = this.textW(label, this.F.label);
          if (nx - x > w + 4) { ctx.fillStyle = sp.n === 1 ? P.label : L.color; ctx.fillText(label, x, L.yc + 0.5); }
        });
        continue;
      }
      for (; i < end; i++) {
        const r = arr[i];
        const x = this.X(r.u) + tw / 2 + 4;
        const nx = i + 1 < arr.length ? this.X(arr[i + 1].u) - tw : this.px1;
        const room = nx - x - 6;
        if (room < 26) continue;
        let label = r.ti, w = this.textW(label, this.F.label);
        if (w > room && r.sh) { label = r.sh; w = this.textW(label, this.F.label); }
        ctx.fillStyle = P.label;
        if (w <= room) ctx.fillText(label, x, L.yc + 0.5);
        else if (room > 44) ctx.fillText(this.fit(label, room, this.F.label), x, L.yc + 0.5);
      }
    }
    // chronicle labels: landmarks first, two rows above and below the line
    const labelEvents = (L, list, color, colorMinor) => {
      if (!L || this.muted.has(L.id)) return;
      const vis = [];
      let i = lowerBound(list, ua - margin);
      for (; i < list.length && list[i].u <= ub + margin; i++) vis.push(list[i]);
      vis.sort((a, b) => b.w - a.w || a.u - b.u);
      const rows = [[], []];
      const rowOff = L.h * 0.22;
      ctx.font = this.F.small;
      ctx.globalAlpha = this.worlds.length || this.world ? 0.45 : 1;
      let placed = 0;
      for (const e of vis) {
        if (placed > 60) break;
        const x = this.X(e.u) + 7, label = e.title, w = this.textW(label, this.F.small);
        const r = e.row === 0 ? 0 : e.row === 2 ? 1 : (rows[0].length <= rows[1].length ? 0 : 1);
        const tryRow = (ri) => rows[ri].every(([a, b]) => x + w + 8 < a || x > b + 8);
        const ri = tryRow(r) ? r : tryRow(1 - r) ? 1 - r : -1;
        if (ri < 0 || x + w > this.px1) continue;
        rows[ri].push([x, x + w]); placed++;
        ctx.fillStyle = e.w >= 3 ? color : colorMinor;
        ctx.fillText(label, x, L.yc + (ri === 0 ? -rowOff - 8 : rowOff + 8));
      }
    };
    labelEvents(this.laneMap.get('HISTORY'), this.S.events, P.event, P.eventText);
    if (this.S.legendsOn) labelEvents(this.laneMap.get('LEGENDS'), this.S.levents, P.legEvent, P.legEvent);
    ctx.globalAlpha = 1;
  }

  drawOverlay() {
    const ov = this.overlay;
    if (!ov) return;
    const ctx = this.ctx, P = this.pal(), g = this.overlayGeo();
    ctx.globalAlpha = 0.9; ctx.fillStyle = P.bgBot; ctx.fillRect(this.px0 - 3, g.top, this.pw + 6, g.bot - g.top);
    ctx.globalAlpha = 1;
    const X = (t) => this.X(tToU(t));
    // connectors: master → apprentice at the start of the apprenticeship
    for (const l of ov.links) {
      const x = X(l.t), ya = g.y(l.a), yb = g.y(l.b);
      ctx.strokeStyle = l.color; ctx.globalAlpha = 0.55; ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, ya); ctx.bezierCurveTo(x - 10, (ya + yb) / 2, x - 10, (ya + yb) / 2, x, yb); ctx.stroke();
      ctx.globalAlpha = 1; ctx.fillStyle = l.color;
      ctx.beginPath(); ctx.arc(x, ya, 2.4, 0, Math.PI * 2); ctx.fill();
    }
    const selP = this.sel && this.sel.kind === 'p' ? this.sel.item : null;
    ov.rows.forEach((row, i) => {
      const y = g.y(i), hot = selP && row.p === selP || (this.hover && this.hover.kind === 'p' && this.hover.item === row.p);
      // marks: every record the person (or relic) is seen in
      ctx.fillStyle = row.recs ? P.accent : P.labelDim; ctx.globalAlpha = row.recs ? 0.95 : 0.5;
      for (const t of row.marks) { const x = X(t); if (x < this.px0 - 3 || x > this.px1 + 3) continue; ctx.fillRect(x - (row.recs ? 1.5 : 0.5), y - (row.recs ? 5 : 3), row.recs ? 3 : 1, row.recs ? 10 : 6); }
      let firstX = null;
      for (const s of row.spans) {
        const x0 = X(s.t0), x1 = Math.max(X(s.t1), x0 + 3);
        if (x1 < this.px0 - 5 || x0 > this.px1 + 5) continue;
        if (s.kind === 'life') { ctx.globalAlpha = hot ? 0.9 : 0.55; ctx.strokeStyle = P.dim; ctx.lineWidth = 1; ctx.setLineDash([2, 3]); ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); ctx.setLineDash([]); }
        else {
          ctx.globalAlpha = hot ? 1 : 0.85; ctx.fillStyle = s.color;
          const hh = Math.min(g.rowH * 0.46, 9);
          roundRect(ctx, x0, y - hh / 2, x1 - x0, hh, 2); ctx.fill();
        }
        firstX = firstX == null ? x0 : Math.min(firstX, x0);
      }
      ctx.globalAlpha = 1; ctx.font = this.F.row; ctx.textBaseline = 'middle';
      const label = row.label, w = this.textW(label, this.F.row);
      let lx = firstX == null ? this.px0 + 6 : firstX - w - 8;
      if (lx < this.px0 + 4) lx = this.px0 + 4;
      ctx.fillStyle = P.calloutBg; ctx.globalAlpha = 0.75; ctx.fillRect(lx - 3, y - 8, w + 6, 16);
      ctx.globalAlpha = 1; ctx.fillStyle = hot ? P.locator : row.recs ? P.accent : P.label;
      ctx.fillText(label, lx, y + 0.5);
    });
  }

  itemPos(sel) {
    const it = sel.item;
    if (sel.kind === 'r') return this.laneMap.has(it.l) ? { x: this.X(it.u), y: this.laneY(it.l) } : null;
    if (sel.kind === 'e') {
      const L = this.laneMap.get(it.leg ? 'LEGENDS' : 'HISTORY');
      return L ? { x: this.X(it.u), y: L.yc + (it.row - 1) * L.h * (it.leg ? 0.26 : 0.22) } : null;
    }
    return null;
  }

  drawSelection() {
    if (!this.sel || this.overlay) return;
    const pos = this.itemPos(this.sel);
    if (!pos) return;
    const ctx = this.ctx, P = this.pal();
    ctx.strokeStyle = P.locator; ctx.globalAlpha = 0.85; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(Math.round(pos.x) + 0.5, this.arcTop + 18); ctx.lineTo(Math.round(pos.x) + 0.5, this.h - this.axisH); ctx.stroke();
    ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.shadowColor = P.locator; ctx.shadowBlur = 10;
    ctx.beginPath(); ctx.arc(pos.x, pos.y, 8, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    const it = this.sel.item;
    const label = this.sel.kind === 'r' ? it.ti : it.title;
    ctx.font = this.F.label; ctx.textBaseline = 'middle';
    const w = this.textW(label, this.F.label);
    let lx = pos.x + 13;
    if (lx + w + 10 > this.px1) lx = pos.x - 13 - w - 8;
    const ly = pos.y - 17;
    ctx.fillStyle = P.calloutBg; ctx.fillRect(lx - 4, ly - 9, w + 12, 18);
    ctx.fillStyle = P.locator; ctx.fillRect(lx - 4, ly - 9, 2, 18);
    ctx.fillText(label, lx + 3, ly + 0.5);
  }

  drawHoverLine() {
    if (this.hoverX == null) return;
    const ctx = this.ctx, P = this.pal();
    ctx.strokeStyle = P.locator; ctx.globalAlpha = 0.4; ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(Math.round(this.hoverX) + 0.5, this.lanesTop - 6); ctx.lineTo(Math.round(this.hoverX) + 0.5, this.h - this.axisH); ctx.stroke();
    ctx.setLineDash([]); ctx.globalAlpha = 1;
    if (this.hover && (this.hover.kind === 'r' || this.hover.kind === 'e')) {
      const pos = this.itemPos(this.hover);
      if (pos) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2); ctx.stroke(); }
    }
  }

  drawAxis() {
    const ctx = this.ctx, P = this.pal(), y = this.h - this.axisH;
    ctx.fillStyle = P.bgBot; ctx.fillRect(0, y, this.w, this.axisH);
    ctx.fillStyle = P.axisLine; ctx.fillRect(this.px0, y + 1, this.pw, 1);
    const tk = ticks((u) => this.X(u), this.px0, this.px1, this.narrow ? 60 : 78);
    this.ticksCache = tk;
    ctx.font = this.F.axis; ctx.textBaseline = 'top';
    let lastEnd = -1e9;
    for (const t of tk) {
      if (t.x < this.px0 - 1 || t.x > this.px1 + 1) continue;
      if (t.boundary) {
        ctx.fillStyle = P.axisMajor;
        ctx.beginPath(); ctx.moveTo(t.x, y - 3); ctx.lineTo(t.x + 4, y + 1); ctx.lineTo(t.x, y + 5); ctx.lineTo(t.x - 4, y + 1); ctx.closePath(); ctx.fill();
        const label = t.seg && t.seg.u0 > 0 ? boundaryLabel(t.seg) : null;
        if (label) {
          const w = this.textW(label, this.F.axis), lx = t.x - w / 2;
          if (lx > lastEnd + 8 && lx > this.px0 - 2 && lx + w < this.px1 + 2) { ctx.fillStyle = P.axisText; ctx.fillText(label, lx, y + 12); lastEnd = lx + w; }
        }
        continue;
      }
      ctx.fillStyle = t.major ? P.axisMajor : P.axisTick;
      ctx.fillRect(Math.round(t.x), y + 2, 1, t.major ? 7 : 4);
      if (!t.label) continue;
      const w = this.textW(t.label, this.F.axis), lx = t.x - w / 2;
      if (lx < lastEnd + 8 || lx < this.px0 - 2 || lx + w > this.px1 + 2) continue;
      ctx.fillStyle = t.major ? P.axisText : P.axisDim;
      ctx.fillText(t.label, lx, y + 12);
      lastEnd = lx + w;
    }
  }
}

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

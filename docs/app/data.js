// Loads the archive and builds every index and derived structure the console needs.
import { tToU } from './scale.js';

export const VISION_KINDS = {
  wbw: { label: 'World Between Worlds', chip: 'WBW' },
  mortis: { label: 'Mortis', chip: 'MORTIS' },
  vision: { label: 'Force vision', chip: 'VISION' },
  prophecy: { label: 'Prophecy', chip: 'PROPHECY' },
  'force-ghost': { label: 'Force spirit', chip: 'SPIRIT' },
  echo: { label: 'Message across years', chip: 'ECHO' },
  return: { label: 'Return from death', chip: 'RETURN' },
};

// ── skin tokens: every colour the canvases use comes from the active skin's CSS ──
let css = null;
const cache = new Map();
export function token(name, fallback = '#999') {
  if (cache.has(name)) return cache.get(name);
  css = css || getComputedStyle(document.documentElement);
  const v = css.getPropertyValue(name).trim() || fallback;
  cache.set(name, v);
  return v;
}
export function resetTokens() { css = null; cache.clear(); }
export const laneColor = (tok) => token(`--l-${tok}`, '#9aa');
export const visionColor = (kind) => token(`--v-${kind}`, '#9fb6ff');

export const norm = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[’'`]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();

export async function loadArchive() {
  const res = await fetch('data/archive.json', { cache: 'no-cache' });
  if (!res.ok) throw new Error(`archive.json: HTTP ${res.status}`);
  const A = await res.json();
  const S = {
    meta: A.meta, series: A.series, lanes: A.lanes, laneById: new Map(),
    records: A.records, recById: new Map(), recByWp: new Map(),
    people: A.people, personByKey: new Map(), places: A.places, placeByKey: new Map(), routes: A.routes || [],
    events: [], levents: [], evById: new Map(), visions: [], visById: new Map(),
    lineages: A.lineages || {}, lines: [], lineById: new Map(), offices: [], officeById: new Map(),
    artifacts: [], artById: new Map(), anomalies: [], anById: new Map(), personnel: A.personnel || [],
    recLinks: new Map(), legendsOn: false,
  };
  S.lanes.forEach((l, i) => { l.i = i; S.laneById.set(l.id, l); });
  S.recolor = () => { for (const l of S.lanes) l.color = laneColor(l.tok); };
  S.recolor();

  // people
  S.people.forEach((p, i) => { p.$ = 'p'; p.i = i; p.name = p.k; p.recs = []; p.remote = []; p.flash = []; S.personByKey.set(p.k, p); });
  const person = (k) => {
    if (!k) return null;
    let p = S.personByKey.get(k);
    if (!p) { p = { $: 'p', k, n: 0, i: S.people.length, name: k, recs: [], remote: [], flash: [] }; S.people.push(p); S.personByKey.set(k, p); }
    return p;
  };
  S.person = person;

  // worlds
  S.places.forEach((w, i) => { w.$ = 'w'; w.i = i; w.recs = []; w.events = []; S.placeByKey.set(w.k, w); });

  // records
  S.records.forEach((r, i) => {
    r.i = i; r.$ = 'r'; r.u = tToU(r.t);
    r.lane = S.laneById.get(r.l) || S.laneById.get('FILM');
    S.recById.set(r.id, r); S.recByWp.set(r.wp, r);
    for (const ci of r.c) S.people[ci].recs.push(r);
    for (const ci of r.cr || []) S.people[ci].remote.push(r);
    for (const ci of r.cf || []) S.people[ci].flash.push(r);
    for (const pi of r.pl || []) S.places[pi].recs.push(r);
  });
  const link = (r, kind, item) => {
    if (!r) return;
    if (!S.recLinks.has(r.id)) S.recLinks.set(r.id, []);
    S.recLinks.get(r.id).push({ kind, item });
  };
  const recs = (ids) => (ids || []).map((id) => S.recById.get(id)).filter(Boolean);

  // dossiers
  for (const d of S.personnel) {
    if (!d || !d.wp) continue;
    const p = person(d.wp);
    p.dossier = d;
    if (d.name) p.name = d.name;
  }

  // chronicle (canon) and the Legends chronicle
  const prepEvent = (e, legends) => {
    e.$ = 'e'; e.u = tToU(e.t); e.u2 = typeof e.t2 === 'number' ? tToU(e.t2) : null; e.w = e.weight || 1;
    e.leg = legends ? 1 : 0; e.srcRecs = recs(e.recs);
    e.srcRecs.forEach((r) => link(r, 'e', e));
    for (const k of e.places || []) { const w = S.placeByKey.get(k); if (w) w.events.push(e); }
    S.evById.set(e.id, e);
    return e;
  };
  S.events = (A.events || []).filter((e) => e && typeof e.t === 'number').map((e) => prepEvent(e, false)).sort((a, b) => a.t - b.t);
  S.levents = (A.levents || []).filter((e) => e && typeof e.t === 'number').map((e) => prepEvent(e, true)).sort((a, b) => a.t - b.t);
  let flip = 0;
  for (const e of S.events) e.row = e.w >= 3 ? 1 : (flip++ % 2 ? 0 : 2);
  flip = 0;
  for (const e of S.levents) e.row = e.w >= 3 ? 1 : (flip++ % 2 ? 0 : 2);

  // visions & crossings: each leg runs from the moment of the experience to the moment it reaches
  const laneNear = (t, keys, prefer) => {
    if (prefer && Math.abs(prefer.t - t) < 1.2) return prefer.l;
    let best = null, bd = 1.6;
    for (const k of keys) {
      const p = S.personByKey.get(k);
      if (!p) continue;
      for (const r of p.recs) {
        if (r.leg) continue;
        const d = Math.abs(r.t - t);
        if (d < bd) { bd = d; best = r.l; }
      }
    }
    return best || 'HISTORY';
  };
  for (const v of A.visions || []) {
    if (!v || !Array.isArray(v.legs) || !v.legs.length) continue;
    v.$ = 'v'; v.srcRecs = recs(v.recs);
    const home = v.srcRecs[0] || null;
    const who = [...(v.experiencers || []), ...(v.reached || [])];
    for (const g of v.legs) {
      g.fromLane = laneNear(g.from.t, v.experiencers || [], home);
      g.toLane = laneNear(g.to.t, who, null);
      g.u0 = tToU(g.from.t); g.u1 = tToU(g.to.t); g.v = v;
    }
    v.t = v.legs[0].from.t; v.u = tToU(v.t);
    S.visions.push(v); S.visById.set(v.id, v);
    v.srcRecs.forEach((r) => link(r, 'v', v));
    for (const k of v.experiencers || []) (person(k).visions = person(k).visions || []).push(v);
  }
  S.visions.sort((a, b) => a.t - b.t);

  // lineages: apprenticeships (edges), named lines, offices (successions)
  const L = S.lineages;
  const edges = (L.apprenticeships || []).filter((e) => e && e.master && e.apprentice);
  for (const e of edges) {
    e.$ = 'ap';
    e.mp = person(e.master); e.ap = person(e.apprentice);
    (e.mp.apprentices = e.mp.apprentices || []).push(e);
    (e.ap.masters = e.ap.masters || []).push(e);
    e.t0 = e.from && typeof e.from.t === 'number' ? e.from.t : null;
    e.t1 = e.to && typeof e.to.t === 'number' ? e.to.t : null;
  }
  S.edges = edges;
  for (const ln of L.lines || []) {
    if (!ln || !ln.id) continue;
    ln.$ = 'ln';
    ln.persons = (ln.members || []).map(person);
    for (const l of ln.links || []) { l.a = l.a && person(l.a).k; l.b = l.b && person(l.b).k; }
    S.lines.push(ln); S.lineById.set(ln.id, ln);
  }
  // every tradition's apprenticeship graph also yields trees rooted at masters nobody trained (on record)
  const roots = new Map();
  for (const e of edges) {
    let r = e.mp, guard = 0;
    while (r.masters && r.masters.length && guard++ < 40) r = r.masters[0].mp;
    roots.set(r.k, r);
  }
  S.trees = [...roots.values()].map((root) => {
    const members = [], seen = new Set();
    const walk = (p, depth) => {
      if (seen.has(p.k)) return;
      seen.add(p.k); members.push({ p, depth });
      const kids = (p.apprentices || []).slice().sort((a, b) => (a.t0 ?? 1e9) - (b.t0 ?? 1e9));
      for (const e of kids) walk(e.ap, depth + 1);
    };
    walk(root, 0);
    const tr = (root.apprentices || [])[0];
    return { $: 'tree', id: `tree-${root.k}`, root, members, tradition: tr ? tr.tradition : '', size: members.length };
  }).filter((t) => t.size > 1).sort((a, b) => b.size - a.size);
  S.treeById = new Map(S.trees.map((t) => [t.id, t]));
  for (const o of L.offices || []) {
    if (!o || !o.id) continue;
    o.$ = 'of';
    o.holders = (o.holders || []).filter((h) => h && h.who).map((h) => {
      h.p = person(h.who);
      h.t0 = h.from && typeof h.from.t === 'number' ? h.from.t : null;
      h.t1 = h.to && typeof h.to.t === 'number' ? h.to.t : null;
      (h.p.offices = h.p.offices || []).push({ o, h });
      return h;
    }).sort((a, b) => (a.t0 ?? 1e9) - (b.t0 ?? 1e9));
    S.offices.push(o); S.officeById.set(o.id, o);
  }

  // relics: chains of custody
  for (const a of A.artifacts || []) {
    if (!a || !a.id) continue;
    a.$ = 'a'; a.srcRecs = recs(a.recs);
    a.custody = (a.custody || []).filter((c) => c && c.holder).map((c) => {
      c.p = person(c.holder);
      c.t0 = c.from && typeof c.from.t === 'number' ? c.from.t : null;
      c.t1 = c.to && typeof c.to.t === 'number' ? c.to.t : null;
      c.recObj = c.rec ? S.recById.get(c.rec) : null;
      (c.p.relics = c.p.relics || []).push(a);
      return c;
    }).sort((x, y) => (x.t0 ?? 1e9) - (y.t0 ?? 1e9));
    const ts = a.custody.flatMap((c) => [c.t0, c.t1]).filter((t) => t != null);
    a.t = ts.length ? Math.min(...ts) : a.made && typeof a.made.t === 'number' ? a.made.t : 0;
    a.tEnd = ts.length ? Math.max(...ts) : a.t;
    a.srcRecs.forEach((r) => link(r, 'a', a));
    S.artifacts.push(a); S.artById.set(a.id, a);
  }
  S.artifacts.sort((x, y) => x.t - y.t);

  // contested records
  for (const x of A.anomalies || []) {
    if (!x || !x.id) continue;
    x.$ = 'x'; x.srcRecs = recs(x.recs);
    if (typeof x.t !== 'number') x.t = x.srcRecs[0] ? x.srcRecs[0].t : 0;
    x.u = tToU(x.t);
    x.srcRecs.forEach((r) => link(r, 'x', x));
    S.anomalies.push(x); S.anById.set(x.id, x);
  }
  S.anomalies.sort((a, b) => a.t - b.t);

  for (const p of S.people) { p.recs.sort((a, b) => a.t - b.t); p.remote.sort((a, b) => a.t - b.t); }

  // per-series release order for "previous / next episode"
  const bySeries = new Map();
  for (const r of S.records) {
    if (!bySeries.has(r.s)) bySeries.set(r.s, []);
    bySeries.get(r.s).push(r);
  }
  for (const arr of bySeries.values()) {
    arr.sort((a, b) => (a.ad || '').localeCompare(b.ad || '') || String(a.n || '').localeCompare(String(b.n || ''), 'en', { numeric: true }));
    arr.forEach((r, i) => { r.prevAir = arr[i - 1] || null; r.nextAir = arr[i + 1] || null; });
  }
  S.bySeries = bySeries;

  S.setLegends = (on) => { S.legendsOn = !!on; rebuildChron(S); for (const p of S.people) p._wl = null; };
  rebuildChron(S);
  S.worldline = (p) => worldline(S, p);
  return S;
}

// one chronology to step through with the arrow keys (Legends joins it only when the layer is on)
function rebuildChron(S) {
  S.chron = [...S.records.filter((r) => S.legendsOn || !r.leg), ...S.events, ...(S.legendsOn ? S.levents : [])].sort((a, b) => a.t - b.t);
  S.chron.forEach((x, i) => { x.ci = i; });
}

// ── worldlines ──────────────────────────────────────────────────────
// A life through the records in in-universe order. Birth and death from the archive file bracket it
// as dotted spans; appearances after death (a Force spirit) are drawn hollow.
function worldline(S, p) {
  if (p._wl) return p._wl;
  const d = p.dossier || {};
  const died = d.died && typeof d.died.t === 'number' ? d.died.t : null;
  const born = d.born && typeof d.born.t === 'number' ? d.born.t : null;
  const pts = [];
  const own = p.recs.filter((r) => S.legendsOn || !r.leg);
  if (born != null && (!own.length || born < own[0].t - 0.3)) pts.push({ t: born, l: 'HISTORY', r: null, mark: 'Born', span: true });
  for (const r of own) pts.push({ t: r.t, l: r.l, r, ghost: died != null && r.t > died + 0.05 && !r.leg });
  if (died != null) {
    const lastLiving = pts.filter((q) => !q.ghost).pop();
    pts.push({ t: died, l: lastLiving && lastLiving.r ? lastLiving.l : 'HISTORY', r: null, mark: 'Dies', span: !lastLiving || died - lastLiving.t > 0.3 });
  }
  pts.sort((a, b) => a.t - b.t);
  for (const q of pts) q.u = tToU(q.t);
  p._wl = pts;
  return pts;
}

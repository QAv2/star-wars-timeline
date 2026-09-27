// Boot, routing and wiring. The archive's identity (skin) is chosen before first paint in index.html;
// here its vocabulary, gate and voice are applied, and it can be swapped at run time.
import { loadArchive, resetTokens } from './data.js';
import { Field } from './field.js';
import { Ribbon } from './ribbon.js';
import { Readout } from './readout.js';
import { Search } from './search.js';
import { GalaxyMap } from './map.js';
import { fmtTime, eraLabel, uToT, tToU } from './scale.js';
import { chirp, audioOn, setAudio, setVoices } from './audio.js';
import { SKINS, loadSkin } from '../skins/registry.js';

const $ = (s) => document.querySelector(s);
const MODES = ['continuum', 'visions', 'lineages', 'relics', 'personnel', 'map', 'records', 'anomalies', 'about'];
const HOME = [-34, 37];
const state = { mode: 'continuum', sel: null, route: null };
let skin = null;

// how many years to show around a moment so that its neighbours separate
function spanFor(t) {
  if (t >= -22 && t < -19) return 0.5;
  if (t >= -19 && t < 0) return 1.2;
  if (t >= 0 && t < 36) return 1.4;
  if (t >= -500 && t < -22) return 12;
  if (t >= -1100) return 80;
  return Math.max(400, Math.abs(t) * 0.15);
}
function spanForRec(r) {
  const S = window.__S;
  const near = S ? S.records.filter((x) => x.l === r.l && Math.abs(x.t - r.t) < 0.5).length : 1;
  if (near > 30) return 0.08;
  if (near > 14) return 0.2;
  if (near > 6) return 0.45;
  return Math.min(spanFor(r.t), 2);
}

// the moment an archive's record was compiled from, if its skin names one (by chronicle entry or year)
function vantageOf(s, S) {
  const v = s && s.vantage;
  if (!v) return null;
  const e = v.event && S.evById.get(v.event);
  return { t: e ? e.t : v.t, label: v.label };
}

// the canvases draw in the skin's faces, which the page may not have asked for yet
function skinFonts() {
  if (!document.fonts) return Promise.resolve();
  const cs = getComputedStyle(document.documentElement);
  const loads = ['--font-ui', '--font-display'].map((k) => cs.getPropertyValue(k).trim()).filter(Boolean)
    .flatMap((f) => ['500 12px', '600 12px'].map((w) => document.fonts.load(`${w} ${f}`).catch(() => null)));
  return Promise.race([Promise.all(loads), new Promise((r) => setTimeout(r, 1500))]);
}

function applySkin(s) {
  skin = s;
  setVoices(s);
  document.title = s.title;
  const tc = document.querySelector('meta[name="theme-color"]');
  if (tc) tc.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim() || '#070b14');
  const W = s.words;
  $('#brand-name').textContent = s.name;
  $('#brand-glyph').textContent = s.glyph;
  $('#brand-org').textContent = s.org;
  $('#q').placeholder = W.search;
  document.querySelectorAll('.navbtn[data-mode]').forEach((b) => { const l = W[b.dataset.mode]; if (l) b.querySelector('.lab').textContent = l; });
  const g = document.getElementById('gate');
  if (g) {
    $('#gate-hit').innerHTML = s.gate.art;
    $('#gate-title').textContent = s.name;
    $('#gate-glyph').textContent = s.glyph;
    $('#gate-sub').textContent = s.gate.sub;
    $('#gate-quote').innerHTML = `“${s.gate.quote}”<cite>${s.gate.cite}</cite>`;
    $('#gate-go').textContent = s.gate.go;
  }
}

const gate = {
  el: () => document.getElementById('gate'),
  stage(n, text) {
    document.querySelectorAll('.gate-bar span').forEach((b, i) => b.classList.toggle('on', i < n));
    const st = document.getElementById('gate-status');
    if (st) st.textContent = text;
  },
  ready(onEnter) {
    const el = this.el(), go = document.getElementById('gate-go');
    if (!el) { onEnter(); return; }
    el.classList.add('ready');
    go.disabled = false;
    go.focus({ preventScroll: true });
    let done = false;
    const onKey = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); enter(); } };
    const enter = () => {
      if (done) return;
      done = true;
      document.removeEventListener('keydown', onKey);
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      el.classList.add('opening');
      setTimeout(() => {
        el.classList.add('leaving');
        document.body.classList.remove('gating');
        setTimeout(() => el.remove(), 650);
        onEnter();
      }, reduce ? 0 : skin.gate.openMs);
    };
    go.addEventListener('click', enter);
    document.getElementById('gate-hit').addEventListener('click', enter);
    document.addEventListener('keydown', onKey);
  },
  fail(msg) { const el = this.el(); if (!el) return; el.classList.add('error'); this.stage(0, msg); },
};

async function boot() {
  applySkin(await loadSkin(document.documentElement.dataset.skin || 'jedi'));
  const steps = skin.gate.steps;
  const say = (i, S) => gate.stage(i + 1, typeof steps[i] === 'function' ? steps[i](S) : steps[i]);
  say(0);
  const rbody = $('#rbody');
  let S;
  try {
    S = await loadArchive();
  } catch (err) {
    gate.fail(skin.gate.fail);
    $('#rk').textContent = 'Archive offline';
    rbody.innerHTML = `<p class="lead">The archive data didn't load (${String(err.message || err)}). Reload the page; if you opened the file from disk, serve the folder over HTTP instead.</p>`;
    return;
  }
  window.__S = S;
  let legendsOn = false;
  try { legendsOn = localStorage.getItem('swt-legends') === 'on'; } catch (_) { /* storage blocked */ }
  if (new URLSearchParams(location.search).get('legends') === '1') legendsOn = true;
  S.setLegends(legendsOn);
  say(1, S);
  await skinFonts();
  await Promise.race([document.fonts && document.fonts.ready, new Promise((r) => setTimeout(r, 1500))]);

  let listTimer = 0;
  const field = new Field({
    stage: $('#stage'), canvas: $('#field'), labels: $('#lanelabels'), tip: $('#tip'), store: S,
    hooks: {
      onView(ended) {
        ribbon && ribbon.draw();
        updateStatus();
        if (state.mode === 'map') { map && map.refresh(); return; }
        if (ended && state.mode === 'continuum' && !state.sel && !state.route) {
          clearTimeout(listTimer);
          listTimer = setTimeout(() => { if (state.mode === 'continuum' && !state.sel && !state.route) readout.inView(field.inView()); }, 140);
        }
      },
      onHover(t, res) { updateStatus(t, res); },
      onPick(hit) {
        if (hit) {
          const it = hit.item;
          go(hit.kind === 'r' ? `#/r/${enc(it.id)}` : hit.kind === 'e' ? `#/e/${enc(it.id)}` : hit.kind === 'v' ? `#/v/${enc(it.id)}` : hit.kind === 'p' ? `#/p/${enc(it.k)}` : '#/continuum');
        } else if (state.sel) go(`#/${state.mode}`);
      },
    },
  });
  field.hold = !!document.getElementById('gate');
  field.setVantage(vantageOf(skin, S));
  say(2, S);
  const ribbon = new Ribbon($('#ribbon'), S, field);
  const readout = new Readout({ store: S, head: $('#rk'), tools: $('#rtools'), body: rbody, field, skin });
  readout.onFit = () => fitCurrent();
  readout.onWorldStacks = (k) => go(`#/ws/${enc(k)}`);
  const search = new Search({ input: $('#q'), results: $('#results'), store: S, go });
  const map = new GalaxyMap({ canvas: $('#map'), tip: $('#tip'), store: S, field, hooks: { onPick(hit) { if (hit) go(`#/w/${enc(hit.item.k)}`); } } });
  say(3, S);

  function counts() {
    const c = { visions: S.visions.length, lineages: S.trees.length + S.lines.length + S.offices.length, relics: S.artifacts.length,
      personnel: S.people.filter((p) => p.dossier).length || '', map: S.places.filter((w) => w.g).length,
      records: S.records.filter((r) => S.legendsOn || !r.leg).length, anomalies: S.anomalies.length + S.flagged().length };
    document.querySelectorAll('.navbtn[data-mode]').forEach((b) => { b.querySelector('.num').textContent = c[b.dataset.mode] || ''; });
  }
  counts();

  function enc(s) { return encodeURIComponent(s); }
  function updateStatus(t, res) {
    const [a, b] = field.visibleU();
    const center = uToT((a + b) / 2);
    if (t == null) { t = center; res = field.yearsPerPx((a + b) / 2); }
    $('#s-coord').textContent = fmtTime(t, res);
    $('#s-era').textContent = eraLabel(t);
  }
  function updateCount() {
    if (state.mode === 'map') { $('#s-view').textContent = `${map.lit.size} worlds active`; return; }
    const items = field.inView();
    const r = items.filter((x) => x.$ === 'r').length;
    $('#s-view').textContent = `${r} entries, ${items.length - r} chronicle`;
  }
  function fitRange(t0, t1, dur) {
    if (!isFinite(t0) || !isFinite(t1)) return;
    const a = tToU(Math.min(t0, t1)), b = tToU(Math.max(t0, t1));
    const pad = Math.max(0.004, (b - a) * 0.06);
    field.fitU(a - pad, b + pad, null, dur);
  }
  function fitTimes(ts) {
    ts = ts.filter((t) => t != null && isFinite(t)).sort((a, b) => a - b);
    if (!ts.length) return;
    const q = (f) => ts[Math.min(ts.length - 1, Math.max(0, Math.round(f * (ts.length - 1))))];
    fitRange(q(ts.length > 14 ? 0.03 : 0), q(ts.length > 14 ? 0.97 : 1));
  }
  function fitCurrent() {
    const r = state.route;
    if (!r) return;
    if (r.kind === 'p') {
      const wl = S.worldline(r.item);
      fitTimes(wl.length ? wl.map((x) => x.t) : r.item.recs.map((x) => x.t));
    }
  }

  function parse() {
    const h = decodeURI(location.hash || '').replace(/^#\/?/, '');
    const [kind, ...rest] = h.split('/');
    return { kind: kind || 'continuum', id: decodeURIComponent(rest.join('/')) };
  }

  function apply() {
    const { kind, id } = parse();
    state.sel = null; state.route = null;
    let mode = MODES.includes(kind) ? kind : 'continuum';
    let overlay = null, worldLit = null, worlds = [];
    const miss = () => readout.set('Not on record', `<p class="lead">No entry matches “${String(id).replace(/</g, '&lt;')}”. It may have been renamed. Search for it instead.</p>`, readout.back('#/continuum', skin.words.inView));
    if (kind === 'r') {
      const r = S.recById.get(id);
      if (!r) miss(); else {
        if (r.leg && !S.legendsOn) setLegends(true, false);
        state.sel = { kind: 'r', item: r }; readout.record(r); field.bringIntoView(r.t, spanForRec(r));
      }
      mode = 'continuum';
    } else if (kind === 'e') {
      const e = S.evById.get(id);
      if (!e) miss(); else {
        if (e.leg && !S.legendsOn) setLegends(true, false);
        state.sel = { kind: 'e', item: e }; readout.event(e);
        if (e.t2 != null && e.t2 - e.t < 60) fitRange(e.t, e.t2); else field.bringIntoView(e.t, spanFor(e.t));
      }
      mode = 'continuum';
    } else if (kind === 'v') {
      const v = S.visById.get(id);
      mode = 'visions';
      if (!v) miss(); else {
        state.sel = { kind: 'v', item: v }; readout.vision(v);
        const ts = v.legs.flatMap((g) => [g.from.t, g.to.t]);
        fitRange(Math.min(...ts) - 0.4, Math.max(...ts) + 0.4);
      }
    } else if (kind === 'p') {
      const p = S.personByKey.get(id);
      mode = 'personnel';
      if (!p) miss(); else { state.route = { kind: 'p', item: p }; worlds = [p]; readout.person(p); fitCurrent(); }
    } else if (kind === 'w' || kind === 'ws') {
      const w = S.placeByKey.get(id);
      mode = kind === 'w' ? 'map' : 'continuum';
      if (!w) miss(); else {
        state.route = { kind: 'w', item: w }; readout.world(w); map.select(w);
        if (kind === 'ws') { worldLit = w; fitTimes(w.recs.filter((r) => S.legendsOn || !r.leg).map((r) => r.t)); }
      }
    } else if (kind === 'l' || kind === 'ln' || kind === 'o') {
      const item = kind === 'l' ? S.treeById.get(id) : kind === 'ln' ? S.lineById.get(id) : S.officeById.get(id);
      mode = 'lineages';
      if (!item) miss(); else {
        state.route = { kind, item };
        if (kind === 'l') { readout.tree(item); overlay = { kind: 'tree', item }; }
        else if (kind === 'ln') { readout.line(item); overlay = { kind: 'line', item }; }
        else { readout.office(item); overlay = { kind: 'office', item }; }
      }
    } else if (kind === 'a') {
      const a = S.artById.get(id);
      mode = 'relics';
      if (!a) miss(); else { state.route = { kind: 'a', item: a }; readout.relic(a); overlay = { kind: 'relic', item: a }; }
    } else if (kind === 'x') {
      const x = S.anById.get(id);
      mode = 'anomalies';
      if (!x) miss(); else { state.route = { kind: 'x', item: x }; readout.anomaly(x); field.bringIntoView(x.t, spanFor(x.t)); }
    } else if (kind === 't') {
      const t = parseFloat(id);
      mode = 'continuum';
      if (isFinite(t)) field.bringIntoView(t + 0.5, spanFor(t));
      setTimeout(() => readout.inView(field.inView()), 800);
    } else if (kind === 'y') {
      const [a, b] = id.split('/').map(parseFloat);
      mode = 'continuum';
      if (isFinite(a) && isFinite(b)) fitRange(a, b, 0);
      setTimeout(() => readout.inView(field.inView()), 50);
    } else {
      readout.list(mode);
    }
    field.setOverlay(overlay);
    if (overlay) {
      const it = overlay.item;
      const ts = overlay.kind === 'relic' ? [...it.custody.flatMap((c) => [c.t0, c.t1]), ...it.srcRecs.map((r) => r.t)]
        : overlay.kind === 'office' ? it.holders.flatMap((h) => [h.t0, h.t1])
          : (field.overlay.rows || []).flatMap((r) => r.spans.filter((s) => s.kind !== 'life').flatMap((s) => [s.t0, s.t1]));
      fitTimes(ts.length ? ts : (field.overlay.rows || []).flatMap((r) => r.spans.flatMap((s) => [s.t0, s.t1])));
    }
    field.setWorlds(worlds);
    field.setWorld(worldLit);
    if (kind !== 'w') map.select(state.route && state.route.kind === 'w' ? state.route.item : null);
    field.select(state.sel);
    state.mode = mode;
    field.setMode(mode);
    map.show(mode === 'map');
    document.querySelector('.stage').classList.toggle('mapmode', mode === 'map');
    document.querySelectorAll('.navbtn[data-mode]').forEach((b) => b.setAttribute('aria-current', String(b.dataset.mode === mode)));
    if (mode === 'continuum' && !state.sel && !state.route && !['t', 'y'].includes(kind)) readout.inView(field.inView());
    updateCount();
  }

  function go(hash) {
    chirp(hash.startsWith('#/r/') || hash.startsWith('#/e/') ? 'select' : 'nav');
    if (location.hash === hash) apply(); else location.hash = hash;
  }
  window.addEventListener('hashchange', apply);

  document.addEventListener('click', (e) => {
    const g = e.target.closest('[data-go]');
    if (g && !e.target.closest('.results')) { e.preventDefault(); go(g.dataset.go); return; }
    const m = e.target.closest('.navbtn[data-mode]');
    if (m) go(`#/${m.dataset.mode}`);
  });

  // the Legends layer
  const legBtn = $('#legends');
  function setLegends(on, reapply = true) {
    S.setLegends(on);
    try { localStorage.setItem('swt-legends', on ? 'on' : 'off'); } catch (_) { /* storage blocked */ }
    legBtn.setAttribute('aria-pressed', String(on));
    field.setLegends(); ribbon.bin(); ribbon.draw(); search.rebuild(); counts();
    if (state.mode === 'map') map.refresh();
    if (reapply) apply();
  }
  legBtn.setAttribute('aria-pressed', String(S.legendsOn));
  legBtn.addEventListener('click', () => { chirp('nav'); setLegends(!S.legendsOn); });

  // the archive (skin) picker
  const skinBtn = $('#skin-btn'), skinMenu = $('#skin-menu');
  function paintSkinMenu() {
    skinMenu.innerHTML = SKINS.map((s) => `<button role="menuitemradio" aria-checked="${s.id === skin.id}" data-skin="${s.id}" ${s.ready ? '' : 'disabled'}>
      <span class="nm">${s.name}</span><span class="st">${s.id === skin.id ? 'Reading' : s.ready ? 'Open' : 'Sealed'}</span><span class="ds">${s.desc}${s.ready ? '' : ' Opens in a later build.'}</span></button>`).join('');
  }
  paintSkinMenu();
  skinBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = skinMenu.hidden;
    skinMenu.hidden = !open; skinBtn.setAttribute('aria-expanded', String(open));
  });
  document.addEventListener('click', (e) => { if (!e.target.closest('.skinpick')) { skinMenu.hidden = true; skinBtn.setAttribute('aria-expanded', 'false'); } });
  skinMenu.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-skin]');
    if (!b || b.disabled || b.dataset.skin === skin.id) return;
    const id = b.dataset.skin;
    try { localStorage.setItem('swt-skin', id); } catch (_) { /* storage blocked */ }
    const link = document.getElementById('skin-css');
    await new Promise((res) => { link.onload = res; link.onerror = res; link.href = `skins/${id}/skin.css`; document.documentElement.dataset.skin = id; });
    applySkin(await loadSkin(id));
    readout.skin = skin;
    await skinFonts();
    resetTokens(); field.reskin(); field.setVantage(vantageOf(skin, S)); ribbon.draw(); map.reskin();
    paintSkinMenu(); skinMenu.hidden = true;
    apply();
  });

  const audioBtn = $('#audio');
  const paintAudio = () => { audioBtn.setAttribute('aria-pressed', String(audioOn())); };
  audioBtn.addEventListener('click', () => { setAudio(!audioOn()); paintAudio(); chirp('nav'); });
  paintAudio();

  $('#z-in').addEventListener('click', () => field.zoomBy(1.8));
  $('#z-out').addEventListener('click', () => field.zoomBy(1 / 1.8));
  $('#z-reset').addEventListener('click', () => fitRange(HOME[0], HOME[1]));

  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === '/') { e.preventDefault(); $('#q').focus(); }
    else if (e.key === 'Escape') { if (state.sel || state.route) go(`#/${state.mode}`); }
    else if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      const dir = e.key === 'ArrowRight' ? 1 : -1;
      let i;
      if (state.sel && (state.sel.kind === 'r' || state.sel.kind === 'e')) i = state.sel.item.ci + dir;
      else { const [a, b] = field.visibleU(), t = uToT((a + b) / 2); i = S.chron.findIndex((x) => x.t >= t); if (dir < 0) i -= 1; }
      const x = S.chron[Math.max(0, Math.min(S.chron.length - 1, i))];
      if (x) { e.preventDefault(); go(x.$ === 'r' ? `#/r/${enc(x.id)}` : `#/e/${enc(x.id)}`); }
    } else if (e.key === '+' || e.key === '=') field.zoomBy(1.6);
    else if (e.key === '-' || e.key === '_') field.zoomBy(1 / 1.6);
    else if (e.key === '0') fitRange(HOME[0], HOME[1]);
  });

  // first light happens behind the gate; the reveal plays when the viewer enters
  field.fitU(tToU(HOME[0]), tToU(HOME[1]), null, 0);
  ribbon.draw();
  updateStatus();
  apply();
  field.hooks.onView = ((orig) => (ended) => { orig(ended); if (ended) updateCount(); })(field.hooks.onView);
  setTimeout(() => {
    say(4, S);
    gate.ready(() => {
      chirp('nav');
      document.body.classList.remove('boot');
      void document.body.offsetWidth;
      document.body.classList.add('boot');
      field.startReveal();
      setTimeout(() => document.body.classList.remove('boot'), 1500);
    });
  }, 350);
}

boot();

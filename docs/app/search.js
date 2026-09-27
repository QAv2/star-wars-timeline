// Archive search. Titles, names and worlds match directly; plain descriptions ("the one where Ahsoka
// leaves the Order") are ranked by weighted term overlap across titles, loglines, summaries and who
// appears, all in the browser.
import { norm, VISION_KINDS } from './data.js';
import { esc } from './field.js';

const enc = encodeURIComponent;
const GROUP = { r: 'Entries', p: 'People', w: 'Worlds', e: 'Chronicle', v: 'Visions', a: 'Relics', l: 'Lineages', x: 'Contested' };
const STOP = new Set(('a an and the of to in on at by for from with into onto about over under as is are was were be been being it its '
  + 'this that these those there their they them he she his her him hers who whom whose what which when where why how '
  + 'one ones some any all each every episode episodes ep show series film movie tell me find search look '
  + 'remember recall think maybe perhaps kind sort thing things something someone somebody involved involving happens happened '
  + 'happen get gets got do does did done have has had just like also then than so very really can could would should will '
  + 'i we you our your my us out up off again still ever even though while after before during between through star wars').split(' '));

const SYN = {};
[['kill', 'murder', 'death', 'die', 'dead', 'dies', 'killed'], ['father', 'dad', 'parent'], ['mother', 'mom', 'parent'],
 ['son', 'child', 'boy'], ['daughter', 'child', 'girl'], ['baby', 'child', 'kid', 'foundling'], ['clone', 'trooper', 'clones'],
 ['droid', 'robot', 'astromech'], ['jedi', 'knight', 'padawan'], ['sith', 'dark', 'darkside'], ['lightsaber', 'saber', 'blade'],
 ['ship', 'starship', 'freighter', 'cruiser'], ['planet', 'world', 'moon'], ['bounty', 'hunter', 'mercenary'],
 ['empire', 'imperial', 'imperials'], ['rebel', 'rebels', 'rebellion', 'insurgent'], ['resistance', 'rebel'],
 ['vision', 'dream', 'visions', 'foresee'], ['ghost', 'spirit'], ['mandalorian', 'mando', 'beskar'],
 ['destroy', 'explode', 'blow', 'destroyed'], ['escape', 'flee', 'breakout'], ['rescue', 'save', 'saved', 'free'],
 ['duel', 'fight', 'battle', 'clash'], ['trap', 'captured', 'prison', 'prisoner', 'capture'], ['love', 'romance', 'kiss', 'married', 'wedding'],
 ['leave', 'quit', 'leaves', 'walks'], ['train', 'teach', 'training', 'lesson'], ['heist', 'steal', 'theft', 'robbery'],
 ['kid', 'kids', 'children', 'young'], ['creature', 'beast', 'monster'], ['senate', 'senator', 'politics', 'vote']]
  .forEach((g) => g.forEach((w) => { SYN[w] = [...new Set([...(SYN[w] || []), ...g.filter((x) => x !== w)])]; }));

const SUFFIX = [['ies', 'y'], ['ing', ''], ['ied', 'y'], ['ed', ''], ['ions', ''], ['ion', ''], ['ly', ''], ['es', ''], ['s', '']];
const stem = (w) => {
  if (w.length <= 4) return w.endsWith('s') && w.length === 4 && !w.endsWith('ss') ? w.slice(0, -1) : w;
  for (const [suf, rep] of SUFFIX) if (w.endsWith(suf) && w.length - suf.length >= 4) return w.slice(0, -suf.length) + rep;
  return w;
};
const tokens = (s) => norm(s).split(' ').filter((w) => w && !STOP.has(w)).map(stem);

// the timeline under its current archive's name (the rail shows the active skin's word)
const fieldName = () => (document.querySelector('.navbtn[data-mode="continuum"] .lab') || {}).textContent || 'Timeline';

// "19 BBY", "4 aby", "-19", "yavin" → a time
export function parseYear(raw) {
  const s = raw.trim().toLowerCase().replace(/,/g, '');
  let m = s.match(/^(\d+(?:\.\d+)?)\s*(bby|aby)$/);
  if (m) return m[2] === 'bby' ? -parseFloat(m[1]) : parseFloat(m[1]);
  m = s.match(/^(-?\d{1,6})$/);
  if (m) return parseFloat(m[1]);
  if (s === 'yavin' || s === 'battle of yavin') return 0;
  return null;
}

export class Search {
  constructor({ input, results, store, go }) {
    Object.assign(this, { input, results, S: store, go });
    this.rebuild();
    if (window.__dbg) window.__search = this;
    this.sel = -1; this.flat = [];
    input.addEventListener('input', () => { clearTimeout(this.t); this.t = setTimeout(() => this.run(), 60); });
    input.addEventListener('focus', () => { if (input.value.trim()) this.run(); });
    input.addEventListener('keydown', (e) => this.key(e));
    results.addEventListener('mousedown', (e) => e.preventDefault());
    results.addEventListener('click', (e) => { const b = e.target.closest('[data-go]'); if (b) this.choose(b.dataset.go); });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) this.close(); });
  }

  rebuild() { this.items = this.buildIndex(); this.buildTerms(); }

  buildIndex() {
    const S = this.S, out = [];
    const cast = (r, n) => r.c.slice(0, n).map((i) => S.people[i].name).join(' ');
    for (const r of S.records) {
      if (r.leg && !S.legendsOn) continue;
      out.push({ k: 'r', key: norm(r.ti), alt: norm(`${r.s} ${r.n || ''} ${S.series[r.s] || ''}`), label: r.ti,
        meta: `${r.k === 'film' ? 'Film' : (S.series[r.s] || r.s).replace(/^Star Wars:? /, '') + ' ' + (r.n || '')} · ${r.tt}`,
        go: `#/r/${enc(r.id)}`, boost: r.k === 'film' ? 8 : 4, fields: [[r.ti, 3], [r.lg, 1], [cast(r, 10), 1.6], [S.series[r.s] || '', 0.4]] });
    }
    for (const p of S.people) {
      const n = p.recs.filter((r) => S.legendsOn || !r.leg).length;
      if (!n && !p.dossier) continue;
      const aka = p.dossier && p.dossier.aliases ? ' ' + p.dossier.aliases.map((a) => (typeof a === 'string' ? a : a.name)).join(' ') : '';
      const short = p.dossier && p.dossier.short ? ' ' + p.dossier.short : '';
      out.push({ k: 'p', key: norm(p.name + short + aka), alt: norm(p.k), label: p.name, meta: `${n} entries`, go: `#/p/${enc(p.k)}`,
        boost: Math.min(6, Math.log2(1 + n)) + (p.dossier ? 4 : 0), fields: n >= 6 || p.dossier ? [[p.name + short + aka, 2.2]] : [] });
    }
    for (const w of S.places) out.push({ k: 'w', key: norm(w.k), alt: norm(`${w.r || ''} ${w.sec || ''}`), label: w.k, meta: w.g ? `Grid ${w.g}` : (w.r || 'World'),
      go: `#/w/${enc(w.k)}`, boost: Math.min(5, Math.log2(1 + w.n)), fields: [[w.k, 2]] });
    const evs = [...S.events, ...(S.legendsOn ? S.levents : [])];
    for (const e of evs) out.push({ k: 'e', key: norm(e.title), alt: norm(e.summary), label: e.title + (e.leg ? ' (Legends)' : ''), meta: e.tText || '', go: `#/e/${enc(e.id)}`, boost: e.w,
      fields: [[e.title, 3], [e.summary, 1], [e.polity || '', 0.5], [(e.people || []).join(' '), 1]] });
    for (const v of S.visions) out.push({ k: 'v', key: norm(v.title), alt: norm((v.experiencers || []).join(' ')), label: v.title,
      meta: (VISION_KINDS[v.kind] || VISION_KINDS.vision).label, go: `#/v/${enc(v.id)}`, boost: 2,
      fields: [[v.title, 3], [v.summary, 1], [(v.experiencers || []).join(' '), 1.5]] });
    for (const a of S.artifacts) out.push({ k: 'a', key: norm(a.name || a.title), alt: norm(a.custody.map((c) => c.p.name).join(' ')), label: a.name || a.title,
      meta: `${a.custody.length} holders`, go: `#/a/${enc(a.id)}`, boost: 5, fields: [[a.name || a.title, 3], [a.summary || '', 1]] });
    for (const o of S.offices) out.push({ k: 'l', key: norm(o.title), alt: norm(o.holders.map((h) => h.p.name).join(' ')), label: o.title, meta: 'Office', go: `#/o/${enc(o.id)}`, boost: 4, fields: [[o.title, 3]] });
    for (const ln of S.lines) out.push({ k: 'l', key: norm(ln.title), alt: norm((ln.members || []).join(' ')), label: ln.title, meta: 'Line', go: `#/ln/${enc(ln.id)}`, boost: 5, fields: [[ln.title, 3], [ln.summary || '', 1]] });
    for (const x of S.anomalies) out.push({ k: 'x', key: norm(x.title), alt: norm(x.summary), label: x.title, meta: x.tText || '', go: `#/x/${enc(x.id)}`, boost: 2, fields: [[x.title, 3], [x.summary || '', 1]] });
    return out;
  }

  buildTerms() {
    const post = new Map();
    this.items.forEach((it, idx) => {
      const seen = new Map();
      for (const [text, w] of it.fields || []) for (const t of tokens(text)) seen.set(t, Math.max(seen.get(t) || 0, w));
      for (const [t, w] of seen) { if (!post.has(t)) post.set(t, []); post.get(t).push([idx, w]); }
    });
    this.post = post;
    this.vocab = [...post.keys()];
    const N = this.items.length;
    this.idf = new Map([...post].map(([t, l]) => [t, Math.log(1 + N / l.length)]));
  }

  describe(q) {
    const terms = [...new Set(tokens(q))];
    if (!terms.length) return [];
    const acc = new Map(), hitCount = new Map();
    for (const qt of terms) {
      const matches = this.post.has(qt) ? [[qt, 1]] : [];
      if (qt.length >= 4) for (const v of this.vocab) if (v !== qt && v.startsWith(qt)) matches.push([v, 0.8]);
      for (const alt of SYN[qt] || []) if (this.post.has(stem(alt))) matches.push([stem(alt), 0.7]);
      const best = new Map();
      for (const [m, f] of matches.slice(0, 48)) {
        const idf = this.idf.get(m) * f;
        for (const [idx, w] of this.post.get(m)) best.set(idx, Math.max(best.get(idx) || 0, idf * w));
      }
      for (const [idx, v] of best) { acc.set(idx, (acc.get(idx) || 0) + v); hitCount.set(idx, (hitCount.get(idx) || 0) + 1); }
    }
    const out = [];
    for (const [idx, v] of acc) {
      const cover = hitCount.get(idx) / terms.length;
      if (terms.length > 1 && cover < (terms.length >= 5 ? 0.4 : 0.5)) continue;
      out.push([v * (0.4 + cover), this.items[idx]]);
    }
    return out.sort((a, b) => b[0] - a[0]).slice(0, 40);
  }

  score(it, q, words) {
    let s = 0;
    if (it.key === q) s = 100;
    else if (it.key.startsWith(q)) s = 80;
    else if (words.every((w) => it.key.split(' ').some((kw) => kw.startsWith(w)))) s = 60;
    else if (it.key.includes(q)) s = 45;
    else if (it.alt && q.length > 2 && it.alt.split(' ').some((a) => a === q)) s = 30;
    return s ? s + it.boost : 0;
  }

  run() {
    const raw = this.input.value.trim();
    const q = norm(raw);
    if (!q) { this.close(); return; }
    const words = q.split(' ');
    const direct = [];
    for (const it of this.items) { const s = this.score(it, q, words); if (s) direct.push([s, it]); }
    direct.sort((a, b) => b[0] - a[0]);
    const descriptive = words.length >= 2 || direct.length < 3 ? this.describe(raw) : [];
    const seen = new Set(direct.map(([, it]) => it));
    const hits = [...direct];
    const bestDirect = direct.length ? direct[0][0] : 0;
    for (const [v, it] of descriptive) if (!seen.has(it)) { hits.push([Math.min(bestDirect > 59 ? 44 : 99, 20 + v * 4), it]); seen.add(it); }
    hits.sort((a, b) => b[0] - a[0]);
    const groups = new Map();
    for (const [, it] of hits) {
      if (!groups.has(it.k)) groups.set(it.k, []);
      const g = groups.get(it.k);
      if (g.length < (it.k === 'r' || it.k === 'p' ? 7 : 4)) g.push(it);
    }
    const order = [...groups.keys()].sort((a, b) => hits.findIndex((h) => h[1].k === a) - hits.findIndex((h) => h[1].k === b));
    this.flat = [];
    let html = '';
    for (const k of order) {
      html += `<div class="grp">${GROUP[k]}</div>`;
      for (const it of groups.get(k)) {
        const idx = this.flat.push(it) - 1;
        html += `<button role="option" id="sr-${idx}" data-go="${esc(it.go)}" aria-selected="false"><span class="rt">${esc(it.label)}</span><span class="rm">${esc(it.meta)}</span></button>`;
      }
    }
    const yr = parseYear(raw);
    if (yr != null) {
      const lab = yr < 0 ? `${-yr} BBY` : yr === 0 ? 'the Battle of Yavin' : `${yr} ABY`;
      html = `<div class="grp">Travel</div><button role="option" id="sr-y" data-go="#/t/${yr}" aria-selected="false"><span class="rt">Go to ${esc(lab)}</span><span class="rm">${esc(fieldName())}</span></button>` + html;
    }
    this.results.innerHTML = html || `<div class="empty">Nothing on record for “${esc(raw)}”. Try a title, a name, a world, a year like 19 BBY, or a few words about what happens.</div>`;
    this.results.classList.add('open');
    this.input.setAttribute('aria-expanded', 'true');
    this.sel = this.flat.length ? 0 : -1;
    this.yr = yr;
    this.mark();
  }

  mark() {
    this.results.querySelectorAll('[role="option"][id^="sr-"]').forEach((b) => b.setAttribute('aria-selected', String(b.id === `sr-${this.sel}`)));
    const cur = this.results.querySelector(`#sr-${this.sel}`);
    if (cur) cur.scrollIntoView({ block: 'nearest' });
  }

  key(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); this.sel = Math.min(this.flat.length - 1, this.sel + 1); this.mark(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.sel = Math.max(0, this.sel - 1); this.mark(); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      const yr = parseYear(this.input.value);
      if (yr != null && !(this.sel > 0)) this.choose(`#/t/${yr}`);
      else if (this.sel >= 0 && this.flat[this.sel]) this.choose(this.flat[this.sel].go);
    } else if (e.key === 'Escape') { this.input.value = ''; this.close(); this.input.blur(); }
  }

  choose(hash) { this.close(); this.input.blur(); this.go(hash); }
  close() { this.results.classList.remove('open'); this.input.setAttribute('aria-expanded', 'false'); }
}

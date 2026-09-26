// The readout panel: every list and every file the console can show. Words come from the active skin.
import { VISION_KINDS, norm, visionColor, token } from './data.js';
import { fmtTime, eraLabel, yearLabel } from './scale.js';
import { esc } from './field.js';

const enc = (s) => encodeURIComponent(s);
const WP = (t) => `https://starwars.fandom.com/wiki/${encodeURIComponent(String(t).replace(/ /g, '_'))}`;
const CONF = { explicit: 'Stated on record', estimated: 'Estimated', inferred: 'Inferred' };
const PR = { order: 'Wookieepedia in-universe order', approx: 'Approximate (exact placement unknown)', infobox: 'Year of record' };

function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso + 'T12:00:00Z');
  return isNaN(d) ? iso : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' });
}
const cell = (k, v, cls = '') => (v == null || v === '' ? '' : `<div class="c ${cls}"><div class="k">${esc(k)}</div><div class="v">${esc(v)}</div></div>`);
const span = (a, b) => (a && b && a !== b ? `${a} to ${b}` : a || b || '');

export class Readout {
  constructor({ store, head, tools, body, field, skin }) {
    Object.assign(this, { S: store, head, tools, body, field, skin });
    this.state = { recTab: 'FLM', fileQ: '' };
    body.addEventListener('click', (e) => this.onClick(e));
    body.addEventListener('input', (e) => this.onInput(e));
  }
  get W() { return this.skin.words; }

  set(kicker, html, toolsHtml = '') {
    this.head.textContent = kicker;
    this.tools.innerHTML = toolsHtml;
    this.body.innerHTML = html;
    this.body.scrollTop = 0;
  }
  back(hash, label = 'Back') { return `<button class="back" data-go="${hash}">◂ ${esc(label)}</button>`; }

  // ── building blocks ───────────────────────────────────────────────
  chip(label, color) { return `<span class="chip" style="background:${color}">${esc(label)}</span>`; }
  code(r) { return r.s === 'FLM' ? 'Film' : r.leg && r.s === 'LFLM' ? 'Legends film' : `${this.S.series[r.s] || r.s}${r.n ? ' ' + r.n : ''}`; }
  laneChip(r) { const l = r.lane; return this.chip(l.label.length > 11 ? l.label.split(' ')[0] : l.label, l.color); }
  recRow(r, right) {
    return `<li><button class="row" data-go="#/r/${enc(r.id)}">${this.laneChip(r)}
      <span class="t">${esc(r.ti)}<small>${esc(r.lg)}</small></span><span class="d">${esc(right != null ? right : r.tt)}</span></button></li>`;
  }
  evRow(e, right) {
    const col = e.conflict ? token('--conflict') : e.leg ? token('--c-leg-event') : token('--c-event');
    return `<li><button class="row" data-go="#/e/${enc(e.id)}">${this.chip(e.leg ? 'LEGENDS' : 'CHRON', col)}
      <span class="t">${esc(e.title)}<small>${esc(e.summary || '')}</small></span><span class="d">${esc(right != null ? right : e.tText || '')}</span></button></li>`;
  }
  visRow(v) {
    const k = VISION_KINDS[v.kind] || VISION_KINDS.vision, g = v.legs[0];
    return `<li><button class="row" data-go="#/v/${enc(v.id)}">${this.chip(k.chip, visionColor(v.kind))}
      <span class="t">${esc(v.title)}<small>${esc(`${g.from.tText} → ${g.to.tText}`)}</small></span><span class="d">${esc((v.experiencers || [])[0] || '')}</span></button></li>`;
  }
  anRow(x) {
    return `<li><button class="row" data-go="#/x/${enc(x.id)}">${this.chip((x.kind || 'conflict').split('-')[0].toUpperCase(), token('--conflict'))}
      <span class="t">${esc(x.title)}<small>${esc(x.summary || '')}</small></span><span class="d">${esc(x.tText || '')}</span></button></li>`;
  }
  artRow(a) {
    return `<li><button class="row" data-go="#/a/${enc(a.id)}">${this.chip('RELIC', token('--frame-hi'))}
      <span class="t">${esc(a.name || a.title)}<small>${esc(a.summary || '')}</small></span><span class="d">${a.custody.length} holders</span></button></li>`;
  }
  img(p, cls = '') { return p && p.im ? `<img src="img/p/${esc(p.im)}.jpg" alt="" loading="lazy" class="${cls}">` : ''; }
  personChip(p, extra = '') {
    return `<button class="pchip${p.im ? '' : ' noimg'}" data-go="#/p/${enc(p.k)}">${this.img(p)}<b>${esc(p.name)}</b>${extra}</button>`;
  }
  pk(k) { const p = this.S.personByKey.get(k); return p ? this.personChip(p) : `<span class="pchip noimg">${esc(k)}</span>`; }
  worldChip(w) { return `<button class="pchip noimg" data-go="#/w/${enc(w.k)}"><b>${esc(w.k)}</b>${w.g ? `<small>${esc(w.g)}</small>` : ''}</button>`; }
  wk(k) { const w = this.S.placeByKey.get(k); return w ? this.worldChip(w) : `<span class="pchip noimg">${esc(k)}</span>`; }
  sources(list) {
    if (!list || !list.length) return '';
    return `<h3>Sources</h3><p class="note">${list.map((s) => {
      const r = this.S.recByWp.get(s);
      return r ? `<a href="#/r/${enc(r.id)}" data-go="#/r/${enc(r.id)}">${esc(r.ti)}</a>` : `<a href="${WP(s)}" target="_blank" rel="noopener">${esc(s)}</a>`;
    }).join(', ')}</p>`;
  }
  conflict(c) { return c ? `<div class="anomaly"><div class="k">${esc(this.W.anomaly)}</div>${esc(c)}</div>` : ''; }

  // ── the stacks: what's in the window ──────────────────────────────
  inView(items) {
    const shown = items.slice(0, 450);
    let html = '', curKey = null;
    const keyOf = (x) => (x.t < -2000 ? eraLabel(x.t) : yearLabel(Math.floor(x.t)));
    for (const it of shown) {
      const key = keyOf(it);
      if (key !== curKey) {
        if (curKey != null) html += '</ul>';
        const n = shown.filter((x) => keyOf(x) === key).length;
        html += `<div class="yearhead">${esc(key)}<span class="sub">${n} ${n === 1 ? 'entry' : 'entries'}</span></div><ul class="list">`;
        curKey = key;
      }
      html += it.$ === 'r' ? this.recRow(it, it.n || (it.k === 'film' ? 'Film' : '')) : this.evRow(it, '');
    }
    if (curKey != null) html += '</ul>';
    if (!items.length) html = `<p class="note">Nothing is recorded in this window. Zoom out, or drag the lit window on the era ribbon to move through time.</p>`;
    else if (items.length > shown.length) html += `<p class="note">Showing the first ${shown.length} of ${items.length}. Zoom in to narrow the window.</p>`;
    const recs = items.filter((x) => x.$ === 'r').length;
    let seen = true;
    try { seen = localStorage.getItem('swt-hint') === '1'; } catch (_) { /* storage blocked */ }
    const hint = seen ? '' : `<div class="statusnote"><div class="k">How to read the stacks</div>${esc(this.W.orient)}
      <div class="btnrow" style="margin:8px 0 2px"><button class="btn primary" data-act="hint-ok">Understood</button></div></div>`;
    this.set(`${this.W.inView}: ${recs} entries, ${items.length - recs} chronicle`, hint + html);
  }

  // ── a record ──────────────────────────────────────────────────────
  record(r) {
    const S = this.S;
    const prom = (a, b) => (b.dossier ? 1 : 0) - (a.dossier ? 1 : 0) || b.recs.length - a.recs.length;
    const people = r.c.map((i) => S.people[i]).sort(prom), remote = (r.cr || []).map((i) => S.people[i]).sort(prom), flash = (r.cf || []).map((i) => S.people[i]).sort(prom);
    const worlds = (r.pl || []).map((i) => S.places[i]);
    const links = S.recLinks.get(r.id) || [];
    const act = [];
    for (const l of links) {
      if (l.kind === 'v') act.push(this.visRow(l.item));
      if (l.kind === 'e') act.push(this.evRow(l.item));
      if (l.kind === 'x') act.push(this.anRow(l.item));
      if (l.kind === 'a') act.push(this.artRow(l.item));
    }
    const seen = new Set();
    const actU = act.filter((h) => (seen.has(h) ? false : seen.add(h)));
    const prev = S.chron[r.ci - 1], next = S.chron[r.ci + 1];
    const nb = (x) => (x ? (x.$ === 'r' ? this.recRow(x, x.tt) : this.evRow(x)) : '');
    const top = people.slice(0, 18), rest = people.slice(18);
    const html = `
      <div class="series-tag"><i style="background:${r.lane.color}"></i>${esc(S.series[r.s] || r.s)}${r.leg ? ' (Legends)' : ''}</div>
      <h2>${esc(r.ti)}</h2>
      <div class="cells">
        ${cell('In-universe', r.tt, 'loc')}
        ${cell(r.k === 'film' ? 'Released' : 'First aired', fmtDate(r.ad))}
        ${cell('Episode', r.k === 'film' ? null : r.n)}
        ${cell('Era', eraLabel(r.t))}
      </div>
      <p class="lead">${esc(r.lg)}</p>
      ${r.lgs !== 'own' ? `<p class="fine" style="margin-top:0">${r.lgs === 'od' ? 'Official description, quoted from Wookieepedia.' : 'Summary from Wookieepedia (CC BY-SA).'}</p>` : ''}
      ${actU.length ? `<h3>Linked in the archive</h3><ul class="list">${actU.join('')}</ul>` : ''}
      ${people.length ? `<h3>Who appears</h3><div class="chips">${top.map((p) => this.personChip(p)).join('')}
        ${rest.length ? `<span class="more-wrap" hidden>${rest.map((p) => this.personChip(p)).join('')}</span><button class="more" data-act="more">Show ${rest.length} more</button>` : ''}</div>` : ''}
      ${remote.length ? `<h3>By hologram, voice or vision</h3><div class="chips">${remote.slice(0, 24).map((p) => this.personChip(p)).join('')}</div>` : ''}
      ${flash.length ? `<h3>In flashback</h3><div class="chips">${flash.slice(0, 24).map((p) => this.personChip(p)).join('')}</div>` : ''}
      ${worlds.length ? `<h3>Worlds</h3><div class="chips">${worlds.map((w) => this.worldChip(w)).join('')}</div>` : ''}
      <h3>Before and after, in-universe</h3>
      <ul class="list">${nb(prev)}${nb(next)}</ul>
      ${r.prevAir || r.nextAir ? `<h3>Previous and next ${r.k === 'film' ? 'film' : 'episode'}, by release</h3><ul class="list">${r.prevAir ? this.recRow(r.prevAir, 'Previous') : ''}${r.nextAir ? this.recRow(r.nextAir, 'Next') : ''}</ul>` : ''}
      <div class="btnrow"><a class="btn" href="${WP(r.wp)}" target="_blank" rel="noopener">Wookieepedia</a><button class="btn" data-act="fit-rec" data-id="${esc(r.id)}">Center on the stacks</button></div>
      <p class="fine">Placement: ${esc(PR[r.pr] || r.pr)}.</p>`;
    this.set(`${this.W.record}, ${this.code(r)}`, html, this.back('#/continuum', this.W.inView));
  }

  // ── a chronicle entry ─────────────────────────────────────────────
  event(e) {
    const html = `
      <div class="series-tag"><i style="background:${e.conflict ? token('--conflict') : e.leg ? token('--c-leg-event') : token('--c-event')}"></i>${e.leg ? 'Legends chronicle' : this.W.history}, ${esc(eraLabel(e.t))}</div>
      <h2>${esc(e.title)}</h2>
      <div class="cells">${cell('When', span(e.tText, e.y2Text), 'loc')}${cell('Dating', CONF[e.confidence] || e.confidence)}${cell('Kind', e.category)}${cell('Belongs to', e.polity)}</div>
      <p class="lead">${esc(e.summary)}</p>
      ${e.note ? `<p class="note">${esc(e.note)}</p>` : ''}
      ${this.conflict(e.conflict)}
      ${e.srcRecs.length ? `<h3>Seen in</h3><ul class="list">${e.srcRecs.map((r) => this.recRow(r, r.tt)).join('')}</ul>` : ''}
      ${(e.people || []).length ? `<h3>Who</h3><div class="chips">${e.people.map((k) => this.pk(k)).join('')}</div>` : ''}
      ${(e.places || []).length ? `<h3>Where</h3><div class="chips">${e.places.map((k) => this.wk(k)).join('')}</div>` : ''}
      ${this.sources((e.sources || []).filter((s) => !e.srcRecs.some((r) => r.wp === s)))}
      <div class="btnrow">${e.wp ? `<a class="btn" href="${WP(e.wp)}" target="_blank" rel="noopener">Wookieepedia</a>` : ''}<button class="btn" data-act="fit-t" data-t="${e.t}">Center on the stacks</button></div>`;
    this.set(e.leg ? 'Legends chronicle' : this.W.event, html, this.back('#/continuum', this.W.inView));
  }

  // ── a vision or crossing ──────────────────────────────────────────
  vision(v) {
    const k = VISION_KINDS[v.kind] || VISION_KINDS.vision, col = visionColor(v.kind);
    const lane = (id) => (this.S.laneById.get(id) || {}).sub || id;
    const legs = v.legs.map((g) => `<div class="leg">
        <div class="end" style="border-left-color:${col}"><div class="k">${esc(g.mode || 'from')}${g.from.place ? ', ' + esc(g.from.place) : ''}</div><div class="v">${esc(g.from.tText)}</div></div>
        <div class="arrow"></div>
        <div class="end" style="border-left-color:${col}"><div class="k">Reaches${g.to.place ? ' ' + esc(g.to.place) : ''}</div><div class="v">${esc(g.to.tText)}</div></div></div>
        ${g.note ? `<p class="note" style="margin:-2px 0 6px">${esc(g.note)}</p>` : ''}`).join('');
    const html = `
      <div class="series-tag"><i style="background:${col}"></i>${esc(k.label)}</div>
      <h2>${esc(v.title)}</h2>
      <div class="cells">${cell('Came true', v.fulfilled)}${cell('Dating', CONF[v.confidence] || v.confidence)}${cell('Lane', lane(v.legs[0].fromLane))}</div>
      <div class="legs">${legs}</div>
      <p class="lead">${esc(v.summary)}</p>
      ${v.note ? `<p class="note">${esc(v.note)}</p>` : ''}
      ${this.conflict(v.conflict)}
      ${(v.experiencers || []).length ? `<h3>Who sees it</h3><div class="chips">${v.experiencers.map((x) => this.pk(x)).join('')}</div>` : ''}
      ${(v.reached || []).length ? `<h3>Who is reached</h3><div class="chips">${v.reached.map((x) => this.pk(x)).join('')}</div>` : ''}
      ${v.srcRecs.length ? `<h3>Seen in</h3><ul class="list">${v.srcRecs.map((r) => this.recRow(r, r.tt)).join('')}</ul>` : ''}
      ${this.sources((v.sources || []).filter((s) => !v.srcRecs.some((r) => r.wp === s)))}`;
    this.set(this.W.visions, html, this.back('#/visions', 'All visions'));
  }

  // ── an archive file (person) ──────────────────────────────────────
  person(p) {
    const S = this.S, d = p.dossier || {};
    const recs = p.recs.filter((r) => S.legendsOn || !r.leg);
    const byLane = new Map();
    for (const r of recs) { if (!byLane.has(r.l)) byLane.set(r.l, []); byLane.get(r.l).push(r); }
    const max = Math.max(1, ...[...byLane.values()].map((a) => a.length));
    const bars = [...byLane.entries()].sort((a, b) => b[1].length - a[1].length).map(([l, a]) => {
      const lane = S.laneById.get(l);
      return `<div class="b"><span>${esc(lane.sub)}</span><span class="bar" style="width:${Math.max(3, (a.length / max) * 100)}%;background:${lane.color}"></span><span class="n">${a.length}</span></div>`;
    }).join('');
    const mast = (p.masters || []).map((e) => this.personChip(e.mp, e.from && e.from.tText ? ` <small>${esc(e.from.tText)}</small>` : ''));
    const appr = (p.apprentices || []).map((e) => this.personChip(e.ap, e.from && e.from.tText ? ` <small>${esc(e.from.tText)}</small>` : ''));
    const offices = (p.offices || []).map(({ o, h }) => `<li><button class="row" data-go="#/o/${enc(o.id)}">${this.chip('OFFICE', token('--frame-hi'))}<span class="t">${esc(o.title)}<small>${esc(span(h.from && h.from.tText, h.to && h.to.tText))}</small></span><span class="d"></span></button></li>`);
    const relics = [...new Set(p.relics || [])].map((a) => this.artRow(a));
    const vis = (p.visions || []).map((v) => this.visRow(v));
    const posts = (d.posts || []).map((x) => `<li><span class="w">${esc(span(x.fromText || (x.from != null ? yearLabel(Math.floor(x.from)) : ''), x.toText || (x.to != null ? yearLabel(Math.floor(x.to)) : '')))}</span>${esc(x.text)}</li>`).join('');
    const firstR = recs[0], lastR = recs[recs.length - 1];
    const html = `
      <div class="dossier">${p.im ? this.img(p) : '<div class="ph"></div>'}<div>
        <div class="series-tag">${esc(this.W.person)}</div>
        <h2>${esc(p.name)}</h2>
        ${d.aliases && d.aliases.length ? `<p class="note">Also known as ${esc(d.aliases.map((a) => (typeof a === 'string' ? a : a.name)).join(', '))}</p>` : ''}
      </div></div>
      <div class="cells">${cell('Born', d.born && d.born.tText, 'loc')}${cell('Died', d.died && d.died.tText)}${cell('Species', d.species)}${cell('Homeworld', d.homeworld)}${cell('Entries', String(recs.length))}</div>
      ${d.summary ? `<p class="lead">${esc(d.summary)}</p>` : ''}
      ${d.affiliation ? `<p class="note">${esc(d.affiliation)}</p>` : ''}
      ${posts ? `<h3>Service</h3><ul class="timeline-mini">${posts}</ul>` : ''}
      ${mast.length ? `<h3>Trained by</h3><div class="chips">${mast.join('')}</div>` : ''}
      ${appr.length ? `<h3>Trained</h3><div class="chips">${appr.join('')}</div>` : ''}
      ${offices.length ? `<h3>Offices held</h3><ul class="list">${offices.join('')}</ul>` : ''}
      ${relics.length ? `<h3>Relics held</h3><ul class="list">${relics.join('')}</ul>` : ''}
      ${vis.length ? `<h3>Visions</h3><ul class="list">${vis.join('')}</ul>` : ''}
      ${bars ? `<h3>Where they appear</h3><div class="bars">${bars}</div>` : ''}
      ${firstR ? `<h3>First and last entries, in-universe</h3><ul class="list">${this.recRow(firstR, firstR.tt)}${lastR !== firstR ? this.recRow(lastR, lastR.tt) : ''}</ul>` : ''}
      ${p.remote.length ? `<p class="note">Also seen by hologram, voice or vision in ${p.remote.length} ${p.remote.length === 1 ? 'entry' : 'entries'} (hollow marks on the stacks).</p>` : ''}
      <div class="btnrow"><a class="btn" href="${WP(p.k)}" target="_blank" rel="noopener">Wookieepedia</a><button class="btn" data-act="fit-p">Fit their line</button><button class="btn" data-act="list-p">Every entry</button></div>
      <div class="plist" hidden><ul class="list">${recs.map((r) => this.recRow(r, r.tt)).join('')}</ul></div>`;
    this.set(this.W.person, html, this.back('#/personnel', 'All files'));
  }

  // ── a world ───────────────────────────────────────────────────────
  world(w) {
    const S = this.S;
    const recs = w.recs.filter((r) => S.legendsOn || !r.leg);
    const evs = w.events.filter((e) => S.legendsOn || !e.leg);
    const html = `
      <div class="series-tag">${esc(w.r || 'Region unrecorded')}</div>
      <h2>${esc(w.k)}</h2>
      <div class="cells">${cell('Grid square', w.g, 'loc')}${cell('Sector', w.sec)}${cell('System', w.sys)}${cell('Kind', w.cls)}${cell('Entries', String(recs.length))}</div>
      ${evs.length ? `<h3>Chronicle</h3><ul class="list">${evs.map((e) => this.evRow(e)).join('')}</ul>` : ''}
      ${recs.length ? `<h3>Entries set here</h3><ul class="list">${recs.map((r) => this.recRow(r, r.tt)).join('')}</ul>` : ''}
      <div class="btnrow"><a class="btn" href="${WP(w.k)}" target="_blank" rel="noopener">Wookieepedia</a><button class="btn" data-act="world-stacks" data-k="${esc(w.k)}">Light it on the stacks</button></div>`;
    this.set(this.W.map, html, this.back('#/map', 'Star map'));
  }

  // ── lineages ──────────────────────────────────────────────────────
  tree(t) {
    const rows = t.members.map(({ p, depth }) => {
      const e = (p.masters || [])[0];
      return `<li><button class="row" data-go="#/p/${enc(p.k)}" style="padding-left:${6 + depth * 14}px">${this.chip(depth ? 'APPR' : 'ROOT', depth ? token('--accent') : token('--frame-hi'))}
        <span class="t">${esc(p.name)}<small>${e ? esc(`Trained by ${e.mp.name}${e.from && e.from.tText ? ', from ' + e.from.tText : ''}`) : 'No master on record'}</small></span><span class="d"></span></button></li>`;
    }).join('');
    this.set(this.W.lineages, `<div class="series-tag">${esc(t.tradition || 'Lineage')}</div><h2>The line of ${esc(t.root.name)}</h2>
      <p class="note">${t.size} people, each trained by the one above. Bars on the stacks show each apprenticeship; the dotted line is a life on record.</p>
      <ul class="list">${rows}</ul>`, this.back('#/lineages', 'All lineages'));
  }
  line(ln) {
    const rows = ln.persons.map((p) => `<li><button class="row" data-go="#/p/${enc(p.k)}">${this.chip('MEMBER', token('--accent'))}<span class="t">${esc(p.name)}<small>${esc((p.dossier && p.dossier.summary) || '')}</small></span><span class="d"></span></button></li>`).join('');
    this.set(this.W.lineages, `<div class="series-tag">${esc(ln.tradition || 'Line')}</div><h2>${esc(ln.title)}</h2>
      ${ln.summary ? `<p class="lead">${esc(ln.summary)}</p>` : ''}${this.conflict(ln.conflict)}<ul class="list">${rows}</ul>${this.sources(ln.sources)}`, this.back('#/lineages', 'All lineages'));
  }
  office(o) {
    const rows = o.holders.map((h) => `<li><button class="row" data-go="#/p/${enc(h.p.k)}">${this.chip('HELD', token('--frame-hi'))}
      <span class="t">${esc(h.p.name)}<small>${esc(h.note || h.how || '')}</small></span><span class="d">${esc(span(h.from && h.from.tText, h.to && h.to.tText))}</span></button></li>`).join('');
    this.set(this.W.lineages, `<div class="series-tag">${esc(o.polity || 'Office')}</div><h2>${esc(o.title)}</h2>
      ${o.summary ? `<p class="lead">${esc(o.summary)}</p>` : ''}${this.conflict(o.conflict)}<ul class="list">${rows}</ul>${this.sources(o.sources)}`, this.back('#/lineages', 'All lineages'));
  }

  // ── a relic ───────────────────────────────────────────────────────
  relic(a) {
    const rows = a.custody.map((c) => `<li><button class="row" data-go="#/p/${enc(c.p.k)}">${this.chip((c.how || 'held').split(' ')[0].toUpperCase().slice(0, 8), token('--frame-hi'))}
      <span class="t">${esc(c.p.name)}<small>${esc(c.note || '')}</small></span><span class="d">${esc(span(c.from && c.from.tText, c.to && c.to.tText))}</span></button></li>`).join('');
    const html = `<div class="series-tag">${esc(a.kind || 'Relic')}</div><h2>${esc(a.name || a.title)}</h2>
      <div class="cells">${cell('Made', a.made && (a.made.tText || a.made.yText), 'loc')}${cell('Made by', a.made && a.made.by)}${cell('Fate', a.fate && (a.fate.text || a.fate.tText))}</div>
      <p class="lead">${esc(a.summary || '')}</p>${this.conflict(a.conflict)}
      <h3>Chain of custody</h3><ul class="list">${rows}</ul>
      ${a.srcRecs.length ? `<h3>Seen on screen in</h3><ul class="list">${a.srcRecs.map((r) => this.recRow(r, r.tt)).join('')}</ul>` : ''}
      ${this.sources(a.sources)}
      <div class="btnrow">${a.wp ? `<a class="btn" href="${WP(a.wp)}" target="_blank" rel="noopener">Wookieepedia</a>` : ''}</div>`;
    this.set(this.W.relics, html, this.back('#/relics', 'All relics'));
  }

  // ── a contested record ────────────────────────────────────────────
  anomaly(x) {
    const acc = (x.accounts || []).map((a) => `<li><b>${esc(a.claim)}</b>${a.source ? ` <span class="note">(${esc(a.source)})</span>` : ''}</li>`).join('');
    const html = `<div class="series-tag"><i style="background:${token('--conflict')}"></i>${esc((x.kind || '').replace(/-/g, ' '))}</div><h2>${esc(x.title)}</h2>
      <div class="cells">${cell('When', x.tText, 'loc')}</div>
      <p class="lead">${esc(x.summary || '')}</p>
      ${acc ? `<h3>The accounts</h3><ul>${acc}</ul>` : ''}
      ${x.resolution ? `<h3>Where it stands</h3><p>${esc(x.resolution)}</p>` : ''}
      ${x.srcRecs.length ? `<h3>Entries involved</h3><ul class="list">${x.srcRecs.map((r) => this.recRow(r, r.tt)).join('')}</ul>` : ''}
      ${this.sources(x.sources)}`;
    this.set(this.W.anomaly, html, this.back('#/anomalies', 'All contested'));
  }

  // ── registries ────────────────────────────────────────────────────
  list(mode) {
    const S = this.S, W = this.W;
    if (mode === 'visions') {
      const groups = Object.keys(VISION_KINDS).map((k) => [k, S.visions.filter((v) => v.kind === k)]).filter(([, a]) => a.length);
      this.set(`${W.visions}: ${S.visions.length}`, S.visions.length ? `<p class="note">Arcs run from the moment a vision is seen, or a crossing made, to the moment it shows or reaches. Solid arcs are visions and crossings; dotted arcs are Force spirits and messages sent across years.</p>
        ${groups.map(([k, a]) => `<h3>${esc(VISION_KINDS[k].label)}</h3><ul class="list">${a.map((v) => this.visRow(v)).join('')}</ul>`).join('')}` : this.pending(W.visions));
    } else if (mode === 'lineages') {
      const trees = S.trees.map((t) => `<li><button class="row" data-go="#/l/${enc(t.id)}">${this.chip((t.tradition || 'LINE').toUpperCase().slice(0, 8), /sith/i.test(t.tradition) ? token('--conflict') : token('--accent'))}
        <span class="t">The line of ${esc(t.root.name)}<small>${t.members.slice(1, 7).map((m) => esc(m.p.name)).join(', ')}${t.size > 7 ? '…' : ''}</small></span><span class="d">${t.size}</span></button></li>`).join('');
      const lines = S.lines.map((ln) => `<li><button class="row" data-go="#/ln/${enc(ln.id)}">${this.chip('LINE', token('--frame-hi'))}<span class="t">${esc(ln.title)}<small>${esc(ln.summary || '')}</small></span><span class="d">${ln.persons.length}</span></button></li>`).join('');
      const offices = S.offices.map((o) => `<li><button class="row" data-go="#/o/${enc(o.id)}">${this.chip('OFFICE', token('--frame-hi'))}<span class="t">${esc(o.title)}<small>${esc(o.holders.map((h) => h.p.name).slice(0, 5).join(', '))}${o.holders.length > 5 ? '…' : ''}</small></span><span class="d">${o.holders.length}</span></button></li>`).join('');
      this.set(`${W.lineages}`, trees || lines || offices ? `${lines ? `<h3>Named lines</h3><ul class="list">${lines}</ul>` : ''}${trees ? `<h3>Master and apprentice</h3><ul class="list">${trees}</ul>` : ''}${offices ? `<h3>Offices and succession</h3><ul class="list">${offices}</ul>` : ''}` : this.pending(W.lineages));
    } else if (mode === 'relics') {
      this.set(`${W.relics}: ${S.artifacts.length}`, S.artifacts.length ? `<p class="note">Each relic's chain of custody, holder by holder. Marks on the stacks show the entries where it appears on screen.</p><ul class="list">${S.artifacts.map((a) => this.artRow(a)).join('')}</ul>` : this.pending(W.relics));
    } else if (mode === 'personnel') {
      this.set(`${W.personnel}`, `<input class="filter" type="search" placeholder="Filter by name" data-filter="people" value="${esc(this.state.fileQ)}" aria-label="Filter archive files"><div class="plist-body"></div>`);
      this.renderPeople();
    } else if (mode === 'records') {
      const codes = Object.keys(S.series).filter((c) => S.bySeries.has(c) && (S.legendsOn || !['CW03', 'DRD', 'EWK', 'LFLM'].includes(c)));
      if (!codes.includes(this.state.recTab)) this.state.recTab = codes[0];
      const tabs = codes.map((c) => `<button data-act="rtab" data-c="${c}" aria-pressed="${c === this.state.recTab}">${esc(S.series[c].replace(/^Star Wars:? /, ''))}</button>`).join('');
      const arr = S.bySeries.get(this.state.recTab) || [];
      this.set(`${W.records}: ${S.records.filter((r) => S.legendsOn || !r.leg).length}`, `<div class="tabs">${tabs}</div><p class="note">In release order. Each entry's in-universe year is on the right.</p><ul class="list">${arr.map((r) => this.recRow(r, r.tt)).join('')}</ul>`);
    } else if (mode === 'anomalies') {
      const conf = [...S.events, ...S.visions].filter((x) => x.conflict);
      this.set(`${W.anomalies}: ${S.anomalies.length + conf.length}`, `${S.anomalies.length ? `<ul class="list">${S.anomalies.map((x) => this.anRow(x)).join('')}</ul>` : ''}
        ${conf.length ? `<h3>Disputed dates and details</h3><p class="note">Entries whose sources disagree. The red marks on the stacks.</p><ul class="list">${conf.map((x) => (x.$ === 'e' ? this.evRow(x) : this.visRow(x))).join('')}</ul>` : ''}
        ${!S.anomalies.length && !conf.length ? this.pending(W.anomalies) : ''}`);
    } else if (mode === 'map') {
      const top = S.places.filter((w) => w.g).slice(0, 60);
      this.set(`${W.map}: ${S.places.filter((w) => w.g).length} worlds charted`, `<p class="note">Worlds sit at their squares on the Standard Galactic Grid. They light up when something on record happens there during the span shown on the era ribbon, so drag the ribbon window to move the whole galaxy through time.</p>
        <h3>Most visited worlds</h3><ul class="list">${top.map((w) => `<li><button class="row" data-go="#/w/${enc(w.k)}">${this.chip(w.g || '—', token('--accent'))}<span class="t">${esc(w.k)}<small>${esc(w.r || '')}</small></span><span class="d">${w.n}</span></button></li>`).join('')}</ul>`);
    } else if (mode === 'about') {
      this.about();
    }
  }
  pending(what) { return `<p class="note">${esc(what)} are still being compiled for this archive. They arrive with the next update of the data.</p>`; }

  renderPeople() {
    const box = this.body.querySelector('.plist-body');
    if (!box) return;
    const S = this.S, q = norm(this.state.fileQ);
    let list = S.people.filter((p) => (p.dossier || p.recs.length >= 3) && (!q || norm(p.name).includes(q) || norm(p.k).includes(q)));
    list.sort((a, b) => (b.dossier ? 1 : 0) - (a.dossier ? 1 : 0) || b.recs.length - a.recs.length);
    const files = list.filter((p) => p.dossier), others = list.filter((p) => !p.dossier).slice(0, q ? 200 : 120);
    box.innerHTML = `${files.length ? `<h3>Principal files</h3><div class="chips">${files.map((p) => this.personChip(p)).join('')}</div>` : ''}
      <h3>${q ? 'Everyone matching' : 'Most seen'}</h3><div class="chips">${others.map((p) => this.personChip(p, ` <small>${p.recs.length}</small>`)).join('')}</div>`;
  }

  about() {
    const S = this.S, m = S.meta;
    this.set('About', `<h2>About this archive</h2>
      <p class="lead">Every canon Star Wars film and series episode, placed at its in-universe date on one timeline you can zoom from the founding of the Republic to after the First Order.</p>
      <p>Records follow Wookieepedia's in-universe order of canon media, so entries in the same year keep their true sequence. The chronicle, visions, lineages, relics and contested records are compiled from Wookieepedia's articles and summarized in the archive's own words, with their sources listed.</p>
      <p>The Legends button adds the pre-2014 continuity as its own layer: the 2003 Clone Wars, Droids, Ewoks, the Holiday Special and the Ewok films, and the Legends chronicle, which runs from the Rakatan age to the Legacy era.</p>
      <h3>Four archives</h3>
      <p>The record can be read through four different archives, each with its own look and voice. The Jedi Archives are open now; the Resistance's intelligence files, the Imperial vault on Scarif and the Journal of the Whills follow.</p>
      <h3>Dating</h3>
      <p>Years count from the Battle of Yavin: BBY before it, ABY after. The time axis is compressed where little happens on record and opened out where the saga is dense, so the Clone Wars and the Empire's reign take the most room. Deep time is logarithmic.</p>
      <dl class="kv"><dt>Entries</dt><dd>${S.records.filter((r) => !r.leg).length} canon, ${S.records.filter((r) => r.leg).length} Legends</dd><dt>Names</dt><dd>${S.people.length.toLocaleString('en-US')}</dd><dt>Worlds</dt><dd>${S.places.length} (${S.places.filter((w) => w.g).length} on the grid)</dd><dt>Built</dt><dd>${esc(m.built)}</dd></dl>
      <p class="fine">An unofficial fan reference, not affiliated with Lucasfilm or Disney. Star Wars and its characters are trademarks of Lucasfilm Ltd. Data from Wookieepedia (starwars.fandom.com), licensed CC BY-SA 3.0; portraits are Wookieepedia's lead images. Aurebesh font by SilvinoR (SIL OFL 1.1).</p>`);
  }

  // ── interactions inside the panel ─────────────────────────────────
  onClick(e) {
    const a = e.target.closest('[data-act]');
    if (!a) return;
    const act = a.dataset.act;
    if (act === 'more') { const w = a.parentElement.querySelector('.more-wrap'); if (w) w.hidden = false; a.remove(); }
    else if (act === 'hint-ok') { try { localStorage.setItem('swt-hint', '1'); } catch (_) { /* storage blocked */ } a.closest('.statusnote').remove(); }
    else if (act === 'fit-rec') { const r = this.S.recById.get(a.dataset.id); if (r) this.field.bringIntoView(r.t, 0.6); }
    else if (act === 'fit-t') this.field.bringIntoView(+a.dataset.t, 3);
    else if (act === 'fit-p') this.onFit && this.onFit();
    else if (act === 'list-p') { const l = this.body.querySelector('.plist'); if (l) { l.hidden = !l.hidden; a.textContent = l.hidden ? 'Every entry' : 'Hide the list'; } }
    else if (act === 'rtab') { this.state.recTab = a.dataset.c; this.list('records'); }
    else if (act === 'world-stacks') this.onWorldStacks && this.onWorldStacks(a.dataset.k);
  }
  onInput(e) {
    const f = e.target.closest('[data-filter="people"]');
    if (f) { this.state.fileQ = f.value; this.renderPeople(); }
  }
}

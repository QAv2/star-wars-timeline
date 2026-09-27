// Skin 3 — the Imperial archive, the Citadel vault on Scarif. Vocabulary, gate and voice; the look lives in skin.css.
// The gate is a tape-bank retrieval: a clearance scan runs down the racks while the archive loads, then the
// arm travels to one slot and pulls the tape. The proclamation's redactions lift once clearance is granted.
const TARGET = 34;   // the slot the arm pulls from (1-based, six to a row)
const slots = Array.from({ length: 60 }, (_, i) => `<i${[5, 17, 26, 41, 50, 58].includes(i) ? ' class="lit"' : ''}></i>`).join('');

export default {
  id: 'imperial',
  name: 'Imperial archive',
  org: 'Citadel Tower, Scarif',
  glyph: 'imperial archive',
  title: 'Imperial archive: a Star Wars timeline',
  vantage: { event: 'battle-of-scarif', t: -0.1, label: 'The vault falls: Scarif, 1 BBY' },
  gate: {
    art: `<div class="vault" style="--target:${TARGET}"><div class="rack">${slots}</div><div class="scan"></div>
      <div class="arm"><b class="claw"></b></div><div class="tape"><span>stardust</span></div></div>`,
    sub: 'Citadel Tower, Scarif',
    quote: 'In order to ensure the security and continuing stability, the Republic will be reorganized into <span class="redact">the first Galactic Empire</span>! For <span class="redact">a safe and secure society</span>!',
    cite: 'Palpatine, proclaiming the Empire',
    go: 'Enter the vault',
    steps: [
      'Verifying clearance',
      (S) => `${S.records.length} data tapes and ${S.people.length.toLocaleString('en-US')} subject names on file`,
      (S) => `${S.events.length} registry entries in sequence`,
      (S) => `${S.places.filter((p) => p.g).length} systems on the Imperial survey`,
      'Tape retrieved. Access granted.',
    ],
    openMs: 1000,
    fail: 'Retrieval failed. Reload to try again.',
  },
  words: {
    continuum: 'Master index', field: 'the index', visions: 'Phenomena', lineages: 'Succession', relics: 'Artifacts', personnel: 'Subject files',
    map: 'Imperial survey', records: 'Data tapes', anomalies: 'Discrepancies', about: 'Access notes',
    record: 'Data tape', event: 'Registry entry', history: 'Official record', legends: 'Legends',
    inView: 'On file', person: 'Subject file', anomaly: 'Discrepancy',
    search: 'Query the index: a title, a name, a system, a year, or an incident',
    orient: 'Drag the index to move through time; scroll or pinch to zoom. Select any mark to pull its tape. Press / to query, or describe an incident in plain words. The lit window on the strip above shows the span on screen against all of galactic time.',
  },
  // relays and servos
  voices: { select: [[523, 0], [392, 0.06]], nav: [[440, 0], [440, 0.09]], soft: [[659, 0]], deny: [[147, 0], [139, 0.1]] },
  wave: 'sawtooth',
};

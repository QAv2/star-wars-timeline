// Skin 2 — Resistance intelligence. Vocabulary, gate and voice; the look lives in skin.css.
// The gate is the trench-run targeting computer: sections of the trench fly past while the files decrypt,
// and the reticle closes and locks when they are open.
const sections = [0, 1, 2, 3, 4, 5].map((i) => `<rect class="sec" style="animation-delay:${(-i * 0.3).toFixed(1)}s" x="8" y="8" width="184" height="184"/>`).join('');

export default {
  id: 'resistance',
  name: 'Resistance intelligence',
  org: 'Ajan Kloss, 35 ABY',
  glyph: 'resistance intelligence',
  title: 'Resistance intelligence: a Star Wars timeline',
  vantage: { t: 35.9, label: 'Now: Ajan Kloss, 35 ABY' },
  gate: {
    art: `<div class="tc"><svg class="trench" viewBox="0 0 200 200" aria-hidden="true">
      <path class="walls" d="M8 8 L86 86 M192 8 L114 86 M8 192 L86 114 M192 192 L114 114"/>
      <rect class="far" x="86" y="86" width="28" height="28"/><g>${sections}</g></svg>
      <div class="reticle"><i class="l"></i><i class="r"></i><b></b></div>
      <div class="range"></div><div class="lock">Locked</div></div>`,
    sub: 'Ajan Kloss, 35 ABY',
    quote: 'We are the spark that’ll light the fire that’ll burn the First Order down.',
    cite: 'Poe Dameron, the Resistance',
    go: 'Open the files',
    steps: [
      'Decrypting the files',
      (S) => `${S.records.length} field reports and ${S.people.length.toLocaleString('en-US')} names cross-referenced`,
      (S) => `${S.events.length} logged events put in sequence`,
      (S) => `${S.places.filter((p) => p.g).length} worlds plotted on the galaxy map`,
      'Target locked. The files are open.',
    ],
    openMs: 900,
    fail: 'The files would not decrypt. Reload to try again.',
  },
  words: {
    continuum: 'The board', field: 'the board', visions: 'Force sightings', lineages: 'Lineages', relics: 'Custody logs', personnel: 'Dossiers',
    map: 'Galaxy map', records: 'Field reports', anomalies: 'Disputed', about: 'Briefing',
    record: 'Field report', event: 'Logged event', history: 'Record', legends: 'Legends',
    inView: 'On the board', person: 'Dossier', anomaly: 'Disputed intel',
    search: 'Query the files: a title, a name, a world, a year, or what happened',
    orient: 'Drag the board to move through time; scroll or pinch to zoom. Select any mark to open its report. Press / to query the files, or describe an episode in plain words. The lit window on the strip above shows where you are in all of galactic time.',
  },
  // targeting-computer blips
  voices: { select: [[1568, 0], [2093, 0.05]], nav: [[1175, 0], [1568, 0.05]], soft: [[2637, 0]], deny: [[311, 0], [233, 0.1]] },
  wave: 'square',
};

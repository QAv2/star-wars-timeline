// Skin 4 — the Journal of the Whills. Vocabulary, gate and voice; the look lives in skin.css.
// Read from outside time, so there is no vantage. The gate is the World Between Worlds: paths of light
// in the void, doorways that wake while the Journal opens, and the golden door you step through.
let seed = 11;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;   // same sky every visit
const stars = Array.from({ length: 90 }, () => `<circle cx="${(rnd() * 300).toFixed(1)}" cy="${(rnd() * 300).toFixed(1)}" r="${(rnd() * 0.8 + 0.25).toFixed(2)}" opacity="${(rnd() * 0.6 + 0.2).toFixed(2)}"/>`).join('');
const PATHS = 'M150 300 L150 172 M150 236 L62 188 M150 236 L240 188 M150 204 L96 158 M150 204 L204 158 M62 188 L28 177 M240 188 L274 177';
const DOORS = [[62, 166, 13, 22], [240, 166, 13, 22], [96, 144, 8, 14], [204, 144, 8, 14], [28, 166, 6, 11], [274, 166, 6, 11]];

export default {
  id: 'whills',
  name: 'Journal of the Whills',
  org: 'Outside time',
  glyph: 'journal of the whills',
  title: 'Journal of the Whills: a Star Wars timeline',
  vantage: null,
  gate: {
    art: `<svg class="wbw" viewBox="0 0 300 300" aria-hidden="true">
      <defs><radialGradient id="wbw-glow"><stop offset="0" stop-color="#fff6d8" stop-opacity=".9"/><stop offset=".55" stop-color="#e8c66a" stop-opacity=".25"/><stop offset="1" stop-color="#e8c66a" stop-opacity="0"/></radialGradient></defs>
      <g class="sky">${stars}</g>
      <path class="walk" d="${PATHS}"/><path class="flow" d="${PATHS}"/>
      ${DOORS.map(([x, y, rx, ry], i) => `<ellipse class="door" style="animation-delay:${(i * 0.45).toFixed(2)}s" cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/>`).join('')}
      <ellipse class="light" cx="150" cy="128" rx="30" ry="40" fill="url(#wbw-glow)"/>
      <ellipse class="door main" cx="150" cy="128" rx="34" ry="44"/><ellipse class="door inner" cx="150" cy="128" rx="24" ry="32"/></svg>`,
    sub: 'Outside time',
    quote: 'I’m one with the Force; the Force is with me.',
    cite: 'Chirrut Îmwe, Guardian of the Whills',
    go: 'Step through',
    steps: [
      'The Journal opens',
      (S) => `${S.records.length} doorways and ${S.people.length.toLocaleString('en-US')} lives recorded`,
      (S) => `${S.events.length} passages of the chronicle in order`,
      (S) => `${S.places.filter((p) => p.g).length} worlds among the stars`,
      'Every moment is a doorway',
    ],
    openMs: 1100,
    fail: 'The way would not open. Reload to try again.',
  },
  words: {
    continuum: 'The Journal', field: 'the Journal', visions: 'Visions', lineages: 'Lineages', relics: 'Relics', personnel: 'Lives',
    map: 'The stars', records: 'Doorways', anomalies: 'Unsettled', about: 'About',
    record: 'Doorway', event: 'Passage', history: 'Chronicle', legends: 'Legends',
    inView: 'Before you', person: 'A life', anomaly: 'Unsettled',
    search: 'Seek a moment: a title, a name, a world, a year, or what happens',
    orient: 'Drag the Journal to move through time; scroll or pinch to zoom. Every mark is a doorway: select one to step through. Press / to seek, or describe a moment in plain words. The lit window on the band above shows where you stand in all of time.',
  },
  // struck crystal, fifths
  voices: { select: [[1047, 0], [1568, 0.1]], nav: [[784, 0], [1175, 0.09]], soft: [[2093, 0]], deny: [[415, 0], [392, 0.14]] },
  wave: 'sine',
};

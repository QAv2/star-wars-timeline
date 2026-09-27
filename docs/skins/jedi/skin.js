// Skin 1 — the Jedi Archives. Vocabulary, gate and voice; the look lives in skin.css.
const face = (n) => `<div class="face f${n}"></div>`;

export default {
  id: 'jedi',
  name: 'Jedi Archives',
  org: 'Jedi Temple, Coruscant',
  glyph: 'jedi archives',
  title: 'Jedi Archives: a Star Wars timeline',
  vantage: { event: 'operation-knightfall', t: -18.71, label: 'The Temple falls: Coruscant, 19 BBY' },
  gate: {
    art: `<div class="holo-halo"></div><div class="holo-core"></div><div class="cube">${[1, 2, 3, 4, 5, 6].map(face).join('')}</div>`,
    sub: 'The Jedi Temple, Coruscant',
    quote: 'If an item does not appear in our records, it does not exist.',
    cite: 'Jocasta Nu, Chief Librarian of the Jedi Archives',
    go: 'Open the holocron',
    steps: [
      'Reading the stacks',
      (S) => `${S.records.length} holocron entries and ${S.people.length.toLocaleString('en-US')} names indexed`,
      (S) => `${S.events.length} chronicle entries set in order`,
      (S) => `${S.places.filter((p) => p.g).length} worlds charted on the star map`,
      'The archive is open to you',
    ],
    openMs: 950,
    fail: 'The holocron would not open. Reload to try again.',
  },
  words: {
    continuum: 'The stacks', field: 'the stacks', visions: 'Visions', lineages: 'Lineages', relics: 'Relics', personnel: 'Archive files',
    map: 'Star map', records: 'Entries', anomalies: 'Contested', about: 'About',
    record: 'Holocron entry', event: 'Chronicle entry', history: 'Chronicle', legends: 'Legends',
    inView: 'On the shelves', person: 'Archive file', anomaly: 'Contested record',
    search: 'Search the archives: a title, a name, a world, a year, or what happens',
    orient: 'Drag the stacks to move through time and scroll or pinch to zoom. Click any mark to read its entry. Press / to search, or describe an episode in plain words. The lit window on the ribbon above shows where you are in all of galactic time.',
  },
  // soft temple chimes, synthesized
  voices: { select: [[988, 0], [1480, 0.07]], nav: [[740, 0], [988, 0.06]], soft: [[1318, 0]], deny: [[330, 0], [247, 0.09]] },
  wave: 'triangle',
};

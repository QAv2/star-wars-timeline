// The four archives that can read the record. Each is a skin: tokens + ornament (skin.css),
// vocabulary, gate and voice (skin.js). One arrives per build; the rest stay sealed until then.
export const SKINS = [
  { id: 'jedi', name: 'Jedi Archives', desc: 'The Temple library on Coruscant, in holocron light and bronze.', ready: true },
  { id: 'resistance', name: 'Resistance intelligence', desc: 'The war-room vector display at Ajan Kloss, 35 ABY.', ready: false },
  { id: 'imperial', name: 'Imperial archive', desc: 'The Citadel vault on Scarif: clearances, redactions, tape banks.', ready: false },
  { id: 'whills', name: 'Journal of the Whills', desc: 'Read from outside time, where every moment is a doorway.', ready: false },
];

export async function loadSkin(id) {
  const s = SKINS.find((x) => x.id === id && x.ready) || SKINS[0];
  const m = await import(`./${s.id}/skin.js`);
  return m.default;
}

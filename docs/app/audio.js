// Console chimes, synthesized (no sampled sound files). The active skin supplies the voices.
// Off until the viewer turns them on.
let ctx = null, on = false, skin = null;
try { on = localStorage.getItem('swt-audio') === 'on'; } catch (_) { /* storage blocked */ }

export function audioOn() { return on; }
export function setAudio(v) {
  on = v;
  try { localStorage.setItem('swt-audio', v ? 'on' : 'off'); } catch (_) { /* storage blocked */ }
}
export function setVoices(s) { skin = s; }

export function chirp(kind = 'select') {
  if (!on || !skin) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    const t0 = ctx.currentTime;
    for (const [f, dt] of skin.voices[kind] || skin.voices.select) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = skin.wave || 'sine';
      o.frequency.setValueAtTime(f, t0 + dt);
      g.gain.setValueAtTime(0.0001, t0 + dt);
      g.gain.exponentialRampToValueAtTime(0.08, t0 + dt + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dt + 0.22);
      o.connect(g).connect(ctx.destination);
      o.start(t0 + dt); o.stop(t0 + dt + 0.24);
    }
  } catch (_) { /* audio unavailable */ }
}

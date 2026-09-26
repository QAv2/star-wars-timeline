// The galactic projection.
// In-universe time t is a number of standard years: BBY negative, ABY positive, and the year of the
// Battle of Yavin is 0. A year Y occupies [Y, Y+1), so "19 BBY" is -19 ≤ t < -18.
// Deep time is logarithmic in years-before-200-ABY; the ages with stories on record are linear,
// each given width in proportion to how much of the saga happens there.

const YB_REF = 200;

export const SEGMENTS = [
  { id: 'deep', label: 'Before the Republic', short: 'Before the Republic', t0: -1.5e10, t1: -25025, mode: 'log', w: 0.04 },
  { id: 'old', label: 'The Old Republic', short: 'Old Republic', t0: -25025, t1: -1032, mode: 'log', w: 0.075 },
  { id: 'reform', label: 'The Republic reformed', short: 'Reformation', t0: -1032, t1: -500, mode: 'lin', w: 0.03 },
  { id: 'hr', label: 'The High Republic', short: 'High Republic', t0: -500, t1: -100, mode: 'lin', w: 0.11 },
  { id: 'fall', label: 'Fall of the Jedi', short: 'Fall of the Jedi', t0: -100, t1: -22, mode: 'lin', w: 0.075 },
  { id: 'cw', label: 'The Clone Wars', short: 'Clone Wars', t0: -22, t1: -19, mode: 'lin', w: 0.15 },
  { id: 'empire', label: 'Reign of the Empire', short: 'Empire', t0: -19, t1: 0, mode: 'lin', w: 0.19 },
  { id: 'rebellion', label: 'Age of Rebellion', short: 'Rebellion', t0: 0, t1: 5, mode: 'lin', w: 0.075 },
  { id: 'nr', label: 'The New Republic', short: 'New Republic', t0: 5, t1: 29, mode: 'lin', w: 0.1 },
  { id: 'fo', label: 'The First Order', short: 'First Order', t0: 29, t1: 36, mode: 'lin', w: 0.07 },
  { id: 'after', label: 'Thereafter', short: 'Thereafter', t0: 36, t1: 150, mode: 'lin', w: 0.035 },
];
{
  const total = SEGMENTS.reduce((a, s) => a + s.w, 0);
  let acc = 0;
  for (const s of SEGMENTS) { s.w /= total; s.u0 = acc; acc += s.w; s.u1 = acc; }
  SEGMENTS[SEGMENTS.length - 1].u1 = 1;
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lg = (t) => Math.log10(YB_REF - t);

export function tToU(t) {
  if (!(t > SEGMENTS[0].t0)) return 0;
  for (const s of SEGMENTS) {
    if (t <= s.t1) {
      const f = s.mode === 'log' ? (lg(s.t0) - lg(t)) / (lg(s.t0) - lg(s.t1)) : (t - s.t0) / (s.t1 - s.t0);
      return s.u0 + f * s.w;
    }
  }
  return 1;
}

export function uToT(u) {
  u = clamp(u, 0, 1);
  for (const s of SEGMENTS) {
    if (u <= s.u1) {
      const f = (u - s.u0) / s.w;
      if (s.mode === 'log') {
        const a = lg(s.t0), b = lg(s.t1);
        return YB_REF - Math.pow(10, a - f * (a - b));
      }
      return s.t0 + f * (s.t1 - s.t0);
    }
  }
  return SEGMENTS[SEGMENTS.length - 1].t1;
}

export function segmentOf(t) {
  for (const s of SEGMENTS) if (t <= s.t1) return s;
  return SEGMENTS[SEGMENTS.length - 1];
}
export const eraLabel = (t) => segmentOf(t).label;

const num = (n) => Math.round(n).toLocaleString('en-US');
function trim(n, d) { return Number(n.toFixed(d)).toString(); }

/** The label for a whole year index y (floor of t). */
export function yearLabel(y) {
  return y < 0 ? `${num(-y)} BBY` : `${num(y)} ABY`;
}

/** Human label for a moment; `res` is the display resolution in years (smaller = finer). */
export function fmtTime(t, res = 1) {
  if (t < -1e5) {
    const yb = -t;
    if (yb >= 1e9) return `eons before the Republic`;
    if (yb >= 1e6) return `c. ${trim(yb / 1e6, yb >= 1e7 ? 0 : 1)} million BBY`;
    return `c. ${num(Math.round(yb / 1000) * 1000)} BBY`;
  }
  if (t < -2000) return `c. ${num(Math.round(-t / 100) * 100)} BBY`;
  const y = Math.floor(t);
  if (res < 0.34) {
    const f = t - y;
    return `${f < 0.34 ? 'Early' : f < 0.67 ? 'Mid' : 'Late'} ${yearLabel(y)}`;
  }
  return yearLabel(y);
}

/**
 * Axis ticks for the visible window. `xOfU` maps u to screen x.
 * Returns [{x, label, major, boundary?, seg?}] with labels spaced at least `minGap` px apart.
 */
export function ticks(xOfU, px0, px1, minGap = 70) {
  const out = [];
  for (const s of SEGMENTS) {
    const sx0 = xOfU(s.u0), sx1 = xOfU(s.u1);
    if (sx1 < px0 || sx0 > px1) continue;
    const segW = sx1 - sx0;
    out.push({ x: sx0, label: null, major: true, boundary: true, seg: s });
    if (s.mode === 'log') {
      const cands = s.id === 'deep'
        ? [-1e10, -1e9, -1e8, -1e7, -1e6, -1e5, -5e4]
        : [-2e4, -1.5e4, -1e4, -7000, -5000, -4000, -3000, -2000, -1500];
      let last = -1e9;
      for (const t of cands) {
        if (t <= s.t0 || t >= s.t1) continue;
        const x = xOfU(tToU(t));
        if (x < px0 - 40 || x > px1 + 40) continue;
        if (x - last < minGap || x - sx0 < 30 || sx1 - x < 30) continue;
        out.push({ x, label: shortLabel(t), major: false });
        last = x;
      }
      continue;
    }
    const pxPerYear = segW / (s.t1 - s.t0);
    const steps = [100, 50, 25, 10, 5, 2, 1, 0.25];
    let step = steps[0];
    for (const st of steps) { if (st * pxPerYear >= minGap) step = st; else break; }
    const visT0 = s.t0 + ((Math.max(px0, sx0) - sx0) / segW) * (s.t1 - s.t0);
    const visT1 = s.t0 + ((Math.min(px1, sx1) - sx0) / segW) * (s.t1 - s.t0);
    const start = Math.ceil((visT0 - 1e-9) / step) * step;
    for (let t = start; t <= visT1 + 1e-9; t += step) {
      if (t <= s.t0 + 1e-6 || t >= s.t1 - 1e-6) continue;
      const x = sx0 + (t - s.t0) * pxPerYear;
      const whole = Math.abs(t - Math.round(t)) < 1e-6;
      if (!whole) { out.push({ x, label: null, major: false }); continue; }
      const y = Math.round(t);
      out.push({ x, label: y === 0 ? 'Yavin' : yearLabel(y), major: y % (step * 5 >= 1 ? step * 5 : 1) === 0 || y === 0 });
    }
  }
  return out;
}

function shortLabel(t) {
  const yb = -t;
  if (yb >= 1e9) return `${trim(yb / 1e9, 1)}B BBY`;
  if (yb >= 1e6) return `${trim(yb / 1e6, 1)}M BBY`;
  if (yb >= 1e4) return `${Math.round(yb / 1e3)}k BBY`;
  return `${num(yb)} BBY`;
}

/** Boundary label shown on the axis where the projection changes rate. */
export function boundaryLabel(seg) {
  if (seg.t0 <= -1e5) return null;
  if (seg.t0 === 0) return 'Yavin';
  return yearLabel(Math.round(seg.t0));
}

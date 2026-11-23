// A tiny seeded RNG (mulberry32): one seed rebuilds the same city, traffic and shots.
// Determinism is load-bearing, not a convenience: the staged screenshots and the
// test rig pin seed 7, so a scene that passed once renders identically on a rerun.

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function rngRange(rng, lo, hi) { return lo + rng() * (hi - lo); }
export function rngInt(rng, lo, hi) { return Math.floor(rngRange(rng, lo, hi + 1)); }
export function rngPick(rng, arr) { return arr[Math.floor(rng() * arr.length) % arr.length]; }

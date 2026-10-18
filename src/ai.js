import { actions, apply, distances, key } from "./engine.js";
export function seeded(seed = 1) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function evaluate(s, p) {
  if (s.winner !== null) return s.winner === p ? 100000 : -100000;
  const a = distances(s, p),
    b = distances(s, 1 - p);
  let value = (s.scores[p] - s.scores[1 - p]) * 700;
  for (const star of s.stars) {
    const da = Math.min(8, a[star]),
      db = Math.min(8, b[star]);
    value += (db - da) * 9 + (da === 1 ? 85 : 0) - (db === 1 ? 100 : 0);
  }
  return value;
}
// Beam-limited two-ply minimax. Opponent replies are searched with early rejection of weak candidates.
export function choose(
  s,
  { level = "search", rng = Math.random, seen = new Map(), beam = 8 } = {},
) {
  const all = actions(s);
  if (!all.length) return null;
  if (level === "random") return all[Math.floor(rng() * all.length)];
  const p = s.turn;
  const ranked = all
    .map((a) => {
      const n = apply(s, a);
      return {
        a,
        n,
        score: evaluate(n, p) - (seen.get(key(n)) || 0) * 130,
        tie: rng(),
      };
    })
    .sort((a, b) => b.score - a.score || a.tie - b.tie);
  if (level === "greedy" || ranked[0].n.winner === p) return ranked[0].a;
  let best = -Infinity,
    pick = ranked[0].a;
  for (const c of ranked.slice(0, beam)) {
    let worst = Infinity;
    for (const reply of actions(c.n)) {
      const n = apply(c.n, reply);
      worst = Math.min(worst, evaluate(n, p));
      if (worst < best - 150) break;
    }
    const value =
      worst * 0.88 + c.score * 0.12 - (seen.get(key(c.n)) || 0) * 130;
    if (value > best) {
      best = value;
      pick = c.a;
    }
  }
  return pick;
}

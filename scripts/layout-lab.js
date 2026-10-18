import fs from "node:fs";
import { actions, apply, mobility, distances } from "../src/engine.js";
import { choose, seeded } from "../src/ai.js";

// Candidate layouts are EXPERIMENTAL ONLY: never modify live LAYOUTS automatically.
// Pair i maps to squares i and 48-i; pair 6 contains player starts (6/42).
const trials = Number(process.env.LAYOUT_TRIALS ?? 600);
const pairs = Number(process.env.PAIRS ?? 16);
const limit = Number(process.env.MAX_PLIES ?? 65);
if (![trials, pairs, limit].every(Number.isInteger) ||
    trials < 1 || trials > 100000 || pairs < 1 || pairs > 100 || limit < 1 || limit > 500)
  throw Error("Bad candidate evaluation parameters");
const candidates = [];
const rng = seeded(20261018);
const squares = Array.from({ length: 24 }, (_, i) => i).filter((n) => n !== 6);
const select = (list, count) => {
  const arr = [...list];
  for (let i = 0; i < count; i++) {
    const j = i + Math.floor(rng() * (arr.length - i));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, count);
};
for (let trial = 0; trial < trials; trial++) {
  const starPairs = select(squares, 2);
  const wallPairs = select(squares.filter((n) => !starPairs.includes(n)), 4);
  const s = {
    walls: wallPairs.flatMap((i) => [i, 48 - i]),
    stars: [24, ...starPairs.flatMap((i) => [i, 48 - i])],
    players: [42, 6], scores: [0, 0], turn: 0, ply: 0, winner: null,
  };
  if (!mobility(s, 0).length || !mobility(s, 1).length) continue;
  const from0 = actions(s), from1 = actions({ ...s, turn: 1 });
  if (from0.length < 30 || from1.length < 30) continue;
  if (from0.some((a) => apply(s, a).scores[0] > 0) ||
      from1.some((a) => apply({ ...s, turn: 1 }, a).scores[1] > 0)) continue;
  const stops = new Set(from0.map((a) => apply(s, a).players[0]));
  if (stops.size < 5) continue;
  const reachable = s.stars.filter((star) => Number.isFinite(distances(s, 0)[star])).length;
  if (reachable < 3) continue;
  candidates.push({ trial, wallPairs, starPairs, walls: s.walls, stars: s.stars,
    legalMoves: from0.length, stoppingSquares: stops.size,
    reachableStars: reachable, rank: from0.length + stops.size * 4 + reachable * 12 });
}
candidates.sort((a, b) => b.rank - a.rank);
const evaluated = [];
for (const c of candidates) {
  const outcomes = [];
  for (let pair = 0; pair < pairs; pair++) for (let starter = 0; starter <= 1; starter++) {
    let s = { walls: [...c.walls], stars: [...c.stars], players: [42, 6],
      scores: [0, 0], turn: starter, ply: 0, winner: null };
    const random = seeded(1001 + pair * 13), seen = new Map();
    let firstMove = null;
    for (let p = 0; p < limit && s.winner === null; p++) {
      const a = choose(s, { level: "greedy", rng: random, seen });
      if (!a) break;
      if (firstMove === null) firstMove = JSON.stringify(a);
      s = apply(s, a);
    }
    outcomes.push({ winner: s.winner, first: s.winner === starter,
      ply: s.ply, firstMove });
  }
  const capped = outcomes.filter((o) => o.winner === null).length;
  const firstWins = outcomes.filter((o) => o.first).length;
  const meanPlies = outcomes.reduce((sum, o) => sum + o.ply, 0) / outcomes.length;
  const openingMoves = new Set(outcomes.map((o) => o.firstMove)).size;
  const accepted = capped <= 1 && firstWins >= pairs * .625 &&
    firstWins <= pairs * 1.375 && meanPlies >= 9 && meanPlies <= 22 &&
    openingMoves >= 12;
  evaluated.push({ ...c, games: outcomes.length, capped, firstWins,
    meanPlies: +meanPlies.toFixed(1), distinctFirstMoves: openingMoves, accepted });
}
const result = {
  source: "Layout search, not a deployed game feature",
  seed: 20261018, trials, pairs, maxPlies: limit,
  preliminaryPass: candidates.length, accepted: evaluated.filter((o) => o.accepted).length,
  warning: "AI policy/strict filtering are preliminary. Human fairness and strategic diversity unproven. No layout is deployed by this tool.",
  candidates: evaluated,
};
fs.mkdirSync("reports", { recursive: true });
const out = process.env.REPORT ?? "reports/layout-candidates.json";
fs.writeFileSync(out, JSON.stringify(result, null, 2) + "\n");
console.log(JSON.stringify({ trials, preliminaryPass: result.preliminaryPass,
  accepted: result.accepted, report: out }));

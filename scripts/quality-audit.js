import fs from "node:fs";
import { initial, actions, apply, key, LAYOUTS } from "../src/engine.js";
import { choose, seeded } from "../src/ai.js";

// Deterministic paired-seed experiment. The two players keep the same seats,
// but initiative is swapped. Capped games are NOT draws under the game rules.
const PAIRS = Number(process.env.PAIRS ?? 20);
const LIMIT = Number(process.env.MAX_PLIES ?? 120);
const MATCHUPS = (process.env.MATCHUPS ??
  "greedy/greedy,greedy/random,random/random,strong/greedy")
  .split(",").map((s) => s.split("/"));
const OUT = process.env.REPORT ?? "reports/quality-audit.json";
if (!Number.isInteger(PAIRS) || PAIRS < 1 || PAIRS > 500 ||
    !Number.isInteger(LIMIT) || LIMIT < 1 || LIMIT > 500)
  throw Error("PAIRS must be 1..500 and MAX_PLIES 1..500");
const known = new Set(["random", "greedy", "search", "strong"]);
if (MATCHUPS.some(([a, b, c]) => c !== undefined || !known.has(a) || !known.has(b)))
  throw Error("Unknown MATCHUPS policy");
const percentile = (arr, proportion) =>
  arr.length ? [...arr].sort((a, b) => a - b)[Math.ceil(arr.length * proportion) - 1] : null;
const started = Date.now();
const rows = [];
for (let layout = 0; layout < LAYOUTS.length; layout++) {
  for (const policies of MATCHUPS) {
    const games = [];
    for (let pair = 0; pair < PAIRS; pair++) {
      for (let starter = 0; starter <= 1; starter++) {
        // Same seed across initiative-swapped games.
        const seed = 173 + pair * 307 + layout * 791;
        const rng = seeded(seed), seen = new Map();
        let state = initial(layout, starter), wallMoves = 0, skips = 0;
        let repeat = false, noLegal = false, firstStar = null, tiedAtTwo = false;
        const opening = [];
        while (state.winner === null && state.ply < LIMIT) {
          const position = key(state);
          seen.set(position, (seen.get(position) || 0) + 1);
          if (seen.get(position) >= 3) repeat = true;
          if (actions(state).length === 0) { noLegal = true; break; }
          const action = choose(state, { level: policies[state.turn], rng, seen, beam: 8 });
          if (!action) { noLegal = true; break; }
          if (opening.length < 4)
            opening.push(JSON.stringify(action));
          if (action.wall) wallMoves++;
          else skips++;
          const next = apply(state, action);
          if (firstStar === null && next.stars.length !== state.stars.length)
            firstStar = next.ply;
          if (next.scores[0] === 2 && next.scores[1] === 2)
            tiedAtTwo = true;
          state = next;
        }
        games.push({
          seed, starter, winner: state.winner, capped: state.winner === null,
          plies: state.ply, scores: state.scores, firstStar, wallMoves, skips,
          repeat, noLegal, tiedAtTwo, opening: opening.join("|"),
          firstMove: opening[0] ?? null,
        });
      }
    }
    const decided = games.filter((g) => !g.capped);
    const row = {
      layoutId: layout,
      layout: LAYOUTS[layout].name,
      policies: policies.join("/"),
      games: games.length,
      firstWins: games.filter((g) => g.winner === g.starter).length,
      secondWins: games.filter((g) => g.winner !== null && g.winner !== g.starter).length,
      agent0Wins: games.filter((g) => g.winner === 0).length,
      decided: decided.length,
      capped: games.length - decided.length,
      meanPlies: +(games.reduce((sum, g) => sum + g.plies, 0) / games.length).toFixed(1),
      medianPlies: percentile(games.map((g) => g.plies), .5),
      p90Plies: percentile(games.map((g) => g.plies), .9),
      wallShare: +(games.reduce((sum, g) => sum + g.wallMoves, 0) /
        Math.max(1, games.reduce((sum, g) => sum + g.plies, 0))).toFixed(3),
      distinctFirstMoves: new Set(games.map((g) => g.firstMove)).size,
      distinctFourPlyOpenings: new Set(games.map((g) => g.opening)).size,
      firstStarMedianPly: percentile(games.flatMap((g) =>
        g.firstStar === null ? [] : [g.firstStar]), .5),
      tiedAtTwo: games.filter((g) => g.tiedAtTwo).length,
      threefoldGames: games.filter((g) => g.repeat).length,
      noLegalGames: games.filter((g) => g.noLegal).length,
    };
    rows.push(row);
    console.log(JSON.stringify(row));
  }
}
const result = {
  version: 1,
  generatedAt: new Date().toISOString(),
  commit: process.env.GITHUB_SHA ?? "local",
  methodology: "Paired seeds; same fixed 7x7 starting configuration and player cells; swap starting turn, not seat; per-game seeded RNG. Capped means unfinished measurement, NOT a draw. AI strengths are policy dependent. First-win rates are NOT human fairness estimates.",
  params: { pairsPerLayoutAndMatchup: PAIRS, maxPlies: LIMIT, matchups: MATCHUPS.map((a) => a.join("/")) },
  elapsedSeconds: +((Date.now() - started) / 1000).toFixed(1),
  totalGames: rows.reduce((sum, row) => sum + row.games, 0),
  rows,
};
fs.mkdirSync("reports", { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(result, null, 2) + "\n");
console.log("AUDIT_COMPLETE " + result.totalGames + " games in " + result.elapsedSeconds + "s; " + OUT);

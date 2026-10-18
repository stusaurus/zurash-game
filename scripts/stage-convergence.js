import fs from "node:fs";
import assert from "node:assert/strict";
import { SIZE, LAYOUTS, step, successors, key, actions, apply } from "../src/engine.js";
import { experimental } from "./experimental-policies.js";
import { seeded } from "../src/ai.js";
import { turnSeed } from "../src/cpu-seed.js";

// A reproducible, bounded research experiment; no production layout is ever changed.
const intParam = (name, fallback, max) => {
  const value = Number(process.env[name] ?? fallback);
  if (!Number.isInteger(value) || value < 1 || value > max) throw Error("Invalid " + name);
  return value;
};
const PARAMS = {
  rounds: intParam("ROUNDS", 2, 12),
  variants: intParam("VARIANTS", 10, 100),
  trainPairs: intParam("TRAIN_PAIRS", 8, 200),
  routeTrainPairs: intParam("ROUTE_TRAIN_PAIRS", 3, 100),
  searchTrainPairs: intParam("SEARCH_TRAIN_PAIRS", 3, 100),
  holdoutPairs: intParam("HOLDOUT_PAIRS", 12, 500),
  maxPlies: intParam("MAX_PLIES", 120, 500),
  maxSeconds: intParam("MAX_SECONDS", 1200, 7200),
  seed: intParam("SEED", 20261018, 2147483647),
};
const OUT = process.env.REPORT || "reports/stage-convergence.json";
const started = Date.now();
const source = process.env.GITHUB_SHA || "local";
const LIMIT = PARAMS.maxPlies;
const PAD = 0.000001;
const canonical = (spec) => JSON.stringify([[...spec.walls].sort((a, b) => a - b), [...spec.stars].sort((a, b) => a - b)]);
const rotated = (i) => SIZE * SIZE - 1 - i;
const baseSpec = (layout) => {
  const s = LAYOUTS[layout];
  return { walls: [...s.walls], stars: [...s.stars], players: [...s.players] };
};
const startState = (spec, starter) => ({
  walls: [...spec.walls], stars: [...spec.stars], players: [...spec.players],
  scores: [0, 0], turn: starter, winner: null, ply: 0,
});
const overlaps = (spec) => {
  const all = [...spec.walls, ...spec.stars, ...spec.players];
  return new Set(all).size !== all.length;
};
function valid(spec, requireNoFirstCapture = true) {
  if (spec.walls.length !== 8 || spec.stars.length !== 5 ||
      overlaps(spec) || spec.players.join(",") !== "42,6") return false;
  if (![...spec.walls, ...spec.stars].every(n => Number.isInteger(n) && n >= 0 && n < 49)) return false;
  if (!spec.walls.every(n => spec.walls.includes(rotated(n))) ||
      !spec.stars.every(n => spec.stars.includes(rotated(n)))) return false;
  for (const first of [0, 1]) {
    const s = startState(spec, first);
    const choices = successors(s);
    if (choices.length < 20) return false;
    if (requireNoFirstCapture && choices.some(c => c.n.scores[first] !== 0)) return false;
  }
  return true;
}
function* mutations(spec) {
  for (const type of ["walls", "stars"]) {
    const group = [...spec[type]].filter(n => n < 24).sort((a, b) => a - b);
    for (const old of group) for (let dir = 0; dir < 4; dir++) {
      const dest = step(old, dir);
      if (dest === null || dest === 24) continue;
      const next = { walls: [...spec.walls], stars: [...spec.stars], players: [...spec.players] };
      const j = next[type].indexOf(old), k = next[type].indexOf(rotated(old));
      if (j < 0 || k < 0) throw Error("Broken rotation pair");
      next[type][j] = dest;
      next[type][k] = rotated(dest);
      if (valid(next)) yield { ...next, mutation: type + ":" + old + ">" + dest };
    }
  }
}
function shuffled(arr, seed) {
  const rng = seeded(seed);
  const values = [...arr];
  for (let i = values.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [values[j], values[i]] = [values[i], values[j]];
  }
  return values;
}
function oneGame(spec, policy, starter, seed) {
  const rng = seeded(seed), seen = new Map();
  let s = startState(spec, starter), quiet = 0, maxQuiet = 0, firstStar = null, first = null;
  for (; s.ply < LIMIT && s.winner === null;) {
    const currentKey = key(s);
    seen.set(currentKey, (seen.get(currentKey) || 0) + 1);
    const level = policy;
    const a = experimental(s, {
      level,
      rng: seeded(turnSeed(seed, s.ply)),
      seen,
    });
    if (!a) break;
    if (first === null) first = JSON.stringify([a.wall ? a.wall.to : null, a.dir]);
    const n = apply(s, a);
    if (n.stars.length < s.stars.length) {
      firstStar ??= n.ply;
      maxQuiet = Math.max(quiet, maxQuiet);
      quiet = 0;
    } else quiet++;
    s = n;
  }
  maxQuiet = Math.max(quiet, maxQuiet);
  return { starter, winner: s.winner, capped: s.winner === null, plies: s.ply,
    firstStar, first, stalled: maxQuiet >= 20, noLegal: s.winner === null && s.ply < LIMIT };
}
function wilson(wins, n) {
  if (n < 1) return [0, 1];
  const z = 1.959963984540054, zz = z*z, rate = wins/n;
  const denom = 1+zz/n, center = (rate+zz/(2*n))/denom;
  const radius = z*Math.sqrt((rate*(1-rate)+zz/(4*n))/n)/denom;
  return [Math.max(0,center-radius),Math.min(1,center+radius)].map(n=>+n.toFixed(4));
}
function evaluate(spec, policy, pairCount, seedOffset) {
  const out = [], opening = new Set();
  for (let i = 0; i < pairCount; i++) for (let starter=0; starter<2; starter++) {
    const g = oneGame(spec, policy, starter, seedOffset + i*307);
    out.push(g);
    if (g.first !== null) opening.add(g.first);
  }
  const games = out.length, decided = out.filter(g=>!g.capped);
  // Pair bootstrap, not independent-game Wilson, controls for the correlation
  // between opposite-start games that reuse the same seed.
  const pairUnits = Array.from({length:pairCount},(_,i)=>out.slice(i*2,i*2+2));
  const bootRng = seeded(seedOffset ^ pairCount ^ policy.length ^ 927431);
  const bootRates=[];
  for(let iteration=0;iteration<2000;iteration++){
    let wins=0,completed=0;
    for(let k=0;k<pairCount;k++) for(const g of pairUnits[Math.floor(bootRng()*pairCount)]){
      if(g.winner!==null){completed++;if(g.winner===g.starter)wins++;}
    }
    if(completed)bootRates.push(wins/completed);
  }
  bootRates.sort((a,b)=>a-b);
  const pairedBootstrap95 = bootRates.length ? [
    +bootRates[Math.floor((bootRates.length-1)*.025)].toFixed(4),
    +bootRates[Math.floor((bootRates.length-1)*.975)].toFixed(4),
  ] : [0,1];
  const firstWins = decided.filter(g=>g.winner === g.starter).length;
  const secondWins = decided.length - firstWins;
  const capped = games - decided.length;
  const rate = decided.length ? firstWins / decided.length : null;
  const stalled20 = out.filter(g=>g.stalled).length;
  const noLegal = out.filter(g=>g.noLegal).length;
  const meanPlies = out.reduce((sum,g)=>sum+g.plies,0)/games;
  const firstStar = out.flatMap(g=>g.firstStar === null ? [] : [g.firstStar]).sort((a,b)=>a-b);
  return { policy, seedOffset, pairs: pairCount, games, decided:decided.length,
    firstWins, secondWins, capped, rate:rate === null ? null : +rate.toFixed(4),
    wilson95: wilson(firstWins, decided.length),
    pairedBootstrap95,
    initiativeUncertainty:[+(firstWins/games).toFixed(4),+((firstWins+capped)/games).toFixed(4)],
    cappedRate:+(capped/games).toFixed(4),
    stalled20, stalledRate:+(stalled20/games).toFixed(4),
    noLegal, meanPlies:+meanPlies.toFixed(2),
    firstStarMedian:firstStar.length ? firstStar[Math.floor((firstStar.length-1)/2)] : null,
    distinctFirstMoves: opening.size,
  };
}
function trainingLoss(m) {
  // Not a certification metric: deliberately cheap screening, corrected with unseen holdouts.
  if (m.noLegal) return Infinity;
  const center = (m.firstWins + m.capped/2)/m.games;
  return 3*Math.abs(center-.5) + m.cappedRate*1.5 +
    m.stalledRate*.65 + Math.max(0,m.meanPlies-75)/160 +
    (m.distinctFirstMoves<=2 ? .15 : 0);
}
function certified(m) {
  // Strict gate: point estimate within 45..55%; PAIR-RESAMPLED CI inside 40..60%.
  // Censored games must be rare and are NEVER silently counted as draws.
  return m.decided >= 100 && m.rate !== null && m.rate>=.45 && m.rate<=.55 &&
    m.pairedBootstrap95[0]>=.40 && m.pairedBootstrap95[1]<=.60 &&
    m.cappedRate<=.10 && m.stalledRate<=.35 && m.noLegal===0;
}
const results = [];
for (let layout=0;layout<LAYOUTS.length;layout++) {
  const original = baseSpec(layout);
  assert.ok(valid(original, false), "Existing stage invalid: " + layout);
  const trainingOffset = PARAMS.seed + layout * 1_000_000;
  let frontier = [{...original, mutation:"unchanged"}], bestLoss=Infinity, unchangedRounds=0;
  let bestOverall = null;
  const rounds=[];
  for (let round=0;round<PARAMS.rounds;round++) {
    if (Date.now()-started >= PARAMS.maxSeconds*1000) break;
    const options = new Map();
    for (const parent of frontier) {
      options.set(canonical(parent), parent);
      for (const m of mutations(parent)) options.set(canonical(m), m);
    }
    // Carry the global training champion forward, even when the final round
    // does not improve. Otherwise the "winner" can become a worse last-round
    // proposal merely because it was one of the sampled neighbors.
    if (bestOverall) options.set(canonical(bestOverall.spec), bestOverall.spec);
    options.set(canonical(original), {...original,mutation:"original"});
    const all = [...options.values()];
    const mandatory = bestOverall && canonical(bestOverall.spec)!==canonical(original)
      ? [bestOverall.spec] : [];
    const mandatoryKeys = new Set(mandatory.map(canonical));
    const selected = shuffled(all.filter(s=>canonical(s)!==canonical(original)&&!mandatoryKeys.has(canonical(s))),
      PARAMS.seed + layout*101+round*3107).slice(0,Math.max(0,PARAMS.variants-1-mandatory.length));
    selected.unshift({...original,mutation:"original"}, ...mandatory);
    const scores = selected.map(spec=>{
      // Multi-agent screening: greed-only optimization produced severe
      // route/search overfitting in the first 1,152-game round.
      const greedy=evaluate(spec,"greedy",PARAMS.trainPairs,trainingOffset);
      const search=evaluate(spec,"search",PARAMS.searchTrainPairs,trainingOffset + 31_007);
      const route=evaluate(spec,"route",PARAMS.routeTrainPairs,trainingOffset + 61_009);
      // Optimize the weakest policy: averaging hid 20-point initiative bias
      // under a coincidental 50/50 result for another AI.
      const losses=[trainingLoss(greedy),trainingLoss(search),trainingLoss(route)];
      const loss=.75*Math.max(...losses)+.25*losses.reduce((a,b)=>a+b,0)/losses.length;
      return { spec, loss, training:{greedy,search,route} };
    }).sort((a,b)=>a.loss-b.loss || canonical(a.spec).localeCompare(canonical(b.spec)));
    const champion=scores[0];
    rounds.push({round,considered:all.length,evaluated:selected.length,
      champion:{mutation:champion.spec.mutation,layout:champion.spec,
        loss:+champion.loss.toFixed(5),training:champion.training},
      baselineTraining:scores.find(x=>x.spec.mutation==="original")?.training,
    });
    if(champion.loss + PAD < bestLoss){
      bestLoss=champion.loss;bestOverall=champion;unchangedRounds=0;
    } else unchangedRounds++;
    frontier=[bestOverall?.spec,...scores.slice(0,2).map(x=>x.spec)].filter(Boolean)
      .filter((spec,i,all)=>all.findIndex(x=>canonical(x)===canonical(spec))===i)
      .slice(0,2);
    if(unchangedRounds>=2)break;
  }
  const champ=bestOverall?.spec || original;
  const same=canonical(champ) === canonical(original);
  const checks=[];
  // Training and validation use disjoint seed bands, and each is independent of the
  // original historical 2026 studies. The validation block is NOT fed into training.
  for (const block of ["holdout","validation"]) {
    const offset=trainingOffset+(block==="holdout"?100_000_013:200_000_029);
    const measures=[];
    for(const policy of ["greedy","search","route"]) {
      const originalResult=evaluate(original,policy,PARAMS.holdoutPairs,offset+397);
      const candidateResult=same?originalResult:evaluate(champ,policy,PARAMS.holdoutPairs,offset+397);
      measures.push({policy,baseline:originalResult,candidate:candidateResult,
        passed:certified(candidateResult)});
    }
    checks.push({block,seedOffset:offset+397,policies:measures,passes:measures.every(x=>x.passed)});
  }
  const converged=checks.every(x=>x.passes);
  results.push({layout,name:LAYOUTS[layout].name,original,selected:champ,
    changed:!same,rounds,checks,converged,
    status:converged?"CONVERGED_UNDER_MEASUREMENT_GATE":"NOT_CERTIFIED",
    warning:"Paired bootstrap resamples complete two-game seed units, but policy dependence and finite coverage mean this is not a mathematical proof of fair human play."});
  console.log("STAGE_RESULT "+JSON.stringify({layout,name:LAYOUTS[layout].name,
    changed:!same,rounds:rounds.length,converged,
    holdout:checks[0].policies.map(x=>({policy:x.policy,baseline:x.baseline,
      candidate:x.candidate,passed:x.passed})),
    validation:checks[1].policies.map(x=>({policy:x.policy,
      firstWins:x.candidate.firstWins,secondWins:x.candidate.secondWins,
      capped:x.candidate.capped,passed:x.passed}))}));
}
const totalSeconds=+((Date.now()-started)/1000).toFixed(2);
const result={
  version:1,source,params:PARAMS,totalSeconds,
  note:"Bounded two-player layout research: no deployed changes. No artificial game draws. Multi-policy training (greedy, search, route) and two disjoint unseen-seed checks. Gates must pass for every policy and block. Paired bootstrap CI is used for certification; mathematical human-play fairness remains unproven.",
  convergence:results.every(x=>x.converged)?"CONVERGED_UNDER_MEASUREMENT_GATE":"NOT_CERTIFIED",
  stopReason:results.every(x=>x.converged)?"all measurement gates passed":"round/sample/time budget or fairness gate not passed",
  results,
};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(result,null,2)+"\n");
console.log("STAGE_CONVERGENCE_COMPLETE "+JSON.stringify({
  status:result.convergence,seconds:totalSeconds,stages:results.length,report:OUT,
  totalGameCount:results.reduce((n,r)=>n+r.checks.reduce((a,b)=>
    a+b.policies.reduce((c,p)=>c+p.candidate.games+(p.candidate===p.baseline?0:p.baseline.games),0),0),0),
}));

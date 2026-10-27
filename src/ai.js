import {learnWeight,learningContext,validateLearning} from './learning.js';
import { chooseRoute } from './route-ai.js';
import { actions, distances, key, successors } from "./engine.js";
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
// Normal CPU uses the original two-ply minimax. Challenge CPU additionally
// evaluates exact scoring routes available after one legal wall shift.
export function choose(
  s,
  { level = "search", rng = Math.random, seen = new Map(), beam = 8, opponentModel = null } = {},
) {
  if (level === "learning") return chooseLearning(s, {rng,seen,opponentModel});
  if (level === "strong") return chooseRoute(s, { rng, seen });
  const all = actions(s);
  if (!all.length) return null;
  if (level === "random") return all[Math.floor(rng() * all.length)];
  const p = s.turn;
  const ranked = successors(s)
    .map(({ a, n }) => {
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
    for (const { n } of successors(c.n)) {
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

// PR #18: cold starts are exactly greedy; learning only breaks equal-score ties.
function chooseLearning(s,{rng,seen,opponentModel}) {
  let model;
  try { model = validateLearning(opponentModel); } catch { return choose(s,{level:'greedy',rng,seen}); }
  const counts = model.contexts[learningContext(s)];
  // Samples from a different board size/target must not activate this context.
  if (!counts || counts.reduce((sum,n)=>sum+n,0)<8) return choose(s,{level:'greedy',rng,seen});
  const p=s.turn, ranked=successors(s).map(c=>({...c,score:evaluate(c.n,p)-(seen.get(key(c.n))||0)*130,tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie);
  if (!ranked.length) return null;
  if (ranked[0].n.winner===p) return ranked[0].a;
  const tied=ranked.filter(c=>c.score===ranked[0].score).slice(0,8);
  let pick=tied[0].a,best=-Infinity;
  for(const c of tied){let sum=0,total=0;for(const r of successors(c.n)){const weight=learnWeight(model,c.n,r.a,r.n);sum+=weight*evaluate(r.n,p);total+=weight;}const expected=total?sum/total:c.score;if(expected>best){best=expected;pick=c.a;}}
  return pick;
}

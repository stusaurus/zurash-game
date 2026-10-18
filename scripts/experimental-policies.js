// Laboratory policies only; these are not selectable CPU levels.
import { successors, distances, key } from '../src/engine.js';
import {choose as chooseLegacy} from './reference/ai-pre-route.js';
import {chooseRoute} from '../src/route-ai.js';
import { choose, evaluate } from '../src/ai.js';
export function experimental(s, { level, rng, seen }) {
  if(level==='legacy-strong')return chooseLegacy(s,{level:'strong',rng,seen});
  if(level==='route-mix')return chooseRoute(s,{rng,seen,variety:25});
  if(level==='route'||level==='route-progress')return chooseRoute(s,{rng,seen,progress:level==='route-progress'});
  if (!['defensive', 'planner'].includes(level)) return choose(s, { level, rng, seen });
  const p = s.turn;
  const score = n => {
    const base = evaluate(n,p);
    if (n.winner !== null) return base;
    const own = distances(n,p), other = distances(n,1-p);
    // Race to the closest remaining star, and avoid an opponent's short route.
    return base + (Math.min(8,...n.stars.map(x=>other[x])) - Math.min(8,...n.stars.map(x=>own[x]))) * 45;
  };
  let ranked = successors(s).map(c=>({...c,score:score(c.n)-(seen.get(key(c.n))||0)*130,tie:rng()}))
    .sort((a,b)=>b.score-a.score||a.tie-b.tie);
  if (!ranked.length) return null;
  if (ranked[0].n.winner === p) return ranked[0].a;
  if (s.scores[1-p]===2) {
    const safe=ranked.filter(c=>!successors(c.n).some(r=>r.n.winner===1-p));
    if(safe.length) ranked=safe;
  }
  let best=-Infinity,pick=ranked[0].a;
  for (const c of ranked.slice(0,12)) {
    let worst=Infinity;
    for(const r of successors(c.n)) {
      let v=score(r.n);
      if(level==='planner' && r.n.winner===null) {
        // Bounded three-ply alternative: prepare our next scoring route.
        v=Math.max(...successors(r.n).map(t=>score(t.n)));
      }
      worst=Math.min(worst,v);
      if(worst < best) break;
    }
    const v=worst-(seen.get(key(c.n))||0)*130;
    if(v>best) {best=v;pick=c.a;}
  }
  return pick;
}

// RESEARCH ONLY: curry-aware CPU for the isolated two-player experiment.
// It does not change the live CPU or production rules.
import { distances } from "../src/engine.js";
import { successorsCurry, stateKeyCurry } from "./curry-power.js";

function evaluate(s, p) {
  if (s.winner !== null) return s.winner === p ? 1000000 : -1000000;
  const opponent = 1-p;
  let v=(s.scores[p]-s.scores[opponent])*850;
  v+=(s.powers[p]-s.powers[opponent])*145;
  // Possessing a still-available curry means a future wall extension may
  // create new stopping points; do not treat it as an automatic star.
  const d0=distances(s,p),d1=distances(s,opponent);
  for(const star of s.stars) {
    const own=Math.min(8,d0[star]),other=Math.min(8,d1[star]);
    v+=(other-own)*11+(own===1?54:0)-(other===1?65:0);
  }
  // A second point is more urgent as either side approaches match point.
  if(s.scores[p]===2)v+=110;
  if(s.scores[opponent]===2)v-=125;
  return v;
}
export function chooseCurry(s,{rng=Math.random,seen=new Map(),extra=2,level="strong"}={}) {
  const options=successorsCurry(s,extra);
  if(!options.length)return null;
  if(level==="random")return options[Math.floor(rng()*options.length)].a;
  const me=s.turn,opponent=1-me;
  const repetition=n=>(seen.get(stateKeyCurry(n))||0)*110;
  const scored=options.map(x=>({
    ...x,priority:evaluate(x.n,me)-repetition(x.n),tie:rng(),
  })).sort((a,b)=>b.priority-a.priority||a.tie-b.tie);
  const win=scored.find(x=>x.n.winner===me);
  if(win)return win.a;
  if(level==="greedy")return scored[0].a;
  const bestChoices=scored.slice(0,s.powers[me]?9:11);
  let best=-Infinity,choice=scored[0].a;
  for(const c of bestChoices){
    let worst=Infinity;
    const replies=successorsCurry(c.n,extra);
    // Opponent's WINNING move must be respected even if the initial
    // curry pick-up made this candidate attractive to a greedy player.
    for(const r of replies){
      const value=evaluate(r.n,me);
      if(value<worst)worst=value;
      if(worst < best-150)break;
    }
    if(!replies.length)worst=evaluate(c.n,me);
    const value=worst*.90+c.priority*.10-repetition(c.n);
    if(value>best){best=value;choice=c.a;}
  }
  return choice;
}

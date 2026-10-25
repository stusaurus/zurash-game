// Research only: change tie-breaking at equal final search value, never penalize a worse value.
import {successors,key} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
export function chooseSafeRepeat(s,{rng,seen=new Map(),beam=8}){
 const p=s.turn,ranked=successors(s).map(c=>({...c,score:evaluate(c.n,p)-(seen.get(key(c.n))||0)*130,tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie);
 if(!ranked.length)return null;if(ranked[0].n.winner===p)return ranked[0].a;
 let best=-Infinity,pick=ranked[0].a,visits=Infinity;
 for(const c of ranked.slice(0,beam)){let worst=Infinity,cut=false;for(const {n} of successors(c.n)){worst=Math.min(worst,evaluate(n,p));if(worst<best-150){cut=true;break;}}
 const value=worst*.88+c.score*.12-(seen.get(key(c.n))||0)*130,v=seen.get(key(c.n))||0;
 // A pruned estimate is insufficient evidence for equal-value tie breaking.
 if(value>best||(value===best&&!cut&&v<visits)){best=value;pick=c.a;visits=v;}
 }return pick;
}

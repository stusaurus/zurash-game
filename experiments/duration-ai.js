// Fast experimental baseline CPU for variable board sizes.
// Not claimed to be stronger than the official 7x7 AI. Keep in a worker on UI.
import {successorsDuration,stateKeyDuration} from "./duration-engine.js";
function distance(s,who){
 if(!s.stars.length)return 0;
 const pos=s.players[who],x=pos%s.size,y=Math.floor(pos/s.size);
 return Math.min(...s.stars.map(v=>
   Math.abs(v%s.size-x)+Math.abs(Math.floor(v/s.size)-y)));
}
function valueOf(s,me,seen){
 if(s.winner!==null)return s.winner===me?1_000_000:-1_000_000;
 const foe=1-me;
 return (s.scores[me]-s.scores[foe])*1350 +
 (s.powers[me]-s.powers[foe])*90 +
 (distance(s,foe)-distance(s,me))*15 -
 (seen?.get(stateKeyDuration(s))||0)*180;
}
export function chooseDuration(s,{rng=Math.random,seen=new Map(),level="search"}={}){
 const options=successorsDuration(s);
 if(!options.length)return null;
 if(level==="random")return options[Math.floor(rng()*options.length)].a;
 const me=s.turn;
 const ranks=options.map(x=>({x,score:valueOf(x.n,me,seen),tie:rng()}))
  .sort((a,b)=>b.score-a.score||a.tie-b.tie);
 if(ranks[0].x.n.winner===me || level==="greedy")return ranks[0].x.a;
 const candidates=ranks.slice(0,s.powers[me]?6:10);
 let best=-Infinity,bestMove=candidates[0].x.a;
 for(const candidate of candidates){
  const opponentMoves=successorsDuration(candidate.x.n);
  if(opponentMoves.some(x=>x.n.winner===1-me))continue;
  const worst=opponentMoves.length
    ? Math.max(...opponentMoves.map(x=>
      valueOf(x.n,1-me,seen)))
    : -1000;
  const score=.7*candidate.score-.3*worst;
  if(score>best){best=score;bestMove=candidate.x.a;}
 }
 return bestMove;
}

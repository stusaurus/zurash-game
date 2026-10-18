// Experiment-only two-wall decision policy; not the production challenge CPU.
import {successorsTwoWall} from "./curry-two-wall.js";
import {distances} from "../src/engine.js";
import {stateKeyCurry} from "./curry-power.js";

function score(s,me){
  if(s.winner!==null)return s.winner===me?1_000_000:-1_000_000;
  const foe=1-me;
  const distMe=distances(s,me),distFoe=distances(s,foe);
  let rating=(s.scores[me]-s.scores[foe])*1000 +
    (s.powers[me]-s.powers[foe])*125;
  if(s.scores[foe]===2)rating-=140;
  for(const pos of s.stars){
    const own=Number.isFinite(distMe[pos])?distMe[pos]:8;
    const other=Number.isFinite(distFoe[pos])?distFoe[pos]:8;
    rating+=(other-own)*12+(own===1?50:0)-(other===1?65:0);
  }
  return rating;
}
export function chooseTwoWall(s,{rng=Math.random,seen=new Map(),level="search"}={}){
  const options=successorsTwoWall(s);
  if(!options.length)return null;
  if(level==="random")return options[Math.floor(rng()*options.length)].a;
  const me=s.turn;
  // Special moves are initially ranked cheaply; checking every move with a
  // full distance search is too slow on powered turns with a large branching factor.
  const rough=options.map(x=>{
    const n=x.n;
    const dx=(n.players[me]%7),dy=Math.floor(n.players[me]/7);
    const closest=n.stars.length?Math.min(...n.stars.map(t=>
      Math.abs(t%7-dx)+Math.abs(Math.floor(t/7)-dy))):0;
    return {move:x,rough:(n.winner===me?1_000_000:0)+
      (n.scores[me]-n.scores[1-me])*1500 -
      closest*9+(n.powers[me]===1?95:0)-
      (seen.get(stateKeyCurry(n))||0)*110,
      random:rng()};
  });
  rough.sort((a,b)=>b.rough-a.rough||a.random-b.random);
  if(rough[0].move.n.winner===me)return rough[0].move.a;
  if(level==="greedy")return rough[0].move.a;
  let best=-Infinity,selected=rough[0].move.a;
  for(const c of rough.slice(0,s.powers[me]?8:12)){
    const our=score(c.move.n,me);
    // Only a few promising moves receive a one-turn opponent safety search.
    const replies=successorsTwoWall(c.move.n);
    let danger=false,worst=Infinity;
    for(const reply of replies){
      if(reply.n.winner===1-me){danger=true;break;}
      // Only evaluate the opponent's strongest-looking few replies to avoid
      // high running time while testing the mechanic.
    }
    if(danger)continue;
    // Mild penalty for bringing the two walls into a repeated position.
    const repeat=seen.get(stateKeyCurry(c.move.n))||0;
    const value=.75*our+.25*c.rough-repeat*120;
    if(value>best){best=value;selected=c.move.a;}
  }
  // When every candidate loses immediately, return a legal one instead of hanging.
  return selected;
}

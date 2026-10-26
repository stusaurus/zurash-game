// Laboratory-only prototype. Does not change the production two-player rules.
// One curry feature, offered as a symmetric PAIR of tiles to avoid seat placement bias.
import { initial, successors, step, slideOptions, mobility } from "../src/engine.js";

// Mirror-symmetric test locations. Neither is an existing star, wall, player,
// nor a first-turn stopping square on any of the three official layouts.
export const CURRY_PAIRS = [[7,41],[1,47],[4,44]];
export const BASE_CURRY_PAIR = CURRY_PAIRS[0];

export function initialCurry(layout=0,starter=0,pair=BASE_CURRY_PAIR) {
  const s=initial(layout,starter);
  if(pair.length!==2 || pair[0]+pair[1]!==48 ||
      new Set([...s.walls,...s.stars,...s.players,...pair]).size!==17)
    throw Error("カレー位置が不正です");
  return {...s,curries:[...pair],powers:[0,0]};
}
function finish(s,n,a,cap) {
  const p=s.turn;
  const picked=s.curries.includes(n.players[p]);
  const curries=picked?s.curries.filter(x=>x!==n.players[p]):[...s.curries];
  const powers=[...s.powers];
  // The power is available on exactly the owner's NEXT turn. If curry is
  // collected now, re-arm once; otherwise any old power expires immediately.
  powers[p]=picked?1:0;
  return {a,n:{...n,curries,powers},picked,boostUsed:cap>1 && a.wall!==null && (a.wall.steps||1)>1};
}
function freeCorridor(s,index,dir,distance){
  let pos=s.walls[index];
  for(let i=0;i<distance;i++){
    pos=step(pos,dir);
    if(pos===null || s.walls.includes(pos) || s.stars.includes(pos) ||
       s.players.includes(pos) || s.curries.includes(pos))return null;
  }
  return pos;
}
export function successorsCurry(s, extra=2) {
  if(s.winner!==null)return [];
  if(!Number.isInteger(extra) || extra<0 || extra>2)throw Error("許可する追加マスは0..2");
  const cap=s.powers[s.turn]===1 ? 1+extra : 1;
  const out=[];
  // Validated production 0- and 1-cell moves, filtered if a curry square would
  // be occupied by a wall. Stopping on a curry square remains legal.
  for(const {a,n} of successors(s)){
    if(a.wall && s.curries.includes(a.wall.to))continue;
    out.push(finish(s,n,a,cap));
  }
  if(cap===1)return out;
  // Power changes the maximum wall distance, not the number of walls moved.
  for(let wi=0;wi<s.walls.length;wi++)for(let direction=0;direction<4;direction++){
    for(let distance=2;distance<=cap;distance++){
      const to=freeCorridor(s,wi,direction,distance);
      if(to===null)break; // subsequent cells on the ray cannot be crossed
      const walls=s.walls.map((n,i)=>i===wi?to:n);
      const wallState={...s,walls};
      if(!mobility(wallState,0).length||!mobility(wallState,1).length)continue;
      for(const {dir,to:stop} of slideOptions(wallState)){
        const p=s.turn, scored=s.stars.includes(stop);
        const scores=s.scores.map((v,i)=>v+(i===p&&scored?1:0));
        const winner=scores[p]>=3?p:null;
        const n={...wallState,
          walls:[...walls],stars:s.stars.filter(v=>!scored||v!==stop),
          players:s.players.map((v,i)=>i===p?stop:v),scores,
          ply:s.ply+1,winner,turn:winner===null?1-p:p};
        const a={wall:{wall:wi,to,steps:distance},dir};
        out.push(finish(s,n,a,cap));
      }
    }
  }
  return out;
}
export function stateKeyCurry(s) {
  return JSON.stringify([
    [...s.walls].sort((a,b)=>a-b),[...s.stars].sort((a,b)=>a-b),
    s.players,s.scores,s.turn,[...s.curries].sort((a,b)=>a-b),s.powers
  ]);
}

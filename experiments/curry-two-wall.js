// Isolated research rule: eating curry lets the player move TWO DIFFERENT walls,
// one square each, on their next turn. Then slide exactly once.
// Legal 0 or 1-wall actions remain available. Does NOT change normal ZURASH.
import {movableWalls, moveWall, slideOptions} from "../src/engine.js";
import {successorsCurry} from "./curry-power.js";

function finishSecondShift(s,shifted,first,second,{dir,to}){
  const player=s.turn;
  const scored=s.stars.includes(to);
  const scores=s.scores.map((n,i)=>n+(i===player&&scored?1:0));
  const winner=scores[player]>=3?player:null;
  const picked=s.curries.includes(to);
  const powers=[...s.powers];
  powers[player]=picked?1:0;
  const next={
    ...s, walls:[...shifted.walls],
    stars:s.stars.filter(x=>!scored||x!==to),
    players:s.players.map((x,i)=>i===player?to:x),
    scores,turn:winner===null?1-player:player,
    winner,ply:s.ply+1,
    curries:picked?s.curries.filter(x=>x!==to):[...s.curries],
    powers
  };
  return {a:{wall:first,secondWall:second,dir},n:next,
    picked,boostUsed:true};
}
export function successorsTwoWall(s){
  if(s.winner!==null)return [];
  // The unpowered move list agrees with the existing experimental curry rules.
  const plain=successorsCurry(s,0).map(x=>({
    ...x,a:{...x.a,secondWall:null},
    boostUsed:false,
  }));
  if(!s.powers[s.turn])return plain;
  const all=[...plain];
  for(const first of movableWalls(s)){
    if(s.curries.includes(first.to))continue;
    const once=moveWall(s,first);
    for(const second of movableWalls(once)){
      if(first.wall===second.wall||s.curries.includes(second.to))continue;
      const twice=moveWall(once,second);
      for(const landing of slideOptions(twice)){
        all.push(finishSecondShift(s,twice,first,second,landing));
      }
    }
  }
  return all;
}
export function matchesShift(a,b){
  return (a===null&&b===null)||
    (a!==null&&b!==null&&a.wall===b.wall&&a.to===b.to);
}
export function shiftOnly(s,move){
  if(move===null)return s;
  return moveWall(s,move);
}

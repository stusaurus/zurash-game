import test from "node:test";
import assert from "node:assert/strict";
import {initial,successors} from "../src/engine.js";
import {initialCurry,successorsCurry,BASE_CURRY_PAIR,stateKeyCurry} from "../experiments/curry-power.js";

function rotate(s){
  const f=x=>48-x;
  return {...s,walls:s.walls.map(f),stars:s.stars.map(f),
    players:[f(s.players[1]),f(s.players[0])],
    scores:[s.scores[1],s.scores[0]],turn:1-s.turn,
    winner:s.winner===null?null:1-s.winner,
    curries:s.curries.map(f),powers:[s.powers[1],s.powers[0]]};
}
test("curry positions preserve rotational layout symmetry, with no one-move pickup",()=>{
  for(let layout=0;layout<3;layout++)for(let starter=0;starter<2;starter++){
    const s=initialCurry(layout,starter);
    assert.deepEqual(s.curries,BASE_CURRY_PAIR);
    assert.equal(stateKeyCurry(rotate(s)),stateKeyCurry(initialCurry(layout,1-starter)));
    assert.equal(successorsCurry(s).some(x=>x.picked),false);
  }
});
test("without curry or power, legal successor states exactly match production game",()=>{
  for(let layout=0;layout<3;layout++)for(let starter=0;starter<2;starter++){
    const original=initial(layout,starter);
    const decorated={...original,curries:[],powers:[0,0]};
    const a=successors(original).map(x=>JSON.stringify([x.a,x.n])).sort();
    const b=successorsCurry(decorated).map(x=>{
      const {curries,powers,...n}=x.n;
      return JSON.stringify([x.a,n]);
    }).sort();
    assert.deepEqual(a,b);
  }
});
test("curry collection grants wall range only next own turn and expires after use",()=>{
  // Construct a reachable 2-own-turn route while holding the opponent in place.
  for(let layout=0;layout<3;layout++){
    const s=initialCurry(layout);
    let picked=null;
    for(const one of successorsCurry(s)){
      const step2={...one.n,turn:0};
      picked=successorsCurry(step2).find(x=>x.picked);
      if(picked)break;
    }
    assert.ok(picked,"stage "+layout+": curry tile must be reachable");
    assert.equal(picked.n.powers[0],1);
    assert.equal(picked.n.turn,1);
    const opponentMove=successorsCurry(picked.n)[0];
    assert.ok(opponentMove);
    const empowered=opponentMove.n;
    assert.equal(empowered.turn,0);
    assert.equal(empowered.powers[0],1);
    const boosted=successorsCurry(empowered).filter(x=>x.a.wall?.steps>1);
    assert.ok(boosted.length,"stage "+layout+": activated power must enable multi-cell wall movement");
    const move=boosted.find(x=>!x.picked);
    assert.ok(move);
    assert.ok(move.a.wall.steps<=3);
    assert.equal(move.n.powers[0],0);
    assert.equal(move.n.turn,1);
  }
});
test("wall cannot pass another wall, star, pawn or uneaten curry",()=>{
  const s=initialCurry(0,0);
  const boosted={...s,powers:[1,0]};
  for(const {a,n} of successorsCurry(boosted)){
    if(!a.wall)continue;
    let from=s.walls[a.wall.wall];
    const distance=a.wall.steps||1;
    const direction=[0,1,2,3].find(d=>{
      let current=from;
      for(let i=0;i<distance;i++){
        const dx=[0,1,0,-1][d],dy=[-1,0,1,0][d];
        const nx=current%7+dx,ny=Math.floor(current/7)+dy;
        if(nx<0||nx>=7||ny<0||ny>=7)return false;
        current=ny*7+nx;
      }
      return current===a.wall.to;
    });
    assert.notEqual(direction,undefined);
    for(let i=0;i<distance;i++){
      const dx=[0,1,0,-1][direction],dy=[-1,0,1,0][direction];
      from=from+dy*7+dx;
      assert.equal(s.stars.includes(from)||s.players.includes(from)||s.curries.includes(from)||
                   s.walls.includes(from),false,"a wall cannot pass blocked spaces");
    }
    assert.equal(n.walls.filter(x=>x===a.wall.to).length,1);
  }
});
test("powered play is symmetric under swapping seats and rotating 180 degrees",()=>{
  for(let layout=0;layout<3;layout++){
    const s=initialCurry(layout,0);
    for(const active of [0,1]){
      const state={...s,powers:active===0?[1,0]:[0,1],turn:active};
      const rotated=rotate(state);
      const toKey=list=>list.map(x=>stateKeyCurry(x.n)).sort();
      assert.deepEqual(toKey(successorsCurry(state)),toKey(successorsCurry(rotated).map(x=>({n:rotate(x.n)}))),
        "layout "+layout+": all powered outcomes should be symmetric");
    }
  }
});

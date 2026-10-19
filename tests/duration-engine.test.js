import test from "node:test";
import assert from "node:assert/strict";
import {initial,successors} from "../src/engine.js";
import {MODES,initialDuration,successorsDuration,rotationDuration,
 stateKeyDuration,stepAt,slideAt,possibleShifts} from "../experiments/duration-engine.js";
import {chooseDuration} from "../experiments/duration-ai.js";
import {seeded} from "../src/ai.js";

for(const id of Object.keys(MODES)){
 for(const curry of [false,true]){
  test(id+" curry "+curry+" has symmetric nonoverlapping tiles and legal opening",()=>{
   for(const starter of [0,1]){
    const s=initialDuration(id,curry,starter);
    const n=s.size*s.size;
    const all=[...s.walls,...s.stars,...s.players,...s.curries];
    assert.equal(new Set(all).size,all.length);
    assert.ok(all.every(x=>x>=0&&x<n));
    assert.deepEqual([...s.walls].sort((a,b)=>a-b),
      [...s.walls].map(x=>n-1-x).sort((a,b)=>a-b));
    assert.equal(s.players[0]+s.players[1],n-1);
    assert.equal(s.stars.length,MODES[id].stars.length);
    const actions=successorsDuration(s);
    assert.ok(actions.length>10);
    assert.ok(actions.every(x=>x.n.ply===s.ply+1));
    assert.ok(actions.every(x=>x.n.powers.every(p=>p===0||p===1)));
    assert.ok(actions.every(x=>x.a.secondWall===null));
    if(!curry)assert.ok(actions.every(x=>x.n.curries.length===0));
   }
  });
 }
}
test("quick7 without curry matches every opening and four reached core-game states",()=>{
 let standard=initial(2),lab=initialDuration("quick7",false,0);
 for(let ply=0;ply<5 && standard.winner===null;ply++){
  const original=successors(standard);
  const trial=successorsDuration(lab);
  const canonicalA=x=>JSON.stringify([
    x.a.wall,x.a.dir,x.n.walls,x.n.stars,x.n.players,
    x.n.scores,x.n.turn,x.n.winner,x.n.ply,
  ]);
  const b=trial.map(canonicalA).sort();
  const a=original.map(canonicalA).sort();
  assert.deepEqual(b,a);
  const index=(ply*5+3)%original.length;
  const goal=original[index];
  standard=goal.n;
  lab=trial.find(x=>canonicalA(x)===canonicalA(goal)).n;
 }
});
test("9x9 walls move only one step into a unique legal space",()=>{
 const s=initialDuration("wide9",true,0);
 for(const a of possibleShifts(s)){
  assert.ok(s.walls.some((x,i)=>i===a.wall&&
   [0,1,2,3].some(dir=>stepAt(x,dir,s.size)===a.to)));
  assert.ok(![...s.walls,...s.players,...s.stars,...s.curries].includes(a.to));
 }
});
test("7x7 and 9x9 two-wall power is optional and cannot shift same wall twice",()=>{
 for(const id of Object.keys(MODES)){
  const s=initialDuration(id,true,0);
  s.powers[0]=1; // A reachable state with curry power is checked separately in UI.
  const opts=successorsDuration(s);
  const double=opts.filter(x=>x.a.secondWall!==null);
  assert.ok(double.length>0,id+" should have some legal double-shift actions");
  assert.ok(opts.some(x=>x.a.wall===null&&x.a.secondWall===null));
  assert.ok(opts.some(x=>x.a.wall!==null&&x.a.secondWall===null));
  for(const x of double){
   assert.notEqual(x.a.wall.wall,x.a.secondWall.wall);
   assert.equal(x.n.powers[0],x.pickedCurry?1:0);
   const occupied=[...x.n.walls,...x.n.stars,...x.n.players,...x.n.curries];
   assert.equal(new Set(occupied).size,occupied.length);
   assert.ok(x.n.scores[0]>=0&&x.n.scores[0]<=s.target);
  }
 }
});
test("rotated boards produce equal legal successor positions with identical score rules",()=>{
 for(const id of Object.keys(MODES)){
  for(const curry of [false,true]){
   const s=initialDuration(id,curry,0);
   const r=rotationDuration(s);
   assert.deepEqual(rotationDuration(r),s);
   const left=new Set(successorsDuration(s).map(x=>
      stateKeyDuration(rotationDuration(x.n))));
   const right=new Set(successorsDuration(r).map(x=>stateKeyDuration(x.n)));
   assert.deepEqual([...left].sort(),[...right].sort());
  }
 }
});
test("AI choices always match actual legal actions on both board sizes",()=>{
 for(const id of Object.keys(MODES)){
  for(const curry of [false,true]){
   const s=initialDuration(id,curry,0);
   const legal=new Set(successorsDuration(s).map(x=>JSON.stringify(x.a)));
   for(const level of ["random","greedy","search"]){
    const choice=chooseDuration(s,{level,rng:seeded(333)});
    assert.ok(legal.has(JSON.stringify(choice)),id+"/"+curry+"/"+level);
   }
  }
 }
});

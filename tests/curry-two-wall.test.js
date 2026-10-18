import test from "node:test";
import assert from "node:assert/strict";
import {initial,step} from "../src/engine.js";
import {initialCurry,successorsCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
import {chooseTwoWall} from "../experiments/curry-two-wall-ai.js";
import {seeded} from "../src/ai.js";
function move(s,wall,dir,secondWall=null){
  const find=successorsTwoWall(s).find(x=>x.a.dir===dir &&
    (wall===null?x.a.wall===null:x.a.wall?.wall===wall.wall&&x.a.wall?.to===wall.to) &&
    (secondWall===null?x.a.secondWall===null:
       x.a.secondWall?.wall===secondWall.wall&&x.a.secondWall?.to===secondWall.to));
  assert.ok(find,"legal test setup");
  return find.n;
}
function boosted(){
  let s=initialCurry(2,0,[13,35]);
  s=move(s,null,0);
  s=move(s,{wall:s.walls.indexOf(36),to:43},2);
  s=move(s,{wall:s.walls.indexOf(43),to:42},2);
  assert.deepEqual(s.powers,[1,0]);
  s=move(s,null,0);
  assert.equal(s.turn,0);assert.equal(s.powers[0],1);
  return s;
}
test("no curry power makes exactly the same one-wall outcomes as the original curry rules",()=>{
  for(let layout=0;layout<3;layout++)for(let starter=0;starter<2;starter++){
    const s=initialCurry(layout,starter,layout===2?[21,27]:[7,41]);
    const plain=successorsCurry(s,0).map(x=>JSON.stringify([x.a,x.n])).sort();
    const double=successorsTwoWall(s).map(x=>{
      const {secondWall,...act}=x.a;
      assert.equal(secondWall,null);
      return JSON.stringify([act,x.n]);
    }).sort();
    assert.deepEqual(double,plain);
  }
});
test("curry activates on NEXT personal turn, not immediately, and disappears after one move",()=>{
  const s=boosted();
  const doubled=successorsTwoWall(s).filter(x=>x.a.secondWall!==null);
  assert.ok(doubled.length>0,"power must make a second wall legal");
  for(const x of doubled){
    assert.ok(x.a.wall!==null);
    assert.notEqual(x.a.wall.wall,x.a.secondWall.wall);
    assert.notEqual(x.a.wall.to, x.a.secondWall.to);
    const n=x.n;
    assert.equal(n.powers[0],x.picked?1:0);
    assert.equal(n.ply,s.ply+1);
    // Each shifted wall moves exactly 1 cell; never 2x same wall.
    for(const part of [x.a.wall,x.a.secondWall]){
      assert.ok([0,1,2,3].some(d=>step(s.walls[part.wall],d)===part.to));
    }
  }
  const normal=successorsTwoWall(s).filter(x=>x.a.wall!==null&&x.a.secondWall===null);
  assert.ok(normal.length>0,"power user must be allowed to shift just one wall");
  const skipped=successorsTwoWall(s).filter(x=>x.a.wall===null&&x.a.secondWall===null);
  assert.ok(skipped.length>0,"power user may also shift no wall");
});
test("two-wall moves never overlap walls, stars, curry or either player",()=>{
  const s=boosted();
  for(const {n} of successorsTwoWall(s)){
    const occupied=[...n.walls,...n.stars,...n.players,...n.curries];
    assert.equal(new Set(occupied).size,occupied.length);
  }
});
test("two-wall laboratory AI chooses legal actions, including powered positions",()=>{
 for(const s of [initialCurry(2,0,[21,27]),boosted()]){
  const keys=new Set(successorsTwoWall(s).map(x=>JSON.stringify(x.a)));
  for(const level of ["greedy","search"]){
   const a=chooseTwoWall(s,{level,rng:seeded(8106)});
   assert.ok(keys.has(JSON.stringify(a)),level+" must select a legal action");
  }
 }
});
function rotate(s){
 const f=x=>48-x;
 return {...s,walls:s.walls.map(f),stars:s.stars.map(f),
  players:[f(s.players[1]),f(s.players[0])],
  scores:[s.scores[1],s.scores[0]],turn:1-s.turn,
  curries:s.curries.map(f),powers:[s.powers[1],s.powers[0]],
  winner:s.winner===null?null:1-s.winner};
}
test("powered two-wall outcomes preserve symmetry under 180-degree rotation",()=>{
 const s=boosted();
 const outcome=xs=>xs.map(x=>stateKeyCurry(x.n)).sort();
 const a=outcome(successorsTwoWall(s));
 const b=outcome(successorsTwoWall(rotate(s)).map(x=>({n:rotate(x.n)})));
 assert.deepEqual(a,b);
});

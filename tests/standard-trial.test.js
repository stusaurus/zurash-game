import test from "node:test";
import assert from "node:assert/strict";
import {initial, LAYOUTS, ALL_LAYOUTS, actions, apply} from "../src/engine.js";
import {RESEARCH_LAYOUTS} from "../src/research-layouts.js";
import {TRIAL_LAYOUTS} from "../src/trial-layouts.js";

test("beginner and existing A–E indices remain unchanged",()=>{
  assert.equal(initial(0).size,undefined);
  assert.equal(initial(0).target,undefined);
  assert.equal(initial(0).stars.length,5);
  assert.equal(initial(0).walls.length,8);
  assert.deepEqual(RESEARCH_LAYOUTS.map(b=>[b.id,b.size,b.target]),
    [["A",8,4],["B",9,3],["C",10,3],["D",6,4],["E",11,3]]);
  assert.deepEqual([4,5,6,7,8].map(i=>initial(i).size),[8,9,10,6,11]);
  assert.equal(ALL_LAYOUTS.length,LAYOUTS.length+RESEARCH_LAYOUTS.length+TRIAL_LAYOUTS.length);
});

test("9×9 seven-star trial has symmetric, distinct, legal opening choices",()=>{
  const index=LAYOUTS.length+RESEARCH_LAYOUTS.length;
  assert.equal(index,9); // A–E indices must remain stable.
  assert.equal(TRIAL_LAYOUTS.length,3);
  for(const [offset,starCount,target] of [[0,9,5],[1,7,4],[2,9,4]]) {
  const states=[initial(index+offset,0),initial(index+offset,1)];
  for(const s of states){
    assert.equal(s.size,9);
    assert.equal(s.target,target);
    assert.equal(s.walls.length,10);
    assert.equal(s.stars.length,starCount);
    assert.deepEqual(s.scores,[0,0]);
    assert.equal(new Set([...s.walls,...s.stars,...s.players]).size,12+starCount);
    for(const occupied of [s.walls,s.stars,s.players])
      assert.deepEqual([...occupied].sort((a,b)=>a-b),occupied.map(p=>80-p).sort((a,b)=>a-b));
    const all=actions(s);
    assert.ok(all.length>=40,"Both sides should have ample opening legal actions");
    assert.ok(new Set(all.map(a=>JSON.stringify(a.wall))).size>=20,
      "Player must have meaningful wall alternatives to investigate");
    assert.ok(all.some(a=>a.wall===null),"Skipping a wall remains legal");
    assert.ok(all.some(a=>a.wall!==null),"Wall shift remains legal");
    assert.ok(all.every(a=>apply(s,a).winner===null),"One move must not end a match");
    assert.ok(all.every(a=>apply(s,a).scores[s.turn]===0),
      "This trial avoids a trivial first-action pickup on either side");
    const first=apply(s,all[0]);
    assert.equal(first.ply,1);
    assert.equal(first.stars.length,starCount);
    assert.deepEqual(first.scores,[0,0]);
  }
  assert.equal(actions(states[0]).length,actions(states[1]).length,
    "Opening options should have the same count after switching starting side");
  }
  const dense=initial(index),sparse=initial(index+1);
  assert.deepEqual(dense.walls,sparse.walls);
  assert.deepEqual(dense.players,sparse.players);
  assert.ok(sparse.stars.every(s=>dense.stars.includes(s)));
  const quick=initial(index+2);
  assert.deepEqual(quick.walls,dense.walls);
  assert.deepEqual(quick.stars,dense.stars);
  assert.deepEqual(quick.players,dense.players);
  assert.equal(quick.target,4);
  assert.equal(dense.target,5);
  assert.ok(dense.stars.length/(dense.size*dense.size)>initial(0).stars.length/49,
    "Main candidate should not feel visually sparser than the beginner board");
});

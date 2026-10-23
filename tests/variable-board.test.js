import test from "node:test";
import assert from "node:assert/strict";
import { initial, step, slide, actions, apply, successors, distances, key } from "../src/engine.js";

function variant(size, target) {
  return {
    size, target, walls: [], stars: [size - 1],
    players: [0, size * size - 1], scores: [target - 1, 0],
    turn: 0, ply: 0, winner: null,
  };
}
test("legacy Sprint retains 7x7 and first-to-three", () => {
  const s = initial();
  assert.equal(s.size, 7);
  assert.equal(s.target, 3);
  assert.equal(step(6, 1), null);
  assert.equal(step(42, 2), null);
});
test("8x8, 9x9 and 10x10 use their own boundaries and distances", () => {
  for (const [size, target] of [[8,4],[9,5],[10,6]]) {
    const s = variant(size,target);
    assert.equal(step(size-1,1,size),null);
    assert.equal(step(size*(size-1),2,size),null);
    assert.equal(step(0,1,size),1);
    assert.equal(step(0,2,size),size);
    assert.equal(slide(s,0,1),size-1);
    assert.equal(distances(s,0).length,size*size);
    const move = actions(s).find(a=>a.wall===null && a.dir===1);
    assert.ok(move);
    const actual=apply(s,move);
    const predicted=successors(s).find(x=>x.a.wall===null && x.a.dir===1).n;
    assert.equal(actual.winner,0);
    assert.deepEqual(predicted,actual);
  }
});
test("state identity includes size and target",()=>{
  const a=variant(8,4);
  assert.notEqual(key(a),key({...a,size:9}));
  assert.notEqual(key(a),key({...a,target:5}));
});
test("win threshold is not hardcoded to three",()=>{
  const s=variant(9,5);
  s.scores=[3,0];
  const n=apply(s,{wall:null,dir:1});
  assert.equal(n.scores[0],4);
  assert.equal(n.winner,null);
});

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
  assert.equal(s.size, undefined); // Preserve the original serialized 7x7 state.
  assert.equal(s.target, undefined); // Legacy states imply first to three.
  assert.equal(step(6, 1), null);
  assert.equal(step(42, 2), null);
});
test("A–E fixtures remain research-only and their legal turns survive serialization", async () => {
  const { RESEARCH_LAYOUTS } = await import('../src/research-layouts.js');
  assert.deepEqual(RESEARCH_LAYOUTS.map(b => [b.id,b.size,b.target]), [['A',8,4],['B',9,3],['C',10,3],['D',6,4],['E',11,3]]);
  for (let i=0;i<5;i++) for (const starter of [0,1]) {
    const state=initial(i+4,starter), before=structuredClone(state), moves=actions(state);
    assert.ok(moves.length);
    assert.deepEqual(actions(JSON.parse(JSON.stringify(state))), moves);
    assert.ok(moves.some(a=>a.wall));
    for (const action of moves) {
      const result=apply(state,action);
      assert.deepEqual(apply(JSON.parse(JSON.stringify(state)), action), result);
      assert.equal(result.stars.length + result.scores[0] + result.scores[1], state.stars.length);
    }
    assert.deepEqual(state,before);
    assert.throws(()=>apply(state,{wall:{wall:0,to:-1},dir:0}));
    assert.equal(step(state.size-1,1,state),null);
    assert.equal(step(state.size*(state.size-1),2,state),null);
    const scoring=variant(state.size,state.target);
    const win=apply(scoring,{wall:null,dir:1});
    assert.equal(win.scores[0],state.target);
    assert.equal(win.winner,0);
    assert.equal(win.stars.length,0);
  }
});
test('legacy key matches archived 7x7 serialization',()=>{
  const s=initial();
  assert.equal(key(s), JSON.stringify([[...s.walls].sort((a,b)=>a-b),[...s.stars].sort((a,b)=>a-b),s.players,s.scores,s.turn]));
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

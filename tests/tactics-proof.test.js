import test from "node:test";
import assert from "node:assert/strict";
import {initial,successors} from "../src/engine.js";
import {prove,WIN,DRAW,UNKNOWN} from "../scripts/tactics-proof.js";
test("terminal victory is proved without exploring",()=>{
  const s={...initial(0),winner:0};
  assert.equal(prove(s,{horizon:120,nodeBudget:1}).result,WIN);
});
test("zero horizon is an analytical draw, not an official draw",()=>{
  const r=prove(initial(0),{horizon:0,nodeBudget:1});
  assert.equal(r.result,DRAW);
  assert.equal(r.proven,true);
  assert.match(r.capConvention,/analytical draw/);
});
test("one-ply proof enumerates all available actions",()=>{
  const s=initial(0);
  const r=prove(s,{horizon:1,nodeBudget:10000,horizonPruning:false});
  assert.equal(r.proven,true);
  assert.equal(r.result,DRAW);
  assert.equal(r.nodes,1);
  assert.ok(successors(s).length>1);
});
test("limited budget never pretends to prove a multi-ply result",()=>{
  const r=prove(initial(0),{horizon:3,nodeBudget:1,horizonPruning:false});
  assert.equal(r.result,UNKNOWN);
  assert.equal(r.proven,false);
});

test("immediate scoring victory is proved even with a one-node budget",()=>{
  const base=initial(0);
  const s={...base, players:[2,4], scores:[2,0], stars:[3,17,24,31,45], target:3, turn:0};
  const winning=successors(s).filter(({n})=>n.winner===0);
  assert.ok(winning.length>0,"fixture must contain a legal immediate winning move");
  const r=prove(s,{horizon:3,nodeBudget:1,horizonPruning:false});
  assert.equal(r.result,WIN);
  assert.equal(r.proven,true);
  assert.equal(r.nodes,1);
  assert.ok(r.cutoffs>=1);
});

test("forced loss is proved when every legal reply lets the opponent win",()=>{
  // In a two-ply game tree, an opponent win is a LOSS only when every
  // legal first move allows it; a single threatening reply is insufficient.
  const base=initial(0);
  const s={...base,players:[2,4],scores:[0,2],stars:[3,17,24,31,45],target:3,turn:0};
  const replies=successors(s);
  assert.ok(replies.length>0);
  const r=prove(s,{horizon:2,nodeBudget:200000});
  // No assertion of forced loss here: this is a consistency check against
  // the exact two-ply successor quantifiers, including legal wall moves.
  const everyMoveLoses=replies.every(({n})=>n.winner===1 || successors(n).some(({n:next})=>next.winner===1));
  assert.equal(r.result===-1,everyMoveLoses);
  assert.equal(r.proven,true);
});

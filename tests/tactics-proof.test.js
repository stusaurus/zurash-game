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
  const r=prove(s,{horizon:1,nodeBudget:10000});
  assert.equal(r.proven,true);
  assert.equal(r.result,DRAW);
  assert.equal(r.nodes,1);
  assert.ok(successors(s).length>1);
});
test("limited budget never pretends to prove a multi-ply result",()=>{
  const r=prove(initial(0),{horizon:3,nodeBudget:1});
  assert.equal(r.result,UNKNOWN);
  assert.equal(r.proven,false);
});

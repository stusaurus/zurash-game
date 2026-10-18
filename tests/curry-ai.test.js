import test from "node:test";
import assert from "node:assert/strict";
import {initialCurry,successorsCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {chooseCurry} from "../experiments/curry-ai.js";
import {seeded} from "../src/ai.js";
test("curry-aware CPU always returns legal action, including powered movement",()=>{
 for(let l=0;l<3;l++)for(let starter=0;starter<2;starter++)for(let active of [false,true]){
  const s=initialCurry(l,starter,l===2?[13,35]:[7,41]);
  if(active)s.powers[starter]=1;
  for(const level of ["greedy","strong"]){
   const a=chooseCurry(s,{level,rng:seeded(409+starter+7*l)});
   assert.ok(a, "valid CPU action");
   const legal=successorsCurry(s).map(x=>JSON.stringify(x.a));
   assert.ok(legal.includes(JSON.stringify(a)), "CPU may only choose legal action");
  }
 }
});
test("curry CPU takes a legal immediate star-three victory",()=>{
 const base=initialCurry(2,0,[13,35]);
 let found=0;
 for(const move of successorsCurry(base).slice(0,25)){
  const s={...move.n,scores:[2,2],turn:0,winner:null};
  const winning=successorsCurry(s).filter(x=>x.n.winner===0);
  if(!winning.length)continue;
  const action=chooseCurry(s,{level:"strong",rng:seeded(29)});
  const selected=successorsCurry(s).find(x=>JSON.stringify(x.a)===JSON.stringify(action));
  assert.equal(selected.n.winner,0);
  found++;
 }
 assert.ok(found>=1,"verify at least one winning state");
});
test("laboratory curry keys include boosts and foods for repetition detection",()=>{
 const s=initialCurry(2,0,[13,35]);
 const boosted={...s,powers:[1,0]};
 const consumed={...s,curries:[35]};
 assert.notEqual(stateKeyCurry(s),stateKeyCurry(boosted));
 assert.notEqual(stateKeyCurry(s),stateKeyCurry(consumed));
});

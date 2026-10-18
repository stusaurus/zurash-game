import test from "node:test";
import assert from "node:assert/strict";
import {initialCurry,successorsCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {chooseCurry,progressKey} from "../experiments/curry-ai.js";
import {seeded} from "../src/ai.js";

test("progress key ignores wall arrangement but retains scoring, position, food and power",()=>{
 const s=initialCurry(2,0,[13,35]);
 const move=successorsCurry(s).find(x=>x.a.wall !== null);
 assert.ok(move);
 const other={...s,walls:[...move.n.walls]};
 assert.equal(progressKey(s),progressKey(other));
 assert.notEqual(stateKeyCurry(s),stateKeyCurry(other));
 assert.notEqual(progressKey(s),progressKey({...s,stars:s.stars.slice(1)}));
 assert.notEqual(progressKey(s),progressKey({...s,curries:[13]}));
 assert.notEqual(progressKey(s),progressKey({...s,powers:[1,0]}));
 assert.notEqual(progressKey(s),progressKey({...s,scores:[1,0]}));
 assert.notEqual(progressKey(s),progressKey({...s,turn:1}));
});

test("progress CPU keeps all actions legal with or without available curry",()=>{
 for(let l=0;l<3;l++)for(let starter=0;starter<2;starter++)for(const active of [false,true]){
  const s=initialCurry(l,starter,l===2?[13,35]:[7,41]);
  if(active)s.powers[starter]=1;
  const seen=new Map([[stateKeyCurry(s),4]]);
  const choice=chooseCurry(s,{level:"progress",rng:seeded(707+l*83+starter),seen});
  assert.ok(successorsCurry(s).some(x=>JSON.stringify(x.a)===JSON.stringify(choice)),
   "progress CPU must always choose a legal action");
 }
});

test("progress CPU chooses immediate win rather than repeat penalty",()=>{
 const base=initialCurry(2,0,[13,35]);
 let checked=0;
 for(const step of successorsCurry(base).slice(0,28)){
  const s={...step.n,scores:[2,2],turn:0,winner:null};
  const winning=successorsCurry(s).filter(x=>x.n.winner===0);
  if(!winning.length)continue;
  const seen=new Map(winning.map(x=>[stateKeyCurry(x.n),25]));
  const a=chooseCurry(s,{level:"progress",rng:seeded(11),seen});
  const result=successorsCurry(s).find(x=>JSON.stringify(x.a)===JSON.stringify(a));
  assert.equal(result.n.winner,0);
  checked++;
 }
 assert.ok(checked>0);
});

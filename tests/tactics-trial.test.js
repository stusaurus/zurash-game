import test from "node:test";
import assert from "node:assert/strict";
import {initial,actions,apply,LAYOUTS} from "../src/engine.js";

test("trial candidate 12 is opt-in and preserves original layout indices",()=>{
 assert.equal(LAYOUTS[0].name,"はじまりの氷原");
 assert.equal(LAYOUTS[1].name,"ふたつの谷");
 assert.equal(LAYOUTS[2].name,"こおりの回廊");
 assert.equal(LAYOUTS[3].name,"タクティクス試遊（候補12）");
 assert.deepEqual(initial(3).walls,[21,27,2,46,10,38,18,30]);
 assert.deepEqual(initial(3).stars,[24,19,29,5,43]);
 for(const starter of [0,1]){
  const s=initial(3,starter);
  assert.ok(actions(s).length>0);
  const next=apply(s,actions(s)[0]);
  assert.equal(next.ply,1);
 }
});

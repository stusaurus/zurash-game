import test from "node:test";
import assert from "node:assert/strict";
import {initialCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";

test("neither starter can force a star within first 3 plies on the two tested curry layouts",()=>{
 for(const pair of [[21,27],[5,43]])for(const starter of [0,1]){
  const s=initialCurry(2,starter,pair);
  const moves=successorsTwoWall(s);
  assert.equal(moves.some(x=>x.n.scores[starter]>0),false,
   "No instant first-turn star under current rule");
  let forcedCount=0;
  for(const first of moves){
   const counterplay=successorsTwoWall(first.n);
   assert.ok(counterplay.length>0);
   const canRefute=counterplay.some(reply=>
    !successorsTwoWall(reply.n).some(after=>after.n.scores[starter]>0)
   );
   if(!canRefute)forcedCount++;
  }
  assert.equal(forcedCount,0,
   "Opponent must have a defense against every 1st-move star threat: "+pair+","+starter);
 }
});

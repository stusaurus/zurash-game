import test from "node:test";
import assert from "node:assert/strict";
import {initialCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
import {seeded} from "../src/ai.js";
import {chooseOrientationFairTwoWall,rotateCurryState,rotateTwoWallAction,
 rotateCurryHistory} from "../experiments/curry-two-wall-symmetry.js";

test("orientation-normalized curry CPU chooses matching actions on rotated positions",()=>{
 for(const pair of [[21,27],[13,35],[5,43]]){
  for(const starter of [0,1]){
   const s=initialCurry(2,starter,pair);
   for(const boosted of [false,true]){
    const state={...s,powers:boosted?(starter===0?[1,0]:[0,1]):[0,0]};
    const seen=new Map([[stateKeyCurry(state),3]]);
    const r=rotateCurryState(state);
    const a=chooseOrientationFairTwoWall(state,{rng:seeded(93+starter),seen});
    const b=chooseOrientationFairTwoWall(r,{rng:seeded(93+starter),seen:rotateCurryHistory(seen)});
    assert.deepEqual(b,rotateTwoWallAction(a),JSON.stringify({pair,starter,boosted}));
    assert.ok(successorsTwoWall(state).some(x=>JSON.stringify(x.a)===JSON.stringify(a)));
    assert.deepEqual(rotateCurryState(r),state);
   }
  }
 }
});

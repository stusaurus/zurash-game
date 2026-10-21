import test from "node:test";
import assert from "node:assert/strict";
import {initial,actions,apply,key,LAYOUTS} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {chooseSymmetricRoute,rotateState,rotateAction,rotateHistory} from "../scripts/symmetry-policy.js";

test("research CPU action is identical under 180-degree rotation + swapping players",()=>{
  for(let layout=0;layout<LAYOUTS.length;layout++){
    for(let first=0;first<2;first++){
      let s=initial(layout,first),seen=new Map();
      const rng=seeded(314+layout*23+first*419);
      for(let step=0;step<14 && s.winner===null;step++){
        const k=key(s);seen.set(k,(seen.get(k)||0)+1);
        const rotated=rotateState(s);
        assert.deepEqual(rotateState(rotated),s);
        const policySeed=907+layout*713+first*163+step*29;
        const a=chooseSymmetricRoute(s,{rng:seeded(policySeed),seen});
        const b=chooseSymmetricRoute(rotated,{rng:seeded(policySeed),seen:rotateHistory(seen)});
        assert.deepEqual(b,rotateAction(a),
          `layout ${layout}, starter ${first}, ply ${step}`);
        if(!a)break;
        const available=actions(s);
        assert.ok(available.some(move=>JSON.stringify(move)===JSON.stringify(a)),
          "symmetry policy must return a legal move");
        s=apply(s,available[Math.floor(rng()*available.length)]);
      }
    }
  }
});

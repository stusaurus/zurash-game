import assert from "node:assert/strict";
import fs from "node:fs";
import {initial,actions,apply,LAYOUTS} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {chooseRoute} from "../src/route-ai.js";
import {rotateState,rotateAction,chooseSymmetricRoute} from "./symmetry-policy.js";

// Reproduces a diagnostic sample: not an unbiased estimate of human advantage.
const rows=[];
for(let layout=0;layout<LAYOUTS.length;layout++){
  let s=initial(layout,0),originalMatches=0,normalizedMatches=0,examined=0;
  const examples=[];
  for(let ply=0;ply<22 && s.winner===null;ply++){
    const before=chooseRoute(s,{rng:seeded(99000+ply),seen:new Map()});
    const after=chooseRoute(rotateState(s),{rng:seeded(99000+ply),seen:new Map()});
    const beforeNormalized=chooseSymmetricRoute(s,{rng:seeded(99000+ply),seen:new Map()});
    const afterNormalized=chooseSymmetricRoute(rotateState(s),{rng:seeded(99000+ply),seen:new Map()});
    if(before && after){
      examined++;
      if(JSON.stringify(rotateAction(before))===JSON.stringify(after))originalMatches++;
      else examples.push({ply,before,expected:rotateAction(before),after});
      if(JSON.stringify(rotateAction(beforeNormalized))===JSON.stringify(afterNormalized))normalizedMatches++;
    }
    const legal=actions(s);
    if(!legal.length)break;
    const choice=legal[Math.floor(seeded(1103+ply+layout*100)()*legal.length)];
    s=apply(s,choice);
  }
  assert.equal(examined,normalizedMatches,"normalized CPU should be rotation invariant");
  rows.push({layout,name:LAYOUTS[layout].name,examined,originalMatches,normalizedMatches,examples});
}
const report={description:"Selected deterministic reachable positions, not fairness outcomes. The CPU strength/first-mover win rate must be assessed by separate paired holdouts.",rows,sha:process.env.GITHUB_SHA || "local"};
fs.mkdirSync("reports",{recursive:true});
const path=process.env.REPORT||"reports/ai-rotation-diagnostic.json";
fs.writeFileSync(path,JSON.stringify(report,null,2)+"\n");
console.log("ROTATION_DIAGNOSTIC "+JSON.stringify(rows.map(({layout,examined,originalMatches,normalizedMatches})=>({layout,examined,originalMatches,normalizedMatches}))));

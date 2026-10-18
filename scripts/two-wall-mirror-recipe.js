// Test the naive seat-mirroring recipe often suggested for rotationally
// symmetric board games. Verifies legal responses, not match-win correctness.
import fs from "node:fs";
import {initialCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
const rotate = x=>48-x;
const sorted=a=>[...a].sort((x,y)=>x-y);
function same(a,b){return JSON.stringify(a)===JSON.stringify(b);}
export function isRotationallyRestored(s){
 if(s.winner!==null || s.players[0]!==rotate(s.players[1]) ||
  s.scores[0]!==s.scores[1]||s.powers[0]!==s.powers[1])return false;
 for(const field of ["walls","stars","curries"]){
  if(!same(sorted(s[field]),sorted(s[field].map(rotate))))return false;
 }
 return true;
}
function scan(pair,starter){
 const s=initialCurry(2,starter,pair);
 const openings=successorsTwoWall(s);
 let mirrorable=0,unmirrorable=0;
 const examples=[];
 const symmetricAfterReplies=[];
 for(const root of openings){
  const defenses=successorsTwoWall(root.n);
  const restored=defenses.filter(x=>isRotationallyRestored(x.n));
  if(restored.length){
   mirrorable++;
   if(symmetricAfterReplies.length<10){
    symmetricAfterReplies.push({s:restored[0].n,opening:root.a,reply:restored[0].a});
   }
  }else{
   unmirrorable++;
   if(examples.length<5)examples.push({
    first:root.a,opponentOptions:defenses.length,afterFirst:root.n
   });
  }
 }
 // Not an adversarial second-cycle proof: simply screen whether symmetry can
 // always be restored from a sampling of legally restored states.
 let secondCyclePairs=0,secondCycleBroken=0;
 let breaker=null;
 for(const c of symmetricAfterReplies){
  for(const action of successorsTwoWall(c.s)){
   secondCyclePairs++;
   if(!successorsTwoWall(action.n).some(x=>isRotationallyRestored(x.n))){
    secondCycleBroken++;
    breaker??={first:c.opening,mirror:c.reply,nextMove:action.a};
   }
  }
 }
 return {pair,starter,initialSymmetric:isRotationallyRestored(s),
  initialMoves:openings.length,mirrorable,unmirrorable,
  samples:examples,secondCyclePairs,secondCycleBroken,breaker,
  interpretation:"If unmirrorable>0, strict rotational mirroring is not a universal reply at opening. If secondCycleBroken>0, a reachable response breaks this recipe by next cycle. Neither establishes a forced match winner."};
}
const rows=[];
for(const pair of [[21,27],[5,43]])for(const starter of [0,1]){
 const row=scan(pair,starter);
 rows.push(row);
 console.log("MIRROR_ROW "+JSON.stringify({
  pair,starter,initialMoves:row.initialMoves,mirrorable:row.mirrorable,
  unmirrorable:row.unmirrorable,secondCyclePairs:row.secondCyclePairs,
  secondCycleBroken:row.secondCycleBroken,example:row.samples[0],
  breaker:row.breaker
 }));
}
const REPORT=process.env.REPORT??"reports/two-wall-mirror-recipe.json";
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify({version:1,source:process.env.GITHUB_SHA??"local",rows},null,2)+"\n");
console.log("MIRROR_COMPLETE "+JSON.stringify({rows:rows.map(x=>({
 pair:x.pair,starter:x.starter,firstFails:x.unmirrorable,
 secondCycleBroken:x.secondCycleBroken
}))}));

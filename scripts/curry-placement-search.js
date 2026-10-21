// Preliminary curry placement search. Uses orientation-invariant simple agents,
// paired starter swap, independent training/holdout/validation seeds.
// This is NOT a proof of full-game or optimal-player fairness.
import fs from "node:fs";
import {initial, LAYOUTS} from "../src/engine.js";
import {initialCurry, successorsCurry} from "../experiments/curry-power.js";
const pairs=Number(process.env.TRAIN_PAIRS??40);
const holdoutPairs=Number(process.env.HOLDOUT_PAIRS??100);
const validatePairs=Number(process.env.VALIDATION_PAIRS??100);
const cap=Number(process.env.MAX_PLIES??100);
if(![pairs,holdoutPairs,validatePairs,cap].every(n=>Number.isInteger(n)&&n>0&&n<=500))
  throw Error("invalid trial budget");
const report=process.env.REPORT??"reports/curry-placement-search.json";
const policies=["star-first","curry-seeker"];
const bonuses=[1,2]; // +1 (two total) vs proposed +2 (three total)
const start=Date.now(),phaseResults=[];
const flip=x=>48-x;
const normalizedState=(n,actor)=>{
 const f=actor===0?x=>x:flip;
 return JSON.stringify([
  n.walls.map(f).sort((a,b)=>a-b),
  n.stars.map(f).sort((a,b)=>a-b),
  actor===0?n.players:[flip(n.players[1]),flip(n.players[0])],
  actor===0?n.scores:[n.scores[1],n.scores[0]],
  actor===0?n.curries.map(f).sort((a,b)=>a-b):n.curries.map(f).sort((a,b)=>a-b),
  actor===0?n.powers:[n.powers[1],n.powers[0]]
 ]);
};
function hash(seed,s){
 let h=(2166136261^(seed>>>0))>>>0;
 for(let k=0;k<s.length;k++){h=Math.imul(h^s.charCodeAt(k),16777619)>>>0;}
 return h>>>0;
}
function nearest(tiles,pos){
 const x=pos%7,y=Math.floor(pos/7);
 return Math.min(8,...tiles.map(t=>Math.abs(x-t%7)+Math.abs(y-Math.floor(t/7))));
}
function choose(s,entries,policy,seed){
 let best=null,rank=-Infinity,tie=-1;
 for(const entry of entries){
  const p=s.turn,n=entry.n;
  const scored=n.scores[p]-s.scores[p];
  const reward=(policy==="curry-seeker"?1300:450);
  const value=scored*1100+entry.picked*reward
    -nearest(n.stars,n.players[p])*16
    -(n.curries.length?nearest(n.curries,n.players[p]):0)*(policy==="curry-seeker"?24:10);
  const h=hash(seed+s.ply*317,normalizedState(n,p));
  if(value>rank || (value===rank && h>tie)){best=entry;rank=value;tie=h;}
 }
 return best;
}
function run(layout,bonus,pair,policy,starter,seed){
 const s0=initial(layout,starter);
 let s=pair?initialCurry(layout,starter,pair):{...s0,curries:[],powers:[0,0]};
 let pickups=0,boosts=0,powerTurns=0,quiet=0,maxQuiet=0,noLegal=false;
 while(s.winner===null&&s.ply<cap){
  if(s.powers[s.turn])powerTurns++;
  const moves=successorsCurry(s,bonus);
  if(!moves.length){noLegal=true;break;}
  const chosen=choose(s,moves,policy,seed);
  pickups+=Number(chosen.picked);boosts+=Number(chosen.boostUsed);
  if(chosen.n.stars.length!==s.stars.length){maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}
  else quiet++;
  s=chosen.n;
 }
 maxQuiet=Math.max(maxQuiet,quiet);
 return {starter,winner:s.winner,capped:s.winner===null,plies:s.ply,pickups,boosts,powerTurns,stalled:maxQuiet>=20,noLegal};
}
function evaluate(layout,bonus,pair,policy,n,offset){
 const results=[];
 for(let i=0;i<n;i++)for(let starter=0;starter<2;starter++)
  results.push(run(layout,bonus,pair,policy,starter,offset+i*131071));
 const decided=results.filter(g=>!g.capped),first=decided.filter(g=>g.winner===g.starter).length;
 const capped=results.length-decided.length;
 const pickups=results.reduce((a,g)=>a+g.pickups,0),boosts=results.reduce((a,g)=>a+g.boosts,0);
 return {layout,bonus,pair,policy,pairs:n,games:results.length,firstWins:first,secondWins:decided.length-first,
  capped,firstRate:decided.length?+(first/decided.length).toFixed(4):null,
  cappedRate:+(capped/results.length).toFixed(4),
  stalled20:results.filter(g=>g.stalled).length,
  meanPlies:+(results.reduce((a,g)=>a+g.plies,0)/results.length).toFixed(2),
  pickups,boosts,powerTurns:results.reduce((a,g)=>a+g.powerTurns,0),
  noLegal:results.filter(g=>g.noLegal).length};
}
function score(m){
 if(m.firstRate===null)return 100;
 return 4*Math.abs(m.firstRate-.5)+3*m.cappedRate+
   m.stalled20/m.games+Number(m.noLegal>0)*10+
   (m.boosts<Math.max(1,m.games*.20)?1:0);
}
function candidates(layout){
 const base=initial(layout,0),occupied=new Set([...base.walls,...base.players,...base.stars]);
 const out=[];
 for(let i=0;i<24;i++){
  const p=[i,48-i];
  if(p.some(x=>occupied.has(x)))continue;
  const a=initialCurry(layout,0,p),b=initialCurry(layout,1,p);
  if(successorsCurry(a).some(m=>m.picked)||successorsCurry(b).some(m=>m.picked))continue;
  out.push(p);
 }
 return out;
}
for(let layout=0;layout<3;layout++)for(const bonus of bonuses){
 const original=policies.map(policy=>evaluate(layout,0,null,policy,pairs,450007));
 const placements=candidates(layout);
 const search=placements.map(pair=>{
  const metrics=policies.map(policy=>evaluate(layout,bonus,pair,policy,pairs,450007));
  return {pair,metrics,loss:Math.max(...metrics.map(score))};
 }).sort((a,b)=>a.loss-b.loss);
 const candidateChecks=[];
 // Do NOT use holdout performance to choose a winner.
 for(const place of search.slice(0,3)){
  const holdout=policies.map(policy=>evaluate(layout,bonus,place.pair,policy,holdoutPairs,90000017+layout*8839+bonus*307));
  const validation=policies.map(policy=>evaluate(layout,bonus,place.pair,policy,validatePairs,29000029+layout*8839+bonus*307));
  candidateChecks.push({pair:place.pair,train:place.metrics,trainLoss:place.loss,holdout,validation});
 }
 phaseResults.push({layout,name:LAYOUTS[layout].name,extraWallCells:bonus,
   placementCandidates:placements.length,baseline:original,
   trainingLeaderboard:search.map(x=>({pair:x.pair,loss:+x.loss.toFixed(3),metrics:x.metrics})),
   checks:candidateChecks});
 console.log("CURRY_PLACEMENT_PHASE "+JSON.stringify({layout,bonus,placements:placements.length,
   top:search.slice(0,3).map(x=>({pair:x.pair,loss:+x.loss.toFixed(3)})),
   checks:candidateChecks.map(x=>({pair:x.pair,holdout:x.holdout.map(m=>({
     policy:m.policy,first:m.firstWins,second:m.secondWins,capped:m.capped,
     boosts:m.boosts,stalled:m.stalled20})),validation:x.validation.map(m=>({
     policy:m.policy,first:m.firstWins,second:m.secondWins,capped:m.capped,
     boosts:m.boosts,stalled:m.stalled20}))}))}));
}
const doc={version:1,source:process.env.GITHUB_SHA??"local",
 parameters:{trainPairs:pairs,holdoutPairs,validationPairs:validatePairs,cap},
 caution:"Research-only two simple orientation-canonical greedy policies, not strong route CPU and not human fairness. Candidate ranking uses TRAIN ONLY; holdout and validation never feed candidate selection. Non-finishers are NOT draws. Symmetric geometry is necessary but NOT sufficient.",
 rows:phaseResults,elapsedSeconds:+((Date.now()-start)/1000).toFixed(2)};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(report,JSON.stringify(doc,null,2)+"\n");
console.log("CURRY_PLACEMENT_COMPLETE "+JSON.stringify({seconds:doc.elapsedSeconds,layouts:3,
 testedCandidates:phaseResults.reduce((n,r)=>n+r.placementCandidates,0),
 report}));

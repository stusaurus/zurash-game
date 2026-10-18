import fs from "node:fs";
import { initial, LAYOUTS } from "../src/engine.js";
import { initialCurry, successorsCurry, stateKeyCurry } from "../experiments/curry-power.js";
import { chooseCurry } from "../experiments/curry-ai.js";
import { seeded } from "../src/ai.js";
import { turnSeed } from "../src/cpu-seed.js";

const PAIRS=Number(process.env.PAIRS??6), CAP=Number(process.env.MAX_PLIES??120);
const OFFSET=Number(process.env.SEED_OFFSET??880113);
const POLICY_LIST=(process.env.POLICIES??"strong,greedy").split(",").filter(Boolean);
const SELECTED_PAIRS=process.env.PLACEMENTS
 ? new Set(process.env.PLACEMENTS.split(";").map(s=>s.split(",").map(Number).join(","))) : null;
if(!Number.isSafeInteger(OFFSET)||OFFSET<1 || 
   POLICY_LIST.some(p=>!["strong","greedy"].includes(p)))throw Error("invalid validation arguments");
const OUT=process.env.REPORT??"reports/curry-tactical-leverage.json";
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>30||!Number.isInteger(CAP)||CAP<10||CAP>200)
 throw Error("invalid trial bounds");
// All rotated curry pairs that avoid an immediate pickup in the corridor.
// A low-cost opportunity search, not a stage-certification experiment.
const base=initial(2,0),occupied=new Set([...base.walls,...base.stars,...base.players]);
const placements=[];
for(let i=0;i<24;i++){
 const pair=[i,48-i];
 if(pair.some(x=>occupied.has(x)))continue;
 const s=initialCurry(2,0,pair);
 if([0,1].some(starter=>successorsCurry(initialCurry(2,starter,pair)).some(e=>e.picked)))continue;
 placements.push(pair);
}
function one(pair,policy,starter,seed){
 let s=initialCurry(2,starter,pair),history=new Map();
 const totals={powers:0,onlyStar:0,onlyWin:0,onlyLanding:0,starOnBoost:0,
  powerUsed:0,curryPicked:0,repeatState:0};
 let quiet=0,maxQuiet=0;
 while(s.winner===null&&s.ply<CAP){
  const seenKey=stateKeyCurry(s);
  totals.repeatState+=+(history.has(seenKey));
  history.set(seenKey,(history.get(seenKey)||0)+1);
  if(s.powers[s.turn]){
   totals.powers++;
   const regular=successorsCurry(s,0),powered=successorsCurry(s,2);
   const p=s.turn;
   const regularStops=new Set(regular.map(x=>x.n.players[p]));
   if(powered.some(x=>!regularStops.has(x.n.players[p])))totals.onlyLanding++;
   const canScore=seq=>seq.some(x=>x.n.scores[p]>s.scores[p]);
   const canWin=seq=>seq.some(x=>x.n.winner===p);
   if(canScore(powered)&&!canScore(regular))totals.onlyStar++;
   if(canWin(powered)&&!canWin(regular))totals.onlyWin++;
  }
  const action=chooseCurry(s,{
   level:policy,extra:2,seen:history,rng:seeded(turnSeed(seed,s.ply))
  });
  const e=successorsCurry(s,2).find(x=>JSON.stringify(x.a)===JSON.stringify(action));
  if(!e)throw Error("selected illegal action");
  totals.curryPicked+=+(e.picked);
  totals.powerUsed+=+(e.boostUsed);
  totals.starOnBoost+=+(e.boostUsed && e.n.scores[s.turn]>s.scores[s.turn]);
  if(e.n.stars.length<s.stars.length){maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}
  else quiet++;
  s=e.n;
 }
 maxQuiet=Math.max(maxQuiet,quiet);
 return {...totals,starter,winner:s.winner,capped:s.winner===null,
  plies:s.ply,stalled20:maxQuiet>=20};
}
const started=Date.now(),rows=[];
const planned=SELECTED_PAIRS?placements.filter(p=>SELECTED_PAIRS.has(p.join(","))):placements;
if(!planned.length)throw Error("No valid curry placements selected");
for(const pair of planned)for(const policy of POLICY_LIST){
 const games=[];
 for(let seedIndex=0;seedIndex<PAIRS;seedIndex++)for(const starter of [0,1]){
  const seed=OFFSET+seedIndex*7129;
  games.push(one(pair,policy,starter,seed));
 }
 const sum=k=>games.reduce((a,g)=>a+g[k],0),decided=games.filter(g=>g.winner!==null);
 const first=decided.filter(g=>g.winner===g.starter).length;
 const result={pair,policy,games:games.length,first,second:decided.length-first,
  capped:games.length-decided.length,stalled20:sum("stalled20"),
  avgPlies:+(sum("plies")/games.length).toFixed(1),poweredTurns:sum("powers"),
  boostActions:sum("powerUsed"),curryPickups:sum("curryPicked"),
  poweredOnlyStar:sum("onlyStar"),poweredOnlyWin:sum("onlyWin"),
  poweredOnlyLanding:sum("onlyLanding"),scoringByBoost:sum("starOnBoost")};
 rows.push(result);
 console.log("CURRY_LEVERAGE_ROW "+JSON.stringify(result));
}
const report={version:1,source:process.env.GITHUB_SHA??"local",
 description:"Preliminary reachability and power leverage for all legal initial 180-degree curry pairs in corridor. Same-seed initiative swapping, 2 AI policies. Small sample; not a fairness certification.",
 parameters:{pairs:PAIRS,cap:CAP,layout:2,seedOffset:OFFSET,policies:POLICY_LIST,selectedPairs:[...planned]},
 elapsedSeconds:+((Date.now()-started)/1000).toFixed(1),rows};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(report,null,2)+"\n");
console.log("CURRY_LEVERAGE_COMPLETE "+JSON.stringify({
  games:rows.reduce((x,y)=>x+y.games,0),
  pairs:planned.length,
  powers:rows.reduce((x,y)=>x+y.poweredTurns,0),
  onlyStar:rows.reduce((x,y)=>x+y.poweredOnlyStar,0),
  onlyLanding:rows.reduce((x,y)=>x+y.poweredOnlyLanding,0),
  seconds:report.elapsedSeconds,
}));

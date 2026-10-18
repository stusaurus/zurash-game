import fs from "node:fs";
import {initialCurry,successorsCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {chooseCurry} from "../experiments/curry-ai.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";
const PAIRS=Number(process.env.PAIRS??10), CAP=Number(process.env.MAX_PLIES??120);
const OUT=process.env.REPORT??"reports/curry-strong-study.json";
const SEED_OFFSET=Number(process.env.SEED_OFFSET??9000053);
if(!Number.isInteger(SEED_OFFSET)||SEED_OFFSET<0||SEED_OFFSET>1000000000)throw Error("invalid seed offset");
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>250||!Number.isInteger(CAP)||CAP<10||CAP>500)throw Error("invalid experiment parameters");
const cases=[
 {name:"curry-plus-two-strong-self",extra:2,levels:["strong","strong"]},
 {name:"curry-plus-one-strong-self",extra:1,levels:["strong","strong"]},
 {name:"curry-plus-two-strong-greedy",extra:2,levels:["strong","greedy"]},
 {name:"curry-plus-two-greedy-self",extra:2,levels:["greedy","greedy"]},
];
const start=Date.now(),result=[];
function play(spec,starter,seed,matchup){
 let s=initialCurry(2,starter,[13,35]),seen=new Map();
 let quiet=0,maxQuiet=0,pickups=[0,0],powered=[0,0],maxCpuMs=0;
 while(s.winner===null&&s.ply<CAP){
  const k=stateKeyCurry(s);seen.set(k,(seen.get(k)||0)+1);
  const t=performance.now();
  const action=chooseCurry(s,{
   level:matchup.levels[s.turn],
   extra:matchup.extra,seen,
   rng:seeded(turnSeed(seed,s.ply))
  });
  maxCpuMs=Math.max(maxCpuMs,performance.now()-t);
  const next=successorsCurry(s,matchup.extra).find(x=>JSON.stringify(x.a)===JSON.stringify(action));
  if(!next)break;
  pickups[s.turn]+=Number(next.picked);
  powered[s.turn]+=Number(next.boostUsed);
  if(next.n.stars.length<s.stars.length){maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}
  else quiet++;
  s=next.n;
 }
 maxQuiet=Math.max(maxQuiet,quiet);
 return {starter,winner:s.winner,capped:s.winner===null,plies:s.ply,pickups,powered,
  maxQuiet,stalled20:maxQuiet>=20,maxCpuMs:+maxCpuMs.toFixed(1)};
}
for(const matchup of cases){
 const games=[];
 for(let pair=0;pair<PAIRS;pair++)for(let starter=0;starter<2;starter++){
  const seed=SEED_OFFSET+pair*1009;
  games.push({...play(null,starter,seed,matchup),seed,pair});
 }
 const decided=games.filter(x=>x.winner!==null),
 firstWins=decided.filter(x=>x.winner===x.starter).length;
 const metrics={matchup:matchup.name,levels:matchup.levels,extra:matchup.extra,
  games:games.length,firstWins,secondWins:decided.length-firstWins,capped:games.length-decided.length,
  policyZeroWins:decided.filter(x=>x.winner===0).length,
  averagePlies:+(games.reduce((a,b)=>a+b.plies,0)/games.length).toFixed(2),
  stalled20:games.filter(x=>x.stalled20).length,
  pickups:games.reduce((a,b)=>a+b.pickups[0]+b.pickups[1],0),
  boostedWallMoves:games.reduce((a,b)=>a+b.powered[0]+b.powered[1],0),
  maxCpuMs:Math.max(...games.map(x=>x.maxCpuMs)),
  raw:games};
 result.push(metrics);
 console.log("CURRY_STRONG_ROW "+JSON.stringify({...metrics,raw:undefined}));
}
const doc={version:1,source:process.env.GITHUB_SHA??"local",
 config:{pairs:PAIRS,maxPlies:CAP,seedOffset:SEED_OFFSET,layout:"こおりの回廊",curryPair:[13,35],workerSeedMode:"turnSeed"},
 note:"Research only, no production changes. Paired seeds and swapped initiative. Strong is curry-aware two-ply bounded CPU. At these samples no claim of human fairness; capped is NOT a game draw.",
 elapsedSeconds:+((Date.now()-start)/1000).toFixed(1),rows:result};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(doc,null,2)+"\n");
console.log("CURRY_STRONG_COMPLETE "+JSON.stringify({games:result.reduce((n,x)=>n+x.games,0),seconds:doc.elapsedSeconds,report:OUT}));

// Cheap preliminary simulation. Not a strong-CPU fairness certification.
import fs from "node:fs";
import {initial,LAYOUTS} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {initialCurry,successorsCurry,CURRY_PAIRS} from "../experiments/curry-power.js";

const pairs=Number(process.env.PAIRS??14);
const cap=Number(process.env.MAX_PLIES??90);
const layouts=(process.env.LAYOUT_IDS??"0,1,2").split(",").map(Number);
const outfile=process.env.REPORT??"reports/curry-study.json";
if(!Number.isInteger(pairs)||pairs<1||pairs>200||!Number.isInteger(cap)||cap<1||cap>500||
   layouts.some(l=>!Number.isInteger(l)||l<0||l>=LAYOUTS.length))throw Error("Bad study parameters");
const variants=[
  {name:"original-no-curry",extra:0,pair:null},
  {name:"curry-plus-one",extra:1,pair:CURRY_PAIRS[0]},
  {name:"curry-plus-two",extra:2,pair:CURRY_PAIRS[0]},
  {name:"curry-plus-two-alternative-placement",extra:2,pair:CURRY_PAIRS[1]},
];
function heuristic(s,entry,policy,rng){
 const p=s.turn,op=1-p;
 if(policy==="random")return rng();
 const n=entry.n,starScore=n.scores[p]-s.scores[p];
 const curry=entry.picked?1:0;
 const x=n.players[p]%7,y=Math.floor(n.players[p]/7);
 const nearest=(tiles)=>Math.min(8,...tiles.map(tile=>Math.abs(tile%7-x)+Math.abs(Math.floor(tile/7)-y)));
 const nearStar=nearest(n.stars),nearCurry=nearest(n.curries);
 // Intentionally simple, different tactical preferences; NOT optimal agents.
 const curryWeight=policy==="curry-seeker"?1200:450;
 const nearFood=policy==="curry-seeker"?24:10;
 return starScore*1100+curry*curryWeight
     -(n.stars.length?nearStar:0)*16
     -(n.curries.length?nearCurry:0)*nearFood
     -(n.scores[op]===2 && n.scores[p]<2?15:0)
     +(entry.boostUsed?65:0)+rng()*0.000001;
}
function play(layout,variant,policy,starter,seed){
 const rng=seeded(seed);
 const original=initial(layout,starter);
 let s=variant.pair?initialCurry(layout,starter,variant.pair):{...original,curries:[],powers:[0,0]};
 let picks=[0,0],boosts=[0,0],powerTurns=0,quiet=0,maxQuiet=0,lastScored=-1;
 let firstCurryAt=null,noLegal=false,firstStarAt=null;
 while(s.ply<cap && s.winner===null){
   if(s.powers[s.turn]===1)powerTurns++;
   const moves=successorsCurry(s,variant.extra);
   if(moves.length===0){noLegal=true;break;}
   let best=null,bestScore=-Infinity;
   for(const entry of moves){
     const score=heuristic(s,entry,policy,rng);
     if(score>bestScore){bestScore=score;best=entry;}
   }
   if(best.picked){picks[s.turn]++;firstCurryAt??=s.ply+1;}
   if(best.boostUsed)boosts[s.turn]++;
   if(best.n.stars.length<s.stars.length){
     firstStarAt??=s.ply+1;maxQuiet=Math.max(maxQuiet,quiet);quiet=0;
   }else quiet++;
   s=best.n;
 }
 maxQuiet=Math.max(maxQuiet,quiet);
 return {starter,winner:s.winner,plies:s.ply,capped:s.winner===null,noLegal,
   firstCurryAt,firstStarAt,picks,boosts,powerTurns,stalled20:maxQuiet>=20,
   scores:s.scores};
}
const started=Date.now();
const rows=[],individual=[];
for(const layout of layouts)for(const variant of variants)for(const policy of ["star-first","curry-seeker"]){
 const results=[];
 for(let i=0;i<pairs;i++)for(let starter=0;starter<2;starter++){
   const seed=20261018+i*103+layout*100000;
   const result=play(layout,variant,policy,starter,seed);
   results.push(result);
 }
 const games=results.length,decided=results.filter(x=>!x.capped);
 const firstWins=decided.filter(x=>x.starter===x.winner).length;
 const capped=games-decided.length;
 const picks=results.reduce((n,x)=>n+x.picks[0]+x.picks[1],0);
 const boosts=results.reduce((n,x)=>n+x.boosts[0]+x.boosts[1],0);
 const powerTurns=results.reduce((n,x)=>n+x.powerTurns,0);
 const meanPlies=results.reduce((n,x)=>n+x.plies,0)/games;
 const result={layout,name:LAYOUTS[layout].name,variant:variant.name,
   curryPair:variant.pair,extraWallCells:variant.extra,policy,
   games,firstWins,secondWins:decided.length-firstWins,capped,
   firstRateDecided:decided.length?+(firstWins/decided.length).toFixed(4):null,
   meanObservedPlies:+meanPlies.toFixed(1),
   curryPickups:picks,powerTurns,boostedWallMoves:boosts,
   boostUtilization:powerTurns?+(boosts/powerTurns).toFixed(3):null,
   stalled20:results.filter(x=>x.stalled20).length,
   noLegal:results.filter(x=>x.noLegal).length,
   firstCurryPlyMedian:(()=>{
     const t=results.filter(x=>x.firstCurryAt!==null).map(x=>x.firstCurryAt).sort((a,b)=>a-b);
     return t.length?t[Math.floor((t.length-1)/2)]:null;
   })()};
 rows.push(result);
 individual.push({layout,variant:variant.name,policy,games:results});
 console.log("CURRY_ROW "+JSON.stringify(result));
}
const doc={version:1,sourceCommit:process.env.GITHUB_SHA||"local",
  parameters:{pairs,cap,layouts,variants:variants.map(x=>x.name)},
  disclaimer:"Greedy heuristics only; paired seeds not independent games. NO strong-CPU fairness validation. The total three-cell move does not jump obstacles. Power is next own turn only and expires. Capped is NOT a draw. No deployment.",
  rows,elapsedSeconds:+((Date.now()-started)/1000).toFixed(2)};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(outfile,JSON.stringify(doc,null,2)+"\n");
fs.writeFileSync(outfile.replace(/\.json$/,".games.json"),JSON.stringify(individual,null,2)+"\n");
console.log("CURRY_STUDY_COMPLETE "+JSON.stringify({games:rows.reduce((n,x)=>n+x.games,0),
  seconds:doc.elapsedSeconds,report:outfile}));

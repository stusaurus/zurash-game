import fs from "node:fs";
import {initialCurry,successorsCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
import {chooseTwoWall} from "../experiments/curry-two-wall-ai.js";
import {chooseCurry} from "../experiments/curry-ai.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";

const PAIRS=Number(process.env.PAIRS??10), CAP=Number(process.env.MAX_PLIES??120);
const SEED=Number(process.env.SEED_OFFSET??8612401);
const OUTPUT=process.env.REPORT??"reports/curry-two-wall-comparison.json";
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>200||
 !Number.isInteger(CAP)||CAP<20||CAP>250||
 !Number.isSafeInteger(SEED)||SEED<1)throw Error("Bad experiment parameters");

const matchups=[
 {variant:"move-up-to-3-cells",policy:"greedy"},
 {variant:"move-two-different-walls",policy:"greedy"},
 {variant:"move-up-to-3-cells",policy:"search"},
 {variant:"move-two-different-walls",policy:"search"},
];
function play(m,starter,seed){
 let s=initialCurry(2,starter,[21,27]),seen=new Map();
 let quiet=0,maxQuiet=0,foods=0,power=0,boost=0,dual=0;
 let illegal=false, firstStar=null;
 const two=m.variant==="move-two-different-walls";
 for(;s.winner===null&&s.ply<CAP;){
  const key=stateKeyCurry(s);seen.set(key,(seen.get(key)||0)+1);
  if(s.powers[s.turn])power++;
  const rng=seeded(turnSeed(seed,s.ply));
  const action=two?
    chooseTwoWall(s,{level:m.policy==="search"?"search":"greedy",rng,seen}):
    chooseCurry(s,{level:m.policy==="search"?"strong":"greedy",rng,seen});
  const opts=two?successorsTwoWall(s):successorsCurry(s,2);
  const moved=opts.find(x=>JSON.stringify(x.a)===JSON.stringify(action));
  if(!moved){illegal=true;break;}
  foods+=Number(moved.picked);boost+=Number(moved.boostUsed);
  dual+=Number(two&&moved.a.secondWall!==null);
  if(moved.n.stars.length<s.stars.length){
   firstStar??=moved.n.ply;
   maxQuiet=Math.max(quiet,maxQuiet);quiet=0;
  }else quiet++;
  s=moved.n;
 }
 maxQuiet=Math.max(quiet,maxQuiet);
 return {starter,winner:s.winner,capped:s.winner===null,plies:s.ply,
  foodPickups:foods,powerTurns:power,powerUsed:boost,twoWallTurns:dual,
  firstStar,stalled20:maxQuiet>=20,illegal};
}
const rows=[];const started=Date.now();
for(const matchup of matchups){
 const games=[];
 for(let i=0;i<PAIRS;i++)for(const starter of [0,1]){
  const seed=SEED+i*1009;
  games.push({...play(matchup,starter,seed),seed});
 }
 const decided=games.filter(x=>x.winner!==null);
 const fw=decided.filter(x=>x.winner===x.starter).length;
 const sum=k=>games.reduce((n,x)=>n+x[k],0);
 const row={variant:matchup.variant,policy:matchup.policy,
  games:games.length,firstWins:fw,secondWins:decided.length-fw,
  unfinished:games.length-decided.length,
  stalled20:games.filter(x=>x.stalled20).length,
  meanPlies:+(sum("plies")/games.length).toFixed(2),
  pickups:sum("foodPickups"),powerTurns:sum("powerTurns"),
  actuallyBoosted:sum("powerUsed"),twoWallMoves:sum("twoWallTurns"),
  firstStarMedian:(()=>{
   const xs=games.filter(x=>x.firstStar!==null).map(x=>x.firstStar).sort((a,b)=>a-b);
   return xs.length?xs[Math.floor((xs.length-1)/2)]:null;
  })(),
  illegal:games.filter(x=>x.illegal).length,
  gamesDetail:games};
 rows.push(row);
 console.log("TWO_WALL_ROW "+JSON.stringify({...row,gamesDetail:undefined}));
}
const doc={
 version:1,gitSha:process.env.GITHUB_SHA??"local",
 params:{pairs:PAIRS,maxPlies:CAP,seed:SEED,layout:2,curries:[21,27]},
 note:"Screening only. Both variants use their own different heuristic search policies. Self-play first-second counts do NOT establish rule fairness or relative skill; do not treat unfinished as draws. Trial is to detect stagnation, useful curry actions and play speed before human comparisons.",
 elapsedSeconds:+((Date.now()-started)/1000).toFixed(1),rows
};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(OUTPUT,JSON.stringify(doc,null,2)+"\n");
console.log("TWO_WALL_COMPLETE "+JSON.stringify({games:rows.reduce((n,r)=>n+r.games,0),
 seconds:doc.elapsedSeconds,report:OUTPUT}));

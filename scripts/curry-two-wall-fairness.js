import fs from "node:fs";
import {initialCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
import {chooseTwoWall} from "../experiments/curry-two-wall-ai.js";
import {chooseOrientationFairTwoWall} from "../experiments/curry-two-wall-symmetry.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";

// Research only: paired starter swaps, no runtime rule/UI modifications.
// Predeclare three placement candidates from prior curry studies; NEVER choose
// a winner with data from the holdout/validation blocks.
const PAIRS=Number(process.env.PAIRS??36);
const CAP=Number(process.env.MAX_PLIES??120);
const OFFSET=Number(process.env.SEED_OFFSET??5011131);
const REPORT=process.env.REPORT??"reports/curry-two-wall-fairness.json";
const PAIR_LIST=(process.env.CURRY_PAIRS??"21,27;13,35;5,43").split(";")
 .map(x=>x.split(",").map(Number));
const POLICIES=(process.env.POLICIES??"search,symmetric-search,symmetric-greedy").split(",");
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>200||
 !Number.isInteger(CAP)||CAP<20||CAP>240||
 !Number.isSafeInteger(OFFSET)||OFFSET<1||
 PAIR_LIST.some(p=>p.length!==2||p[0]+p[1]!==48||
   p.some(n=>!Number.isInteger(n)||n<0||n>=49))||
 POLICIES.some(p=>!["search","greedy","symmetric-search","symmetric-greedy"].includes(p)))
 throw Error("Invalid fairness comparison settings");

function choose(s,policy,seed,seen){
 const rng=seeded(turnSeed(seed,s.ply));
 if(policy.startsWith("symmetric-"))
  return chooseOrientationFairTwoWall(s,{level:policy.slice("symmetric-".length),rng,seen});
 return chooseTwoWall(s,{level:policy,rng,seen});
}

function play(pair,policy,starter,seed){
 let s=initialCurry(2,starter,pair),seen=new Map(),quiet=0,longestQuiet=0;
 let foods=[0,0],boosts=[0,0],starSacrifices=[0,0],firstFood=null;
 let twoWallTurns=0,firstStar=null,illegal=false;
 for(;s.winner===null&&s.ply<CAP;){
  const k=stateKeyCurry(s);
  seen.set(k,(seen.get(k)||0)+1);
  const actions=successorsTwoWall(s);
  const action=choose(s,policy,seed,seen);
  const choice=actions.find(x=>JSON.stringify(x.a)===JSON.stringify(action));
  if(!choice){illegal=true;break;}
  const actor=s.turn;
  if(choice.picked){
   foods[actor]++;
   firstFood ??= s.ply+1;
   if(actions.some(x=>x.n.scores[actor]>s.scores[actor]))starSacrifices[actor]++;
  }
  if(choice.a.secondWall!==null){boosts[actor]++;twoWallTurns++;}
  if(choice.n.stars.length<s.stars.length){
   longestQuiet=Math.max(longestQuiet,quiet);
   firstStar??=s.ply+1;
   quiet=0;
  }else quiet++;
  s=choice.n;
 }
 longestQuiet=Math.max(longestQuiet,quiet);
 return {seed,starter,winner:s.winner,capped:s.winner===null,
   plies:s.ply,firstFood,firstStar,foods,boosts,starSacrifices,
   twoWallTurns,stalled20:longestQuiet>=20,illegal};
}
function pairedBoot(pairs){
 const rng=seeded(219981+OFFSET+pairs.length);
 const rates=[];
 for(let i=0;i<1200;i++){
  let wins=0,decided=0;
  for(let j=0;j<pairs.length;j++){
   const sample=pairs[Math.floor(rng()*pairs.length)];
   for(const g of sample)if(g.winner!==null){
    decided++;wins+=Number(g.winner===g.starter);
   }
  }
  if(decided)rates.push(wins/decided);
 }
 rates.sort((a,b)=>a-b);
 return rates.length?[+rates[Math.floor((rates.length-1)*.025)].toFixed(4),
  +rates[Math.floor((rates.length-1)*.975)].toFixed(4)]:[0,1];
}
const rows=[],started=Date.now();
for(const pair of PAIR_LIST)for(const policy of POLICIES){
 const games=[],pairUnits=[];
 for(let i=0;i<PAIRS;i++){
  const seed=OFFSET+i*9973;
  const a=play(pair,policy,0,seed), b=play(pair,policy,1,seed);
  games.push(a,b);pairUnits.push([a,b]);
 }
 const decided=games.filter(g=>g.winner!==null);
 const firstWins=decided.filter(g=>g.winner===g.starter).length;
 const sum=x=>games.reduce((s,g)=>s+g[x],0);
 const bySeat=which=>[0,1].map(p=>games.reduce((s,g)=>s+g[which][p],0));
 const firstFoodByStarter=[0,1].map(starter=>games.filter(g=>g.starter===starter&&g.firstFood!==null).length);
 const row={
  pair,policy,games:games.length,pairs:PAIRS,
  firstWins,secondWins:decided.length-firstWins,unfinished:games.length-decided.length,
  decidedFirstRate:decided.length?+(firstWins/decided.length).toFixed(4):null,
  pairedBootstrap95:pairedBoot(pairUnits),
  stalled20:games.filter(x=>x.stalled20).length,
  meanPlies:+(sum("plies")/games.length).toFixed(2),
  foodBySeat:bySeat("foods"),boostsBySeat:bySeat("boosts"),
  sacrificedAvailableStarBySeat:bySeat("starSacrifices"),
  firstFoodByStarter,
  firstFoodMedian:(()=>{
    const a=games.filter(g=>g.firstFood!==null).map(g=>g.firstFood).sort((x,y)=>x-y);
    return a.length?a[Math.floor((a.length-1)/2)]:null;
  })(),
  firstStarMedian:(()=>{
    const a=games.filter(g=>g.firstStar!==null).map(g=>g.firstStar).sort((x,y)=>x-y);
    return a.length?a[Math.floor((a.length-1)/2)]:null;
  })(),
  illegal:games.filter(x=>x.illegal).length,details:games,
 };
 rows.push(row);
 console.log("TWO_WALL_FAIRNESS_ROW "+JSON.stringify({...row,details:undefined}));
}
const result={
 version:1,source:process.env.GITHUB_SHA||"local",
 settings:{pairs:PAIRS,cap:CAP,seedOffset:OFFSET,placements:PAIR_LIST,policies:POLICIES},
 note:"Draft experiment, not a fairness certificate: same-seed starter swaps and paired-seed bootstrap. Seat-normalized search is diagnostic; 95% intervals from paired units and multiple testing are not proof of equal optimal play. Unfinished are censored, not draws. Star opportunity sacrificed means a legal move could score immediately but actor chose curry instead. No production changes.",
 elapsedSeconds:+((Date.now()-started)/1000).toFixed(1),rows
};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n");
console.log("TWO_WALL_FAIRNESS_COMPLETE "+JSON.stringify({games:rows.reduce((n,r)=>n+r.games,0),
 seconds:result.elapsedSeconds,report:REPORT}));

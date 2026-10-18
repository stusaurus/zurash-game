import fs from "node:fs";
import { initialCurry,successorsCurry,stateKeyCurry } from "../experiments/curry-power.js";
import { chooseCurry,progressKey } from "../experiments/curry-ai.js";
import { seeded } from "../src/ai.js";
import { turnSeed } from "../src/cpu-seed.js";

// Locked head-to-head research. Same maps, paired seeds and turn order.
// Explicitly distinguish completed-game win rate from censored games.
const PAIRS=Number(process.env.PAIRS??40);
const CAP=Number(process.env.MAX_PLIES??160);
const OFFSET=Number(process.env.SEED_OFFSET??20261901);
const REPORT=process.env.REPORT??"reports/curry-progress-study.json";
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>300||
 !Number.isInteger(CAP)||CAP<20||CAP>500||
 !Number.isSafeInteger(OFFSET)||OFFSET<1||OFFSET>2_000_000_000)throw Error("invalid parameters");
const setups=[
  {name:"standard-v-standard",levels:["strong","strong"]},
  {name:"progress-v-progress",levels:["progress","progress"]},
  {name:"progress-v-standard",levels:["progress","strong"]},
  {name:"standard-v-progress",levels:["strong","progress"]},
];
const start=Date.now();

function play(starter,seed,levels){
 let s=initialCurry(2,starter,[13,35]);
 let exactSeen=new Map(),progressSeen=new Map(),highestCpuMs=0,illegal=false;
 let maxQuiet=0,quiet=0, repeatedProgress=0, repeatedExact=0;
 let curryPowerTurns=0,powerOnlyScoringTurns=0,powerOnlyWinningTurns=0;
 let curryPickups=0,extendedMoves=0;
 while(s.winner===null&&s.ply<CAP){
  const full=stateKeyCurry(s),compact=progressKey(s);
  repeatedExact+=(exactSeen.get(full)||0)>0?1:0;
  repeatedProgress+=(progressSeen.get(compact)||0)>0?1:0;
  exactSeen.set(full,(exactSeen.get(full)||0)+1);
  progressSeen.set(compact,(progressSeen.get(compact)||0)+1);
  if(s.powers[s.turn]){
   curryPowerTurns++;
   // The actionable benefit: can extra movement enable a star/win that
   // no legal one-cell move could achieve on the very same turn?
   const regular=successorsCurry(s,0);
   const extended=successorsCurry(s,2);
   const own=s.turn;
   const anyStar=moves=>moves.some(m=>m.n.scores[own]>s.scores[own]);
   const anyWin=moves=>moves.some(m=>m.n.winner===own);
   if(anyStar(extended)&&!anyStar(regular))powerOnlyScoringTurns++;
   if(anyWin(extended)&&!anyWin(regular))powerOnlyWinningTurns++;
  }
  const t=performance.now();
  const action=chooseCurry(s,{
    level:levels[s.turn],seen:exactSeen,extra:2,
    rng:seeded(turnSeed(seed,s.ply)),
  });
  highestCpuMs=Math.max(highestCpuMs,performance.now()-t);
  const moves=successorsCurry(s,2);
  const selected=moves.find(m=>JSON.stringify(m.a)===JSON.stringify(action));
  if(!selected){illegal=true;break;}
  curryPickups+=Number(selected.picked);
  extendedMoves+=Number(selected.boostUsed);
  if(selected.n.stars.length<s.stars.length){maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}
  else quiet++;
  s=selected.n;
 }
 maxQuiet=Math.max(maxQuiet,quiet);
 return {starter,winner:s.winner,capped:s.winner===null,plies:s.ply,
  illegal,maxQuiet,stalled20:maxQuiet>=20,repeatedProgress,repeatedExact,
  curryPowerTurns,powerOnlyScoringTurns,powerOnlyWinningTurns,curryPickups,extendedMoves,
  maxCpuMs:+highestCpuMs.toFixed(1)};
}
function bootstrap(pairGames){
 const rng=seeded(982117+OFFSET+pairGames.length);
 const out=[];
 for(let rep=0;rep<1500;rep++){
  let first=0,decided=0;
  for(let j=0;j<pairGames.length;j++)for(const g of pairGames[Math.floor(rng()*pairGames.length)]){
   if(g.winner!==null){decided++;first+=+(g.winner===g.starter);}
  }
  if(decided)out.push(first/decided);
 }
 out.sort((a,b)=>a-b);
 return out.length?[
  +out[Math.floor((out.length-1)*.025)].toFixed(4),
  +out[Math.floor((out.length-1)*.975)].toFixed(4)
 ]:[0,1];
}
const rows=[];
for(const setup of setups){
 const games=[],seedPairs=[];
 for(let i=0;i<PAIRS;i++){
  const seed=OFFSET+i*1009;
  const paired=[];
  for(const starter of [0,1]){
   const one=play(starter,seed,setup.levels);
   games.push({...one,seed});
   paired.push(one);
  }
  seedPairs.push(paired);
 }
 const decided=games.filter(g=>g.winner!==null);
 const fw=decided.filter(g=>g.winner===g.starter).length;
 const sum=x=>games.reduce((n,g)=>n+g[x],0);
 const row={
  name:setup.name,levels:setup.levels, games:games.length,
  firstWins:fw,secondWins:decided.length-fw,capped:games.length-decided.length,
  firstRate:decided.length?+(fw/decided.length).toFixed(4):null,
  pairedBootstrap95:bootstrap(seedPairs),
  stalled20:games.filter(g=>g.stalled20).length,
  avgPlies:+(sum("plies")/games.length).toFixed(2),
  illegal:games.filter(g=>g.illegal).length,
  repeatProgress:sum("repeatedProgress"),repeatExact:sum("repeatedExact"),
  powerTurns:sum("curryPowerTurns"),
  powerOnlyStarTurns:sum("powerOnlyScoringTurns"),
  powerOnlyWinTurns:sum("powerOnlyWinningTurns"),
  pickups:sum("curryPickups"),extendedMoves:sum("extendedMoves"),
  maxCpuMs:Math.max(...games.map(g=>g.maxCpuMs)),
  gamesDetail:games
 };
 rows.push(row);
 console.log("CURRY_PROGRESS_ROW "+JSON.stringify({...row,gamesDetail:undefined}));
}
const result={version:1,commit:process.env.GITHUB_SHA??"local",
 params:{pairs:PAIRS,maxPlies:CAP,seedOffset:OFFSET,map:"こおりの回廊",curries:[13,35],extraCells:2},
 note:"Strong vs optional progress key penalty. No production or rules change. Censored games not draws. Paired bootstrap on seed groups. Early causal proxy power-only immediate star / win availability does not prove use or human fun.",
 elapsedSeconds:+((Date.now()-start)/1000).toFixed(1),rows};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n");
console.log("CURRY_PROGRESS_COMPLETE "+JSON.stringify({games:rows.reduce((n,r)=>n+r.games,0),seconds:result.elapsedSeconds,report:REPORT}));

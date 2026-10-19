// Experimental balance proxy. CPU turn counts are NOT human play minutes.
// Time ranges below are explicit hypothetical sec/ply assumptions only.
import fs from "node:fs";
import {MODES,initialDuration,successorsDuration,stateKeyDuration}
 from "../experiments/duration-engine.js";
import {seeded} from "../src/ai.js";
const PAIRS=Number(process.env.PAIRS??10);
const MAX_PLIES=Number(process.env.MAX_PLIES??100);
const REPORT=process.env.REPORT??"reports/duration-lab-study.json";
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>80||
 !Number.isInteger(MAX_PLIES)||MAX_PLIES<20||MAX_PLIES>200)throw Error("invalid research setup");
const SEED=Number(process.env.STUDY_SEED??20261019);
function distance(s,player){
 const x=s.players[player]%s.size,y=Math.floor(s.players[player]/s.size);
 return s.stars.length?Math.min(...s.stars.map(t=>
  Math.abs(t%s.size-x)+Math.abs(Math.floor(t/s.size)-y))):0;
}
function choice(s,rng,seen,policy){
 const moves=successorsDuration(s);
 if(!moves.length)return null;
 if(policy==="random")return moves[Math.floor(rng()*moves.length)];
 const me=s.turn,foe=1-me;
 let best=-Infinity,chosen=null;
 for(const x of moves){
  let v=x.n.winner===me?100000:
   (x.n.scores[me]-x.n.scores[foe])*1000 +
   (x.n.powers[me]-x.n.powers[foe])*95 -
   distance(x.n,me)*13+distance(x.n,foe)*6 -
   (seen.get(stateKeyDuration(x.n))||0)*90;
  v+=(rng()-.5)*(policy==="noisy" ? 200 : 2);
  if(v>best){best=v;chosen=x;}
 }
 return chosen;
}
function run(id,curryEnabled,starter,seed,policy){
 let s=initialDuration(id,curryEnabled,starter),longest=0,quiet=0;
 const seen=new Map(),rng=seeded(seed),firstStarTurn=null,firstCurryTurn=null;
 let stars=0,food=0,twoWalls=0,steps=0,illegal=false;
 for(;s.winner===null&&steps<MAX_PLIES;steps++){
  const k=stateKeyDuration(s);seen.set(k,(seen.get(k)||0)+1);
  const x=choice(s,rng,seen,policy);
  if(!x){illegal=true;break;}
  if(x.gotStar){stars++;quiet=0;}else{quiet++;longest=Math.max(longest,quiet);}
  if(x.pickedCurry)food++;
  if(x.a.secondWall!==null)twoWalls++;
  s=x.n;
 }
 return {winner:s.winner,starter,plies:s.ply,capped:s.winner===null,
  stalled20:longest>=20,food,twoWalls,stars,illegal};
}
const results=[],started=Date.now();
for(const id of Object.keys(MODES))for(const curryEnabled of [false,true]){
 for(const policy of ["greedy","noisy"]){
  const games=[];
  for(let i=0;i<PAIRS;i++)for(const starter of [0,1])
   games.push(run(id,curryEnabled,starter,SEED+i*5579,policy));
  const sorted=games.filter(g=>!g.capped).map(g=>g.plies).sort((a,b)=>a-b);
  const count=(fn)=>games.filter(fn).length;
  const sum=x=>games.reduce((n,g)=>n+g[x],0);
  const mean=+(sum("plies")/games.length).toFixed(1);
  const row={mode:id,size:MODES[id].size,target:MODES[id].target,curryEnabled,policy,
   games:games.length,firstWins:count(g=>g.winner===g.starter),secondWins:count(g=>g.winner===1-g.starter),
   unfinished:count(g=>g.capped),illegal:count(g=>g.illegal),stall20:count(g=>g.stalled20),
   pliesMean:mean,pliesMedian:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,
   pliesP90:sorted.length?sorted[Math.floor((sorted.length-1)*.9)]:null,
   pickups:sum("food"),doubleWallMoves:sum("twoWalls"),
   hypotheticalMinutesPerTurn:{
    sec10:+(mean*10/60).toFixed(1),
    sec15:+(mean*15/60).toFixed(1),
    sec20:+(mean*20/60).toFixed(1),
   },
  };
  results.push(row);
  console.log("DURATION_STUDY_ROW "+JSON.stringify(row));
 }
}
const doc={version:1,source:process.env.GITHUB_SHA??"local",
 config:{PAIRS,MAX_PLIES,SEED},rows:results,
 caveat:"Neither CPU plies nor hypothetical 10/15/20 seconds/ply are actual human durations. Playtest with real 2-person matches and a clock to certify five or ten minutes. Capped outcomes are unfinished not draws. This is exploratory, no balance certification, no production merges.",
 elapsedSeconds:+((Date.now()-started)/1000).toFixed(1)};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(doc,null,2)+"\n");
console.log("DURATION_STUDY_COMPLETE "+JSON.stringify({games:results.reduce((n,r)=>n+r.games,0),seconds:doc.elapsedSeconds,report:REPORT}));

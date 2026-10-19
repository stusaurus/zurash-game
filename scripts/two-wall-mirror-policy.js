// Simulated tests of a strict 180-degree-copy response strategy.
// If the mirror choice is impossible, the second player switches to CPU search.
// These are adversarial *samples*, NOT proof of a universal best reply.
import fs from "node:fs";
import {initialCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
import {chooseTwoWall} from "../experiments/curry-two-wall-ai.js";
const flip=n=>48-n;
function isRotationallyRestored(s){
 if(s.winner!==null||s.players[0]!==flip(s.players[1])||
 s.scores[0]!==s.scores[1]||s.powers[0]!==s.powers[1])return false;
 for(const property of ["walls","stars","curries"]){
  const sorted=x=>[...x].sort((a,b)=>a-b);
  if(JSON.stringify(sorted(s[property]))!==JSON.stringify(sorted(s[property].map(flip))))return false;
 }
 return true;
}
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";

const GAMES=Number(process.env.GAMES??24);
const CAP=Number(process.env.MAX_PLIES??60);
const OFFSET=Number(process.env.SEED_OFFSET??783301);
const REPORT=process.env.REPORT??"reports/two-wall-mirror-policy.json";
if(!Number.isInteger(GAMES)||GAMES<1||GAMES>200||
 !Number.isInteger(CAP)||CAP<10||CAP>150||
 !Number.isInteger(OFFSET)||OFFSET<1)throw Error("invalid settings");
const cases=[[21,27],[5,43]];
const policies=["greedy","search","random"];
function one(pair,policy,seed,starter){
 let s=initialCurry(2,starter,pair),seen=new Map(),mirror=0,broken=0;
 let firstCaptureCenter=null,firstBreak=null,scoreAtBreak=null,foodFirst=0,foodSecond=0;
 while(s.winner===null && s.ply<CAP){
  const full=stateKeyCurry(s);
  seen.set(full,(seen.get(full)||0)+1);
  const actor=s.turn;
  const actions=successorsTwoWall(s);
  const rng=seeded(turnSeed(seed,s.ply));
  let choice;
  if(actor===starter){
   const a=chooseTwoWall(s,{rng,seen,level:policy});
   choice=actions.find(x=>JSON.stringify(x.a)===JSON.stringify(a));
  }else{
   const restored=actions.filter(x=>isRotationallyRestored(x.n));
   if(restored.length){
    mirror++;
    choice=restored[Math.floor(rng()*restored.length)];
   }else{
    broken++;
    if(firstBreak===null){
     firstBreak=s.ply;
     scoreAtBreak=s.scores;
    }
    const a=chooseTwoWall(s,{rng,seen,level:"greedy"});
    choice=actions.find(x=>JSON.stringify(x.a)===JSON.stringify(a));
   }
  }
  if(!choice)throw Error("selected illegal action");
  if(choice.picked){if(actor===starter)foodFirst++;else foodSecond++;}
  if(s.stars.includes(24)&&choice.n.players[actor]===24){
    firstCaptureCenter ??={ply:choice.n.ply,who:actor,starter};
  }
  s=choice.n;
 }
 return {pair,policy,starter,seed,mirror,broken,firstBreak,scoreAtBreak,
  firstCaptureCenter,foodFirst,foodSecond,winner:s.winner,plies:s.ply,
  unfinished:s.winner===null};
}
const rows=[],start=Date.now();
for(const pair of cases)for(const policy of policies){
 const games=[];
 for(let i=0;i<GAMES;i++)for(const starter of [0,1]){
  games.push(one(pair,policy,OFFSET+i*9973,starter));
 }
 const sum=k=>games.reduce((n,x)=>n+x[k],0);
 const row={pair,policy,games:games.length,
  firstWins:games.filter(x=>x.winner===x.starter).length,
  secondWins:games.filter(x=>x.winner===1-x.starter).length,
  unfinished:games.filter(x=>x.unfinished).length,
  withMirrorBreak:games.filter(x=>x.broken>0).length,
  pureMirrorGames:games.filter(x=>x.broken===0).length,
  mirrorMoves:sum("mirror"),unmirrorableReplies:sum("broken"),
  firstCapturedCenter:games.filter(x=>x.firstCaptureCenter?.who===x.starter).length,
  secondCapturedCenter:games.filter(x=>x.firstCaptureCenter?.who===1-x.starter).length,
  gamesDetail:games};
 rows.push(row);
 console.log("MIRROR_POLICY_ROW "+JSON.stringify({...row,gamesDetail:undefined}));
}
const doc={
 version:1,source:process.env.GITHUB_SHA??"local",
 params:{GAMES,CAP,OFFSET},rows,
 limitation:"The naive second-player mirror policy is not an optimized adversarial strategy. Outcomes against three fixed first-player CPU policies are not a mathematical winning strategy. A broken mirror only refutes this strict recipe, not all second-player wins.",
 elapsedSeconds:+((Date.now()-start)/1000).toFixed(1)
};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(doc,null,2)+"\n");
console.log("MIRROR_POLICY_COMPLETE "+JSON.stringify({games:rows.reduce((n,r)=>n+r.games,0),
 seconds:doc.elapsedSeconds,report:REPORT}));

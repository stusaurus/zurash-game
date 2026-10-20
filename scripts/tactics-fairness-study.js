// Research only: deterministic, seat-swapped Tactics screening.
// Usage: PAIRS=12 CAP=120 node scripts/tactics-fairness-study.js
import fs from "node:fs";
import {actions,apply,key,successors} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {CANDIDATES,makeCandidate,geometryVariants} from "./tactics-candidates.js";

const pairs=Number(process.env.PAIRS??25),cap=Number(process.env.CAP??80);
const shard=Number(process.env.SHARD??0);
if(!Number.isInteger(shard)||shard<0||shard>999)throw Error("Invalid SHARD");
if(!Number.isInteger(pairs)||pairs<1||pairs>500||!Number.isInteger(cap)||cap<1||cap>500)throw Error("Invalid PAIRS or CAP");
const output=process.env.OUTPUT??"reports/tactics-fairness-screen.json";
const rows=[];
function pick(s,policy,rng){
  const options=actions(s);
  if(!options.length)return null;
  if(policy==="random")return options[Math.floor(rng()*options.length)];
  // A lightweight greedy baseline; not a strong-agent fairness certificate.
  let best=-Infinity,choices=[];
  for(const {a,n} of successors(s)){
    const gain=n.scores[s.turn]-s.scores[s.turn];
    const score=(n.winner===s.turn?1000:0)+gain*100+(a.wall?0:1);
    if(score>best){best=score;choices=[a];}
    else if(score===best)choices.push(a);
  }
  return choices[Math.floor(rng()*choices.length)];
}
function play(base,starter,policy,seed){
  const rng=seeded(seed);
  let s={...base,walls:[...base.walls],stars:[...base.stars],players:[...base.players],scores:[0,0],turn:starter,ply:0,winner:null};
  const seen=new Map();
  let firstStar=null,quiet=0,longestQuiet=0,repeated=false;
  while(s.winner===null&&s.ply<cap){
    const k=key(s);seen.set(k,(seen.get(k)||0)+1);repeated ||= seen.get(k)>=3;
    const a=pick(s,policy,rng);
    if(!a)break;
    const n=apply(s,a);
    if(n.stars.length<s.stars.length){firstStar??=n.ply;longestQuiet=Math.max(longestQuiet,quiet);quiet=0;}else quiet++;
    s=n;
  }
  return {starter,winner:s.winner,plies:s.ply,capped:s.winner===null,firstStar,longestQuiet:Math.max(longestQuiet,quiet),repeated,score:s.scores};
}
for(const config of CANDIDATES){
  for(let pair=0;pair<pairs;pair++){
    let base;
    // Some random placements have no legal opening; retry deterministically.
    for(let attempt=0;attempt<100;attempt++){
      try{base=makeCandidate(config,10000+(shard*pairs+pair)*101+attempt);break;}catch(e){if(e.message!=="No legal opening")throw e;}
    }
    if(!base)throw Error(`Could not generate playable layout: ${config.size}, pair ${pair}`);
    for(const [orientation,geometry] of geometryVariants(base).entries()){
      for(const policy of ["random","greedy"]){
        // Same geometry, seed, and policy, swapping only who moves first.
        for(const starter of [0,1]){
          const seed=400000+(shard*pairs+pair)*31+orientation*7+config.size*1000+(policy==="greedy"?1:0);
          rows.push({size:config.size,target:config.target,wallCount:config.walls,pair,orientation,policy,...play(geometry,starter,policy,seed)});
        }
      }
    }
  }
}
const summary=[];
for(const config of CANDIDATES)for(const policy of ["random","greedy"]){
  const games=rows.filter(r=>r.size===config.size&&r.policy===policy);
  const decided=games.filter(r=>!r.capped);
  const firstWins=decided.filter(r=>r.winner===r.starter).length;
  const secondWins=decided.length-firstWins;
  const sorted=decided.map(r=>r.plies).sort((a,b)=>a-b);
  summary.push({size:config.size,target:config.target,wallCount:config.walls,policy,games:games.length,firstWins,secondWins,capped:games.length-decided.length,firstSeatDecidedRate:decided.length?firstWins/decided.length:null,medianDecidedPlies:sorted.length?sorted[Math.floor((sorted.length-1)/2)]:null,stalled20:games.filter(r=>r.longestQuiet>=20).length,repeated:games.filter(r=>r.repeated).length});
}
const report={version:1,method:"Screening only; random/greedy policies; mirrored even-board orientations and paired starting seats; capped games are not draws; no human time or strong AI results",params:{pairs,cap,shard},summary,games:rows};
fs.writeFileSync(output,JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));
console.log("Wrote "+output);

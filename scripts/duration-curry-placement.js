// Discovery-only study: compare symmetry-preserving curry locations on 9x9.
// Food acquisition is not always optimal; measure "available vs collected".
// Selection is exploratory. Never merge a location without independent holdout.
import fs from "node:fs";
import {initialDuration,successorsDuration,stateKeyDuration,MODES} from "../experiments/duration-engine.js";
import {seeded} from "../src/ai.js";
const PAIRS=Number(process.env.PAIRS??8);
const MAX_PLIES=Number(process.env.MAX_PLIES??70);
const SEED=Number(process.env.STUDY_SEED??20261021);
const REPORT=process.env.REPORT??"reports/duration-curry-placement.json";
if(!Number.isInteger(PAIRS)||PAIRS<1||PAIRS>50)throw Error("invalid number of pairs");
const p=MODES.wide9;
const occupied=new Set([...p.players,...p.walls,...p.stars]);
const choices=[];
for(let i=0;i<40;i++){
 const j=80-i;
 if(!occupied.has(i)&&!occupied.has(j))choices.push([i,j]);
}
function manhattan(s,me){
 const at=s.players[me],x=at%9,y=Math.floor(at/9);
 return Math.min(...s.stars.map(t=>Math.abs(t%9-x)+Math.abs(Math.floor(t/9)-y)));
}
function play(pair,starter,seed,policy){
 const rng=seeded(seed);
 let s=initialDuration("wide9",true,starter);
 s.curries=pair.slice();
 const seen=new Map();
 let pickups=0,boosts=0,offers=0,turns=0,plies=0;
 for(;s.winner===null&&s.ply<MAX_PLIES;){
  const key=stateKeyDuration(s);seen.set(key,(seen.get(key)||0)+1);
  const options=successorsDuration(s);
  if(!options.length)break;
  const actor=s.turn,other=1-actor;
  offers+=Number(options.some(x=>x.pickedCurry));
  let best=-Infinity,item=null;
  for(const x of options){
   const n=x.n;
   const value=(n.winner===actor?1_000_000:0)+
    (n.scores[actor]-n.scores[other])*1100+
    (n.powers[actor]-n.powers[other])*90+
    (manhattan(n,other)-manhattan(n,actor))*14+
    (x.pickedCurry&&policy==="curry-aware"?340:0)-
    (seen.get(stateKeyDuration(n))||0)*150+
    (rng()-.5)*(policy==="noisy"?220:2);
   if(value>best){best=value;item=x;}
  }
  if(item.pickedCurry)pickups++;
  if(item.a.secondWall!==null)boosts++;
  turns++;
  s=item.n;plies++;
 }
 return {starter,winner:s.winner,plies,pickups,boosts,offers,capped:s.winner===null};
}
const report=[],started=Date.now();
for(const pair of choices){
 for(const policy of ["noisy","curry-aware"]){
  const games=[];
  for(let i=0;i<PAIRS;i++)for(const starter of [0,1]){
   games.push(play(pair,starter,SEED+i*1279,policy));
  }
  const sum=k=>games.reduce((n,g)=>n+g[k],0);
  const row={pair,policy,games:games.length,
   firstWins:games.filter(g=>g.winner===g.starter).length,
   secondWins:games.filter(g=>g.winner===1-g.starter).length,
   unfinished:games.filter(g=>g.capped).length,
   meanPlies:+(sum("plies")/games.length).toFixed(1),
   curryOpportunities:sum("offers"),
   pickups:sum("pickups"),wall2Used:sum("boosts")};
  report.push(row);
  console.log("FOOD_PAIR_ROW "+JSON.stringify(row));
 }
}
report.sort((a,b)=>b.pickups-a.pickups);
const result={version:1,source:process.env.GITHUB_SHA??"local",config:{PAIRS,SEED,MAX_PLIES},
 rows:report,caveat:"Discover symmetric curry access, not fairness. Different values for food-aware policy may induce nonoptimal acquisition. Holdout and actual human tests are mandatory before adoption.",
 elapsedSeconds:+((Date.now()-started)/1000).toFixed(1)};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n");
console.log("FOOD_PAIR_DONE "+JSON.stringify({
 top:report.slice(0,10),sampledPairs:choices.length,games:report.reduce((n,r)=>n+r.games,0),
 seconds:result.elapsedSeconds
}));

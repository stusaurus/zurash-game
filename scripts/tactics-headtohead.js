import fs from "node:fs";
import {apply,key,initial} from "../src/engine.js";
import {seeded} from "../src/ai.js";
import {experimental} from "./experimental-policies.js";

const layouts=[
 {name:"はじまりの氷原",type:"baseline"},
 {name:"候補12",walls:[21,27,2,46,10,38,18,30],stars:[24,19,29,5,43]},
 {name:"候補47",walls:[10,38,14,34,4,44,9,39],stars:[24,1,47,16,32]}
];
const pairs=Number(process.env.PAIRS??8),cap=Number(process.env.MAX_PLIES??120);
const offset=Number(process.env.SEED_OFFSET??500000);
const policies=(process.env.POLICIES??"greedy,strong").split(",");
if(!Number.isInteger(pairs)||pairs<1||pairs>100||!Number.isInteger(cap)||cap<1||cap>500||!Number.isInteger(offset)||offset<0||policies.some(x=>!["greedy","strong","search"].includes(x)))throw Error("invalid study parameters");
const results=[];
for(const layout of layouts)for(const policy of policies){
 const games=[];
 for(let pair=0;pair<pairs;pair++)for(let starter=0;starter<2;starter++){
  const seed=offset+pair*307,random=seeded(seed),seen=new Map();
  let s=layout.type==="baseline"?initial(0,starter):{walls:[...layout.walls],stars:[...layout.stars],players:[42,6],scores:[0,0],turn:starter,ply:0,winner:null};
  let quiet=0,maxQuiet=0,firstStar=null,firstMove=null,noLegal=false;
  while(s.winner===null&&s.ply<cap){
   const k=key(s);seen.set(k,(seen.get(k)||0)+1);
   const a=experimental(s,{level:policy,rng:random,seen});
   if(!a){noLegal=true;break;}
   if(firstMove===null)firstMove=JSON.stringify([a.wall?.to??null,a.dir]);
   const n=apply(s,a);
   if(n.stars.length<s.stars.length){firstStar??=n.ply;maxQuiet=Math.max(maxQuiet,quiet);quiet=0;}else quiet++;
   s=n;
  }
  games.push({pair,starter,winner:s.winner,plies:s.ply,firstStar,maxQuiet:Math.max(maxQuiet,quiet),firstMove,noLegal});
 }
 const decided=games.filter(g=>g.winner!==null);
 const ordered=decided.map(g=>g.plies).sort((a,b)=>a-b);
 const row={name:layout.name,policy,pairs,games:games.length,firstWins:decided.filter(g=>g.winner===g.starter).length,secondWins:decided.filter(g=>g.winner!==g.starter).length,capped:games.filter(g=>g.winner===null).length,stalled20:games.filter(g=>g.maxQuiet>=20).length,medianDecidedPlies:ordered.length?ordered[Math.ceil(ordered.length/2)-1]:null,firstMoves:new Set(games.map(g=>g.firstMove)).size,noLegal:games.filter(g=>g.noLegal).length,gamesData:games};
 results.push(row);
 console.log(JSON.stringify(Object.fromEntries(Object.entries(row).filter(([k])=>k!=="gamesData"))));
}
const path=process.env.REPORT??"reports/tactics-candidate-headtohead.json";
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(path,JSON.stringify({note:"Research only; same seeds across layouts, paired starter swaps; capped is not draw. AI plies are not human minutes.",pairs,cap,offset,policies,results},null,2)+"\n");

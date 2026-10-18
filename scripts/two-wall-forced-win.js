// Tactical *proof-search* on real two-wall curry rules.
// A "forced win" certificate must enumerate EVERY legal opponent reply.
// Do not confuse a self-play win streak with a guaranteed winning strategy.
import fs from "node:fs";
import {initialCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";
import {chooseTwoWall} from "../experiments/curry-two-wall-ai.js";
import {seeded} from "../src/ai.js";
import {turnSeed} from "../src/cpu-seed.js";

const parse=(name,fallback,upper)=>{
 const n=Number(process.env[name]??fallback);
 if(!Number.isInteger(n)||n<1||n>upper)throw Error("Bad "+name);
 return n;
};
const GAMES=parse("GAMES",24,200);
const PLY_CAP=parse("PLY_CAP",28,200);
const STATES=parse("STATES",30,300);
const CALL_BUDGET=parse("CALL_BUDGET",16000,150000);
const CLOCK_MS=parse("CLOCK_MS",1200000,3600000);
const SEED=parse("SEED",880031,2000000000);
const PAIRS=(process.env.CURRY_PAIRS??"21,27;5,43").split(";").map(x=>x.split(",").map(Number));
const REPORT=process.env.REPORT??"reports/two-wall-forced-win-audit.json";
const start=Date.now();
let calls=0;
const cache=new Map(),pool=new Map(),stats={};
function options(s){
 if(++calls>CALL_BUDGET||Date.now()-start>CLOCK_MS)throw Error("RESEARCH_BUDGET_REACHED");
 return successorsTwoWall(s);
}
function legalAction(s,a){
 return options(s).find(x=>JSON.stringify(x.a)===JSON.stringify(a));
}
function addPosition(s,trace,label,pair){
 if(s.winner!==null||s.scores[s.turn]!==2)return;
 const id=stateKeyCurry(s);
 if(!pool.has(id))pool.set(id,{state:structuredClone(s),trace,pair,label});
}
function sampleGames(){
 const types=["greedy","search","random"];
 for(const pair of PAIRS)for(let game=0;game<GAMES;game++){
  const s0=initialCurry(2,game%2,pair);
  let s=s0,trace=[],seen=new Map(),type=types[game%types.length];
  const seed=SEED+game*2309;
  for(let ply=0;ply<PLY_CAP&&s.winner===null;ply++){
   addPosition(s,trace,type,pair);
   const k=stateKeyCurry(s);seen.set(k,(seen.get(k)||0)+1);
   const rng=seeded(turnSeed(seed,s.ply));
   const a=chooseTwoWall(s,{rng,seen,level:type});
   const found=legalAction(s,a);
   if(!found)throw Error("Research simulation illegal CPU action");
   trace=[...trace,a];
   s=found.n;
  }
 }
}
function winNow(s,p){
 const k=stateKeyCurry(s)+"|immediate|"+p;
 const old=cache.get(k);if(old)return old;
 const win=options(s).find(x=>x.n.winner===p);
 const result={yes:!!win,action:win?.a??null};
 cache.set(k,result);
 return result;
}
// Proof: player p plays ONE move, then for every single legal response by
// the opponent, p can win immediately on their subsequent move.
// This is an exact mate-in-2-own-turns fact for that position, not for the opening.
function mateInNextOwnTurn(s,allowRoot=Infinity){
 const player=s.turn,other=1-player;
 const legal=options(s);
 const roots=Math.min(legal.length,allowRoot);
 let visited=0;
 for(let i=0;i<roots;i++){
  const a=legal[i];visited++;
  if(a.n.winner===player){
   return {status:"WIN_NOW",root:a.a,opponentReplies:0,covered:0,winningResponses:[],rootsExplored:visited,rootTotal:legal.length};
  }
  const replies=options(a.n);
  if(!replies.length)continue; // no terminal result defined for stalemate
  let good=true,covered=0,example=null,winningResponses=[];
  for(const b of replies){
   if(b.n.winner===other || b.n.winner!==null){good=false;break;}
   const w=winNow(b.n,player);
   if(!w.yes){good=false;break;}
   covered++;
   if(!example)example={opponent:b.a,answer:w.action};
   winningResponses.push({reply:b.a,answer:w.action});
  }
  if(good){
   return {status:"FORCED_WIN_IN_3_PLIES",root:a.a,
    opponentReplies:replies.length,covered,example,
    winningResponses,rootsExplored:visited,rootTotal:legal.length};
  }
 }
 return {status:roots===legal.length?"NO_MATE_WITHIN_3_PLIES":"PARTIAL_SEARCH",
  rootsExplored:visited,rootTotal:legal.length};
}
function verifyCertificate(s,certificate){
 if(certificate.status!=="FORCED_WIN_IN_3_PLIES")return false;
 const action=legalAction(s,certificate.root);
 if(!action || action.n.winner!==null)return false;
 const foe=options(action.n);
 if(foe.length!==certificate.opponentReplies)return false;
 const byKey=new Map(certificate.winningResponses.map(x=>[JSON.stringify(x.reply),x.answer]));
 if(byKey.size!==foe.length)return false;
 for(const reply of foe){
  const ans=byKey.get(JSON.stringify(reply.a));
  const choice=legalAction(reply.n,ans);
  if(!choice||choice.n.winner!==s.turn)return false;
 }
 return true;
}
try{
 sampleGames();
}catch(e){if(String(e.message)!=="RESEARCH_BUDGET_REACHED")throw e;}
const candidates=[...pool.values()].slice(0,STATES);
const examined=[];
for(const {state,trace,pair,label} of candidates){
 if(Date.now()-start>CLOCK_MS||calls>CALL_BUDGET)break;
 try {
  const w=mateInNextOwnTurn(state);
  const verified=w.status==="FORCED_WIN_IN_3_PLIES"?verifyCertificate(state,w):false;
  examined.push({pair,label,player:state.turn,scores:state.scores,
    ply:state.ply,priorActions:trace,state,search:w,
    certified:verified});
  if(verified)break; // First genuinely proven local forced tactic
 }catch(e){if(e.message==="RESEARCH_BUDGET_REACHED")break;throw e;}
}
const proofs=examined.filter(x=>x.certified);
for(const p of proofs){
 console.log("FORCED_TACTIC_REPLAY "+JSON.stringify({
   pair:p.pair,player:p.player,scores:p.scores,ply:p.ply,
   openingTrace:p.priorActions,position:p.state,
   root:p.search.root,allOpponentReplies:p.search.opponentReplies,
   firstReplyExample:p.search.example,proofVerified:p.certified
 }));
}
const result={
 version:1,commit:process.env.GITHUB_SHA??"local",
 config:{GAMES,PLY_CAP,STATES,CALL_BUDGET,CLOCK_MS,SEED,PAIRS},
 sample:{uniqueTwoStarPositions:pool.size,examined:examined.length,successorCalls:calls},
 proofCount:proofs.length,
 proofs:proofs.map(x=>({...x,search:x.search})),
 inspectedSummary:examined.map(x=>({pair:x.pair,ply:x.ply,player:x.player,
  scores:x.scores,result:x.search.status,rootMoves:x.search.rootsExplored,
  rootTotal:x.search.rootTotal,certified:x.certified})),
 limitation:"Local complete mate-in-three-ply certificates (one current move, every possible opponent response, direct winning reply). No claim for a forced win from starting position, no full state-space or infinite-loop solution. A partial or budget-capped result must NOT be called absence of a forced win. Normal CPU self-play is not game-theoretic proof.",
 seconds:+((Date.now()-start)/1000).toFixed(1),
};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n");
console.log("FORCED_TACTIC_COMPLETE "+JSON.stringify({
 sample:result.sample,
 proofs:proofs.map(x=>({pair:x.pair,atPly:x.ply,scores:x.scores,
  root:x.search.root,opponentReplies:x.search.opponentReplies,
  verified:x.certified,example:x.search.example})),
 seconds:result.seconds,report:REPORT
}));

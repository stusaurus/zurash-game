// Exhaustively audit guaranteed opening star captures in up to 3 plies.
// This is NOT a proof of a match-long winning strategy.
import fs from "node:fs";
import {initialCurry,stateKeyCurry} from "../experiments/curry-power.js";
import {successorsTwoWall} from "../experiments/curry-two-wall.js";

const REPORT=process.env.REPORT??"reports/two-wall-opening-threat-audit.json";
const CLOCK_MS=Number(process.env.CLOCK_MS??480000);
const CALL_BUDGET=Number(process.env.CALL_BUDGET??20000);
if(!Number.isInteger(CLOCK_MS)||CLOCK_MS<1000||
 !Number.isInteger(CALL_BUDGET)||CALL_BUDGET<1000)throw Error("bad budget");
const PAIRS=(process.env.CURRY_PAIRS??"21,27;5,43").split(";").map(x=>x.split(",").map(Number));
const start=Date.now();
let calls=0;
const cache=new Map();
function all(s){
 if(++calls>CALL_BUDGET||Date.now()-start>CLOCK_MS)throw Error("BUDGET");
 const k=stateKeyCurry(s);
 const prev=cache.get(k);
 if(prev)return prev;
 const x=successorsTwoWall(s);
 cache.set(k,x);
 return x;
}
function opening(pair,starter){
 const s=initialCurry(2,starter,pair),moves=all(s);
 const me=s.turn,them=1-me;
 const immediate=moves.filter(x=>x.n.scores[me]>0);
 const safeCurry=moves.filter(x=>x.picked);
 let full=true,rootChecked=0,repliesChecked=0;
 let starGuarantee=0,leadGuarantee=0;
 let exemplar=null,refutation=null;
 for(const a of moves){
  if(Date.now()-start>CLOCK_MS||calls>CALL_BUDGET){full=false;break;}
  if(a.n.scores[me]>0){starGuarantee++;if(a.n.scores[me]>a.n.scores[them])leadGuarantee++;continue;}
  let guaranteed=true,lead=true,localExample=null;
  try{
   const replies=all(a.n);
   for(const b of replies){
    repliesChecked++;
    const ownChoices=all(b.n);
    const canStar=ownChoices.find(x=>x.n.scores[me]>b.n.scores[me]);
    const canLead=ownChoices.find(x=>x.n.scores[me]>x.n.scores[them]);
    if(!canStar){guaranteed=false;lead=false;
     refutation ??= {root:a.a,answer:b.a,resultState:b.n};
     break;
    }
    if(!canLead)lead=false;
    localExample ??= {response:b.a,winningStarReply:canStar.a};
   }
  }catch(e){if(e.message==="BUDGET"){full=false;break;}throw e;}
  rootChecked++;
  if(guaranteed){
   starGuarantee++;
   leadGuarantee+=Number(lead);
   exemplar ??= {root:a.a,opponentReplies:all(a.n).length,
     example:localExample,guaranteedLead:lead};
  }
 }
 return {pair,starter,openingMoves:moves.length,openingImmediateStarMoves:immediate.length,
  openingImmediateCurryMoves:safeCurry.length,guaranteedStarInAtMost3Plies:starGuarantee,
  guaranteedLeadInAtMost3Plies:leadGuarantee,checkedRootMoves:rootChecked,
  repliesChecked,complete:full,exemplar,oneRefutation:refutation};
}
const rows=[];
for(const pair of PAIRS)for(const starter of [0,1]){
 try{rows.push(opening(pair,starter));}
 catch(e){if(e.message==="BUDGET")break;throw e;}
 console.log("OPENING_TACTIC_ROW "+JSON.stringify({
   ...rows.at(-1),oneRefutation:rows.at(-1).oneRefutation?
   {root:rows.at(-1).oneRefutation.root,answer:rows.at(-1).oneRefutation.answer}:null
 }));
 if(Date.now()-start>CLOCK_MS||calls>CALL_BUDGET)break;
}
const result={version:1,source:process.env.GITHUB_SHA??"local",
 settings:{PAIRS,CLOCK_MS,CALL_BUDGET},successorCalls:calls,
 elapsedSeconds:+((Date.now()-start)/1000).toFixed(1),
 rows,
 limitation:"Guarantees refer ONLY to collecting a star or taking a score lead within up to 3 half-turns, by responding to every one-ply opponent move. They do not prove a 3-star match win, or that opponent cannot avoid winning thereafter. Partial runs are incomplete; repeating states without a draw rule makes full solving especially difficult."};
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync(REPORT,JSON.stringify(result,null,2)+"\n");
console.log("OPENING_TACTIC_COMPLETE "+JSON.stringify({
 cases:rows.map(x=>({pair:x.pair,starter:x.starter,
  direct:x.openingImmediateStarMoves,forcedStar:x.guaranteedStarInAtMost3Plies,
  forcedLead:x.guaranteedLeadInAtMost3Plies,
  complete:x.complete,checked:x.checkedRootMoves,total:x.openingMoves})),
 calls,seconds:result.elapsedSeconds
}));

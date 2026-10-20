// Compare all legal opening moves with depth-limited adversarial replies.
// Every root action is evaluated; incomplete searches are explicitly labeled.
import fs from "node:fs";
import {examine} from "./tactics-search.js";
import {CANDIDATES,makeCandidate,geometryVariants} from "./tactics-candidates.js";
import {key,successors} from "../src/engine.js";

const depth=Number(process.env.DEPTH??2);
const budget=Number(process.env.NODE_BUDGET??12000);
const samples=Number(process.env.SAMPLES??3);
if(!Number.isInteger(depth)||depth<1||depth>5||!Number.isInteger(budget)||budget<1||budget>500000||!Number.isInteger(samples)||samples<1||samples>50)throw Error("Invalid study bounds");
const rows=[];
for(const c of CANDIDATES){
  for(let seed=0;seed<samples;seed++){
    const base=makeCandidate(c,900000+seed*37+c.size);
    for(const [orientation,board] of geometryVariants(base).entries()){
      for(const starter of [0,1]){
        const state={...board,turn:starter};
        const result=examine(state,depth,budget);
        const top=result.moves[0]?.score??null;
        rows.push({size:c.size,seed,orientation,starter,depth,budget,legalMoves:result.legalMoves,distinctNextStates:new Set(successors(state).map(x=>key(x.n))).size,complete:result.complete,nodes:result.nodes,bestScore:top,bestMoveCount:result.complete?result.moves.filter(x=>x.score===top).length:null,topMoves:result.moves.slice(0,3)});
      }
    }
  }
}
const summary=CANDIDATES.map(c=>{
  const group=rows.filter(x=>x.size===c.size);
  const complete=group.filter(x=>x.complete);
  return {size:c.size,openings:group.length,fullyEvaluated:complete.length,meanLegalMoves:group.reduce((a,x)=>a+x.legalMoves,0)/group.length,meanDistinctNextStates:group.reduce((a,x)=>a+x.distinctNextStates,0)/group.length,meanBestMoveCount:complete.length?complete.reduce((a,x)=>a+x.bestMoveCount,0)/complete.length:null,firstSeatMeanBestScore:mean(complete.filter(x=>x.starter===0).map(x=>x.bestScore)),secondSeatMeanBestScore:mean(complete.filter(x=>x.starter===1).map(x=>x.bestScore))};
});
function mean(xs){return xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;}
fs.mkdirSync("reports",{recursive:true});
const report={method:"All legal opening moves, bounded adversarial minimax; heuristic scores are not win probabilities or proven game-theoretic outcomes",depth,budget,samples,summary,rows};
fs.writeFileSync("reports/tactics-search-study.json",JSON.stringify(report,null,2)+"\n");
console.log(JSON.stringify(summary,null,2));

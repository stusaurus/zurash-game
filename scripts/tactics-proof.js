// Exact finite-horizon solver. No heuristic scores: only proven outcomes.
// A nonterminal position at the move cap is a draw by the analysis convention,
// NOT an official ZURASH rule. Exhausted budgets produce UNKNOWN, never a claim.
import {successors} from "../src/engine.js";
// Normalize player labels: the root player is always represented as player 0.
// Wall indices are not normalized because legal actions reference those indices.
function canonical(s,remaining,root){
  const p=root===0?s.players:[s.players[1],s.players[0]];
  const sc=root===0?s.scores:[s.scores[1],s.scores[0]];
  return JSON.stringify([s.size,s.target,[...s.walls].sort((a,b)=>a-b),[...s.stars].sort((a,b)=>a-b),p,sc,s.turn===root?0:1,remaining]);
}
export const WIN=1,DRAW=0,LOSS=-1,UNKNOWN=null;
export function prove(state,{horizon=120,nodeBudget=100000}={}){
  if(!Number.isInteger(horizon)||horizon<0||horizon>120||!Number.isInteger(nodeBudget)||nodeBudget<1)throw Error("Invalid proof limits");
  const root=state.turn,table=new Map();
  let nodes=0,cacheHits=0,cutoffs=0;
  function solve(s,remaining){
    if(s.winner!==null)return s.winner===root?WIN:LOSS;
    if(remaining===0)return DRAW;
    const id=canonical(s,remaining,root);
    if(table.has(id)){cacheHits++;return table.get(id);}
    if(nodes>=nodeBudget)return UNKNOWN;
    nodes++;
    const children=successors(s);
    if(children.length===0)return DRAW; // no legal continuation, analytical draw
    const maximize=s.turn===root;
    let sawUnknown=false,sawDraw=false;
    for(const {n} of children){
      const result=solve(n,remaining-1);
      if(result===UNKNOWN){sawUnknown=true;continue;}
      if(maximize&&result===WIN){table.set(id,WIN);cutoffs++;return WIN;}
      if(!maximize&&result===LOSS){table.set(id,LOSS);cutoffs++;return LOSS;}
      if(result===DRAW)sawDraw=true;
    }
    if(sawUnknown)return UNKNOWN;
    const result=sawDraw?DRAW:(maximize?LOSS:WIN);
    table.set(id,result);
    return result;
  }
  const result=solve(state,horizon);
  return {result,proven:result!==UNKNOWN,nodes,cacheHits,cutoffs,horizon,nodeBudget,statesCached:table.size,capConvention:"nonterminal at horizon is analytical draw, not official game result"};
}

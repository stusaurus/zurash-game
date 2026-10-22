import {geometryKey} from "../src/geometry.js";
// Exact finite-horizon minimax. A cap result is NOT an official game draw.
import {successors} from '../src/engine.js';
export const WIN=1,DRAW=0,LOSS=-1,UNKNOWN=null;
export function canonical(s,remaining,root){
  const p=root===0?s.players:[s.players[1],s.players[0]];
  const sc=root===0?s.scores:[s.scores[1],s.scores[0]];
  // Walls are indistinguishable for outcome values; cached actions are never reused.
  return JSON.stringify([geometryKey(s),s.target??3,[...s.walls].sort((a,b)=>a-b),[...s.stars].sort((a,b)=>a-b),p,sc,s.turn===root?0:1,remaining]);
}
export function prove(state,{horizon=120,nodeBudget=100000,timeBudgetMs=30000,maxTableEntries=250000,memoryBudgetMb=512,alphaBeta=true,horizonPruning=true}={}){
  for(const [v,min,max] of [[horizon,0,120],[nodeBudget,1,10000000],[timeBudgetMs,1,3600000],[maxTableEntries,1,1000000],[memoryBudgetMb,32,4096]])
    if(!Number.isInteger(v)||v<min||v>max)throw Error('Invalid proof limits');
  const root=state.turn,table=new Map(),started=performance.now(),stop=Symbol('budget');
  let nodes=0,cacheHits=0,cutoffs=0,horizonCutoffs=0,stopReason=null,peakHeapBytes=process.memoryUsage().heapUsed;
  function save(id,value,flag){if(table.size<maxTableEntries||table.has(id))table.set(id,{value,flag});}
  function solve(s,remaining,alpha,beta){
    if(s.winner!==null)return s.winner===root?WIN:LOSS;
    if(remaining===0)return DRAW;
    if(performance.now()-started>=timeBudgetMs){stopReason='time';throw stop;}
    if(horizonPruning){
      // At most one star per turn; count each player's turns in this horizon.
      const turns=[Math.floor(remaining/2),Math.floor(remaining/2)];
      turns[s.turn]+=remaining%2;
      if(turns.every((count,p)=>s.scores[p]+Math.min(count,s.stars.length)<(s.target??3))){horizonCutoffs++;return DRAW;}
    }
    const id=canonical(s,remaining,root),hit=table.get(id);
    const originalAlpha=alpha,originalBeta=beta;
    if(hit){
      cacheHits++;
      if(hit.flag==='exact')return hit.value;
      if(alphaBeta){if(hit.flag==='lower')alpha=Math.max(alpha,hit.value);else beta=Math.min(beta,hit.value);if(alpha>=beta)return hit.value;}
    }
    if(nodes>=nodeBudget){stopReason='nodes';throw stop;}
    nodes++;
    if(nodes%256===1){peakHeapBytes=Math.max(peakHeapBytes,process.memoryUsage().heapUsed);if(peakHeapBytes>memoryBudgetMb*1024**2){stopReason='memory';throw stop;}}
    const children=successors(s);
    if(!children.length){save(id,DRAW,'exact');return DRAW;}
    const maximize=s.turn===root;
    if(children.some(({n})=>n.winner===s.turn)){const v=maximize?WIN:LOSS;save(id,v,'exact');cutoffs++;return v;}
    // Ordering changes no legal move. Star gains are tried first.
    children.sort((a,b)=>b.n.scores[s.turn]-a.n.scores[s.turn]);
    let value=maximize?LOSS:WIN;
    for(const {n} of children){
      const v=solve(n,remaining-1,alpha,beta);
      value=maximize?Math.max(value,v):Math.min(value,v);
      if((maximize&&value===WIN)||(!maximize&&value===LOSS)){
        // A child reached through a narrowed window may itself be only a bound.
        const flag=!alphaBeta?'exact':value<=originalAlpha?'upper':value>=originalBeta?'lower':'exact';
        cutoffs++;save(id,value,flag);return value;
      }
      if(alphaBeta){
        if(maximize)alpha=Math.max(alpha,value);else beta=Math.min(beta,value);
        if(alpha>=beta){cutoffs++;break;}
      }
    }
    const flag=!alphaBeta?'exact':value<=originalAlpha?'upper':value>=originalBeta?'lower':'exact';
    save(id,value,flag);return value;
  }
  let result;
  try{result=solve(state,horizon,-2,2);}catch(e){if(e!==stop)throw e;result=UNKNOWN;}
  peakHeapBytes=Math.max(peakHeapBytes,process.memoryUsage().heapUsed);
  return {result,proven:result!==UNKNOWN,status:result===UNKNOWN?'budget-unresolved':result===DRAW?'finite-horizon-only':result===WIN?'forced-win-within-horizon':'forced-loss-within-horizon',nodes,cacheHits,cutoffs,horizonCutoffs,horizon,nodeBudget,timeBudgetMs,maxTableEntries,memoryBudgetMb,stopReason,statesCached:table.size,elapsedMs:performance.now()-started,peakHeapBytes,alphaBeta,horizonPruning,capConvention:'nonterminal at horizon is analytical draw, not official game result'};
}

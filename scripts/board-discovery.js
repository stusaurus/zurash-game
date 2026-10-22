// Research only: actor indices, physical starting slots and AI identities are separate.
import {createHash} from 'node:crypto';
import {actions,apply,successors,mobility,movableWalls,distances,step,key} from '../src/engine.js';
import {evaluate,seeded} from '../src/ai.js';
import {validateBoard,recordBoard,definitionKey,mutateBoard} from '../src/board-lab.js';
import {newGame,advanceGame,verifyGame,policyMove} from './tactics-completion.js';
export const VERSION='discovery-1';
export const TRAIN_SEEDS=[610001,610007];
export const HOLDOUT_SEEDS=[9700003,9700033,9700067,9700103];
export const MUTATIONS=['positions','stars','walls','star-count','wall-count','target','shape','multiple'];
const digest=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const discoveryID=board=>'d-'+digest(definitionKey(board)).slice(0,24);
const sorted=a=>[...a].sort((a,b)=>a-b);
const sameSet=(a,b)=>JSON.stringify(sorted(a))===JSON.stringify(sorted(b));
export function topology(s){
 const cells=new Set(s.playableCells),adj=new Map([...cells].map(i=>[i,[0,1,2,3].map(d=>step(i,d,s)).filter(n=>n!==null)]));
 const seen=new Map(),low=new Map(),cuts=new Set();let time=0;
 function dfs(v,parent){seen.set(v,++time);low.set(v,time);let children=0;for(const w of adj.get(v)){if(!seen.has(w)){children++;dfs(w,v);low.set(v,Math.min(low.get(v),low.get(w)));if(parent!==null&&low.get(w)>=seen.get(v))cuts.add(v);}else if(w!==parent)low.set(v,Math.min(low.get(v),seen.get(w)));}if(parent===null&&children>1)cuts.add(v);}
 for(const i of cells)if(!seen.has(i))dfs(i,null);
 return {cells:cells.size,fillRatio:cells.size/(s.width*s.height),aspect:s.width/s.height,articulationCells:sorted(cuts),narrowCells:[...adj].filter(([,n])=>n.length<=2).map(([i])=>i),terrainRotation:sameSet(s.playableCells,s.playableCells.map(i=>s.width*s.height-1-i)),layoutRotation:['walls','stars'].every(f=>sameSet(s[f],s[f].map(i=>s.width*s.height-1-i))),walkingGraphOnly:true};
}
export function positionProxy(board){
 const ds=[0,1].map(p=>distances(board,p)),cap=board.playableCells.length+1;
 const reach=ds.map(d=>board.stars.filter(i=>Number.isFinite(d[i])).length),sum=ds.map(d=>board.stars.reduce((a,i)=>a+Math.min(cap,d[i]),0));
 const mobilityCount=[0,1].map(p=>new Set(mobility(board,p)).size);
 return {reachableStars:reach,starDistances:ds.map(d=>board.stars.map(i=>Number.isFinite(d[i])?d[i]:null)),distanceSums:sum,mobility:mobilityCount,proxyBias:Math.abs(sum[0]-sum[1])/Math.max(1,board.stars.length*cap)+Math.abs(reach[0]-reach[1])/Math.max(1,board.stars.length)+Math.abs(mobilityCount[0]-mobilityCount[1])*.04,unreachableReferenceOnly:true};
}
export function basicFeatures(record){
 const v=validateBoard(record.board);if(!v.ok)throw Error(record.id+': '+v.errors.join('/'));
 const s=v.state,root=[0,1].map(turn=>successors({...s,turn})),open=root.map((cs,p)=>{
  const ranked=cs.map(c=>evaluate(c.n,p)),best=Math.max(...ranked);
  return {actions:cs.length,wallActions:cs.filter(c=>c.a.wall).length,noWallActions:cs.filter(c=>!c.a.wall).length,scoringActions:cs.filter(c=>c.n.scores[p]>0).length,scoringWithoutWall:cs.filter(c=>!c.a.wall&&c.n.scores[p]>0).length,nearBestHeuristic:ranked.filter(n=>n>=best-25).length,stopCells:new Set(cs.map(c=>c.n.players[p])).size,immediateWins:cs.filter(c=>c.n.winner===p).length};
 });
 return {id:record.id,shape:record.shape,width:s.width,height:s.height,stars:s.stars.length,walls:s.walls.length,target:s.target,topology:topology(s),positions:positionProxy(s),openings:open,movableWalls:[0,1].map(turn=>movableWalls({...s,turn}).length),limits:['Distances hold walls and opponent fixed','Near-best means within 25 of a one-ply heuristic, not game-theoretic best','Articulation points describe walking terrain, not proven sliding control']};
}
export function positionSearch(record,{seed=1,attempts=10,distinctPhysical=true}={}){
 const s=record.board,rng=seeded(seed),free=s.playableCells.filter(i=>!s.walls.includes(i)&&!s.stars.includes(i)),accepted=[],rejected=[],pairKey=ps=>JSON.stringify(distinctPhysical?sorted(ps):ps),seen=new Set([pairKey(s.players)]);
 const propose=[];for(const i of free){const opposite=s.width*s.height-1-i;if(free.includes(opposite)&&i!==opposite)propose.push([i,opposite]);}
 for(let k=0;k<attempts;k++){
  const players=k<Math.min(3,propose.length)?propose[Math.floor(rng()*propose.length)]:[free[Math.floor(rng()*free.length)],free[Math.floor(rng()*free.length)]];
  const pk=pairKey(players);if(seen.has(pk))continue;seen.add(pk);const b={...s,players},v=validateBoard(b);
  if(!v.ok){rejected.push({players,reasons:v.errors});continue;}
  const proxy=positionProxy(v.state);accepted.push({players,proxy});
 }
 accepted.sort((a,b)=>a.proxy.proxyBias-b.proxy.proxyBias||Math.min(...b.proxy.reachableStars)-Math.min(...a.proxy.reachableStars));
 const best=accepted[0];let child=null;
 if(best)child=recordBoard({...s,players:best.players},{id:discoveryID({...s,players:best.players}),name:'初期位置探索・'+record.name,parent:record.id,shape:record.shape,seed,algorithm:VERSION+'-positions',mutation:'positions'});
 return {parent:record.id,seed,attempts,distinctPhysical,accepted,rejected,originalProxy:positionProxy(s),best:child,selection:'static proxy only; AI improvement not established'};
}
export function mutateDiscovery(record,{kind,seed=1,distinctPhysical=true}={}){
 if(!MUTATIONS.includes(kind))throw Error('Unknown mutation');const rng=seeded(seed),s=structuredClone(record.board);
 if(['stars','walls','shape','multiple'].includes(kind)){
  const r=mutateBoard(record,{kind,seed});return {...r,id:discoveryID(r.board),mutation:kind,algorithm:VERSION+'-'+kind};
 }
 const occupied=new Set([...s.players,...s.walls,...s.stars]),free=s.playableCells.filter(i=>!occupied.has(i));
 if(kind==='positions'){const r=positionSearch(record,{seed,attempts:8,distinctPhysical});if(!r.best)throw Error('No legal position mutation');return r.best;}
 if(kind==='star-count'||kind==='wall-count'){
  const field=kind==='star-count'?'stars':'walls';
  if(rng()<.5&&s[field].length>(field==='stars'?2*s.target-1:0))s[field].splice(Math.floor(rng()*s[field].length),1);
  else {if(!free.length)throw Error('No free mutation cell');s[field].push(free[Math.floor(rng()*free.length)]);}
 }
 if(kind==='target'){const options=[s.target-1,s.target+1].filter(t=>t>=1&&t<=32&&s.stars.length>=2*t-1);if(!options.length)throw Error('No legal target mutation');s.target=options[Math.floor(rng()*options.length)];}
 return recordBoard(s,{id:discoveryID(s),parent:record.id,name:'変異・'+kind+'・'+seed,shape:record.shape,seed,algorithm:VERSION+'-'+kind,mutation:kind});
}
export function factorialPlans(record,{stage='train',seeds=TRAIN_SEEDS,pairs=[['star','positional']],regime='standard'}={}){
 const plans=[];
 for(const seed of seeds)for(const pair of pairs)for(const positionSwap of [false,true])for(const aiSwap of [false,true])for(const starter of [0,1]){
  const policies=aiSwap?[...pair].reverse():[...pair],board={...record.board,players:positionSwap?[...record.board.players].reverse():[...record.board.players]};
  const config={version:VERSION,boardDefinition:definitionKey(record.board),stage,seed,pair,positionSwap,aiSwap,starter,regime};
  plans.push({id:'g-'+digest(config),boardId:record.id,stage,seed,pair:[...pair],positionSwap,aiSwap,starter,policies,board,regime,cluster:String(seed),condition:`${seed}/${pair.join('/')}/${+positionSwap}/${+aiSwap}/${starter}`});
 }
 return plans;
}
export function createExperiment(plan){
 const g=newGame(plan.board,{id:plan.id,starter:plan.starter,policies:plan.policies,seed:plan.seed});
 g.experiment={version:VERSION,boardId:plan.boardId,stage:plan.stage,pair:plan.pair,positionSwap:plan.positionSwap,aiSwap:plan.aiSwap,regime:plan.regime,physicalSlots:plan.positionSwap?[...plan.board.players].reverse():[...plan.board.players],cluster:plan.cluster,condition:plan.condition};return g;
}
function controlMove(s,policy,rng,seen,options,noWall){
 const allowed=options.filter(c=>!noWall||!c.a.wall);if(!allowed.length)return null;const p=s.turn,depth=policy==='search'?2:1;
 const ranked=allowed.map(c=>({...c,v:evaluate(c.n,p)-(seen.get(key(c.n))??0)*130,tie:rng()})).sort((a,b)=>b.v-a.v||a.tie-b.tie);
 if(depth===1||ranked[0].n.winner===p)return ranked[0].a;
 return ranked.slice(0,4).map(c=>{const replies=successors(c.n).filter(r=>!noWall||!r.a.wall);return {...c,v2:replies.length?Math.min(...replies.map(r=>evaluate(r.n,p))):c.v};}).sort((a,b)=>b.v2-a.v2||a.tie-b.tie)[0].a;
}
export function advanceExperiment(g,options={}){
 const regime=g.experiment.regime,select=regime==='standard'?policyMove:(s,p,rng,seen,children)=>controlMove(s,p,rng,seen,children,regime==='control-no-wall');
 const n=advanceGame(g,{...options,select});if(regime==='control-no-wall'&&n.reason==='invalid-policy-action'&&!successors(n.state).some(c=>!c.a.wall))n.reason='no-legal-action-intervention';return n;
}
export function outcomes(g){const winner=g.state.winner;return {first:winner===null?null:Number(winner===g.starter),slot0:winner===null?null:Number((g.experiment.positionSwap?1-winner:winner)===0),actorWinner:winner,policyWinner:winner===null?null:g.policies[winner],physicalStarter:g.experiment.positionSwap?1-g.starter:g.starter};}
export function uniqueGames(records){const seen=new Map();for(const g of records){const old=seen.get(g.id);if(old){if(JSON.stringify(old.initial)!==JSON.stringify(g.initial)||JSON.stringify(old.experiment)!==JSON.stringify(g.experiment)||old.seed!==g.seed||JSON.stringify(old.policies)!==JSON.stringify(g.policies))throw Error('Experiment ID collision');const short=old.history.length<=g.history.length?old:g,long=short===old?g:old;for(let i=0;i<short.history.length;i++)if(JSON.stringify(short.history[i].a)!==JSON.stringify(long.history[i].a))throw Error('Divergent continuation');if(g.history.length<old.history.length)continue;}seen.set(g.id,g);}return [...seen.values()];}
export function wilson(w,n){if(!n)return null;const z=1.959964,d=1+z*z/n,c=(w/n+z*z/(2*n))/d,h=z*Math.sqrt(w/n*(1-w/n)/n+z*z/(4*n*n))/d;return [c-h,c+h];}
const mean=a=>a.length?a.reduce((x,y)=>x+y,0)/a.length:null;
function bootstrapBlocks(blocks,measure,{samples=1000,seed=113}={}){
 if(blocks.length<4)return null;const rng=seeded(seed),values=[];
 for(let k=0;k<samples;k++){const resampled=[];for(let i=0;i<blocks.length;i++)resampled.push(...blocks[Math.floor(rng()*blocks.length)]);const n=measure(resampled);if(Number.isFinite(n))values.push(n);}
 values.sort((a,b)=>a-b);return values.length?[values[Math.floor(values.length*.025)],values[Math.floor(values.length*.975)]]:null;
}
export function aggregate(records){
 const gs=uniqueGames(records),n=gs.length,os=gs.map(outcomes),first=os.filter(o=>o.first===1).length,second=os.filter(o=>o.first===0).length,u=n-first-second,slots=[os.filter(o=>o.slot0===1).length,os.filter(o=>o.slot0===0).length],decided=first+second;
 const clusters=new Map();for(const g of gs){const k=g.experiment.cluster;if(!clusters.has(k))clusters.set(k,[]);clusters.get(k).push(g);}
 const firstMeasure=rows=>{const ds=rows.map(outcomes).filter(o=>o.first!==null);return mean(ds.map(o=>o.first));},slotMeasure=rows=>{const ds=rows.map(outcomes).filter(o=>o.slot0!==null);return mean(ds.map(o=>o.slot0));};
 const byPolicy={},interaction={};for(const g of gs){const o=outcomes(g),physicalPolicies=g.experiment.positionSwap?[...g.policies].reverse():g.policies,k=`startSlot${o.physicalStarter}/${physicalPolicies.join('/')}`;interaction[k]??={games:0,slotWins:[0,0],unresolved:0};interaction[k].games++;if(o.slot0===null)interaction[k].unresolved++;else interaction[k].slotWins[o.slot0?0:1]++;for(const policy of new Set(g.policies)){byPolicy[policy]??={appearances:0,wins:0,losses:0,unresolved:0,selfPlay:0};const p=byPolicy[policy];p.appearances++;if(g.policies[0]===g.policies[1])p.selfPlay++;if(o.policyWinner===null)p.unresolved++;else if(o.policyWinner===policy)p.wins++;else p.losses++;}}
 const plies=gs.filter(g=>g.state.winner!==null).map(g=>g.state.ply).sort((a,b)=>a-b),wall=gs.reduce((a,g)=>a+g.metrics.wallMoves,0),allPlies=gs.reduce((a,g)=>a+g.history.length,0);
 return {games:n,first,second,unresolved:u,positionWins:slots,firstRate:decided?first/decided:null,position0Rate:decided?slots[0]/decided:null,firstBias:decided?Math.abs(first-second)/decided:1,positionBias:decided?Math.abs(slots[0]-slots[1])/decided:1,unresolvedRate:n?u/n:1,firstFinalPossible:n?[first/n,(first+u)/n]:null,positionFinalPossible:n?[slots[0]/n,(slots[0]+u)/n]:null,wilsonFirst95Descriptive:wilson(first,decided),wilsonPosition95Descriptive:wilson(slots[0],decided),clusterCount:clusters.size,bootstrapFirst95:bootstrapBlocks([...clusters.values()],firstMeasure),bootstrapPosition95:bootstrapBlocks([...clusters.values()],slotMeasure),interaction,byPolicy,repeatedGames:gs.filter(g=>g.repetitionCount).length,leadChangeGames:gs.filter(g=>g.metrics.leadChanges).length,nearVictoryReversals:gs.filter(g=>g.metrics.nearVictoryReversal).length,wallMoves:wall,plies:allPlies,wallRate:allPlies?wall/allPlies:0,medianDecidedPlies:plies.length?plies[Math.floor(plies.length/2)]:null,maxPlies:Math.max(0,...gs.map(g=>g.state.ply)),openingDiversity:new Set(gs.filter(g=>g.history.length).map(g=>JSON.stringify([outcomes(g).physicalStarter,g.initial.players[g.starter],g.history[0].a]))).size,declinedCaptures:gs.reduce((a,g)=>a+g.metrics.declinedCapture,0),limitations:['Policy-conditional observational statistics','Bootstrap clusters complete seeds, preserving AI and seat conditions; few clusters and unresolved selection can give misleadingly narrow intervals','Initial-slot and turn counts are separate','Human enjoyment and optimal-play fairness unproven']};
}
export function compareMatched(parent,child){
 const a=uniqueGames(parent),b=uniqueGames(child),map=new Map(b.map(g=>[g.experiment.condition,g])),paired=a.flatMap(g=>map.has(g.experiment.condition)?[[g,map.get(g.experiment.condition)]]:[]),groups=new Map();for(const pair of paired){const k=pair[0].experiment.cluster;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(pair);}
 const effect=rows=>{const pa=aggregateNoBootstrap(rows.map(r=>r[0])),ch=aggregateNoBootstrap(rows.map(r=>r[1]));return pa.positionBias===null||ch.positionBias===null?null:pa.positionBias-ch.positionBias;};
 const ci=bootstrapBlocks([...groups.values()],effect),old=aggregate(a),fresh=aggregate(b),improved=!!ci&&ci[0]>0&&old.first+old.second>=16&&fresh.first+fresh.second>=16&&paired.length>=32&&groups.size>=4&&fresh.unresolvedRate<=old.unresolvedRate&&fresh.firstBias<=old.firstBias+.1;
 return {matchedGames:paired.length,matchedClusters:groups.size,positionBiasReduction:effect(paired),bootstrapReduction95:ci,firstBiasChange:fresh.firstBias-old.firstBias,unresolvedChange:fresh.unresolvedRate-old.unresolvedRate,improvementSupported:improved,reasons:[...(!ci?['independent seed groups or resolved outcomes insufficient']:[]),...(ci&&ci[0]<=0?['interval does not establish positive improvement']:[]),...(old.first+old.second<16||fresh.first+fresh.second<16?['fewer than 16 resolved games on at least one side']:[]),...(fresh.firstBias>old.firstBias+.1?['turn bias worsened']:[]),...(fresh.unresolvedRate>old.unresolvedRate?['unresolved rate worsened']:[])],interpretation:improved?'policy-conditional evidence, not official certification':'insufficient evidence or tradeoff'};
}
function aggregateNoBootstrap(gs){const os=gs.map(outcomes).filter(o=>o.slot0!==null);return {positionBias:os.length?Math.abs(os.reduce((a,o)=>a+(o.slot0?1:-1),0))/os.length:null};}
export function paretoFront(rows){
 const vector=r=>[r.metrics.firstBias,r.metrics.positionBias,r.metrics.unresolvedRate,-r.metrics.openingDiversity,-r.metrics.nearVictoryReversals,-(r.metrics.decisionAudit?.wallOnlyCapturePositions??0),-(r.metrics.decisionAudit?.lookaheadDisagreements??0),r.metrics.operationProxy?.boundingCells??0];
 return rows.filter(r=>!rows.some(q=>q!==r&&vector(q).every((x,i)=>x<=vector(r)[i])&&vector(q).some((x,i)=>x<vector(r)[i]))).map(r=>r.id);
}
export function classify(record,metrics,controls={}){
 const tags=[];if(metrics.games<8)return ['評価標本不足'];
 if(metrics.firstBias<=.25&&metrics.positionBias<=.25&&metrics.unresolvedRate<=.25)tags.push('バランス検証候補');
 if(metrics.nearVictoryReversals>=2)tags.push('逆転を観測');if(metrics.medianDecidedPlies!==null&&metrics.medianDecidedPlies<=20)tags.push('短期決着を観測');if(metrics.medianDecidedPlies>=60)tags.push('長期展開を観測');
 if(metrics.declinedCaptures>=2)tags.push('得点見送りを観測');if(metrics.wallRate>=.5)tags.push('壁操作が多い');
 if(controls.wallIntervention?.matchedGames>=8)tags.push('壁制限比較あり');if(controls.depth?.matchedGames>=8)tags.push('深さ比較あり');
 return tags.length?tags:['探索継続'];
}
export function verifyExperiment(g){verifyGame(g);if(!g.experiment||!['standard','control-full','control-no-wall'].includes(g.experiment.regime))throw Error('Invalid experiment regime');if(g.experiment.regime==='control-no-wall'&&g.history.some(h=>h.a.wall))throw Error('Wall action in no-wall intervention');const slots=g.experiment.positionSwap?[...g.experiment.physicalSlots].reverse():g.experiment.physicalSlots;if(JSON.stringify(slots)!==JSON.stringify(g.initial.players))throw Error('Position assignment mismatch');if(g.initial.turn!==g.starter)throw Error('Starter mismatch');const expected=g.experiment.aiSwap?[...g.experiment.pair].reverse():g.experiment.pair;if(JSON.stringify(expected)!==JSON.stringify(g.policies))throw Error('AI assignment mismatch');return true;}

export function decisionAudit(record,game,{samples=4}={}){
 if(!game)return {sampledPositions:0,notes:['No game available']};
 const terrain=topology(record.board),cuts=new Set(terrain.articulationCells),notes=[],report={sampledPositions:0,contestedStarPositions:0,wallOnlyCapturePositions:0,scoreOrBlockPositions:0,lookaheadDisagreements:0,bottleneckTraversals:0,decisions:[]};
 const indices=new Set(Array.from({length:samples},(_,i)=>Math.floor(i*Math.max(0,game.history.length-1)/Math.max(1,samples-1))));let s=game.initial;
 for(let i=0;i<game.history.length;i++){
  const h=game.history[i],n=apply(s,h.a);
  if(indices.has(i)&&s.winner===null){
   report.sampledPositions++;const cs=successors(s),other=successors({...s,turn:1-s.turn}),ownStars=new Set(cs.filter(c=>c.n.scores[s.turn]>s.scores[s.turn]).map(c=>c.n.players[s.turn])),otherStars=new Set(other.filter(c=>c.n.scores[1-s.turn]>s.scores[1-s.turn]).map(c=>c.n.players[1-s.turn]));
   const contested=[...ownStars].filter(x=>otherStars.has(x));if(contested.length)report.contestedStarPositions++;
   const scoring=cs.filter(c=>c.n.scores[s.turn]>s.scores[s.turn]);if(scoring.length&&scoring.every(c=>c.a.wall))report.wallOnlyCapturePositions++;
   const after=successors(n),afterThreats=after.filter(c=>c.n.scores[1-s.turn]>n.scores[1-s.turn]).length;
   if(h.canScore&&!h.gain&&otherStars.size&&!afterThreats)report.scoreOrBlockPositions++;
   const shallow=controlMove(s,'positional',seeded(155),new Map(),cs,false),deep=controlMove(s,'search',seeded(155),new Map(),cs,false);if(JSON.stringify(shallow)!==JSON.stringify(deep))report.lookaheadDisagreements++;
   const immediateReply=after.find(c=>c.n.winner===1-s.turn),safeAlternative=immediateReply?cs.find(c=>c.n.winner===s.turn||!successors(c.n).some(r=>r.n.winner===1-s.turn)):null;
   if(immediateReply&&safeAlternative)report.decisions.push({ply:s.ply,player:s.turn,played:h.a,immediateWinningReply:immediateReply.a,alternative:safeAlternative.a,explanation:'この手は相手の次の1手での勝利を許す。別の合法手なら即勝ちを回避できる（それ以後の勝敗は未証明）。'});
  }
  let at=s.players[s.turn];while(at!==n.players[s.turn]){at=step(at,h.a.dir,s);if(at===null)break;if(cuts.has(at))report.bottleneckTraversals++;}
  s=n;
 }
 report.notes=['Sparse sampled positions, not exhaustive strategic proof','Depth comparison uses the same evaluation with beam four','Bottleneck passage does not prove corridor control','Immediate reply alternatives establish only a one-turn tactical explanation'];return report;
}
export function controlComparison(full,restricted){
 const a=aggregate(full),b=aggregate(restricted),p=policy=>gs=>{const rows=gs.filter(g=>g.policies.includes(policy)&&g.state.winner!==null);return rows.length?rows.filter(g=>g.policies[g.state.winner]===policy).length/rows.length:null;};
 return {matchedGames:Math.min(full.length,restricted.length),fullGames:a.games,restrictedGames:b.games,fullUnresolved:a.unresolved,restrictedUnresolved:b.unresolved,medianPlies:[a.medianDecidedPlies,b.medianDecidedPlies],depthTwoWinRates:[p('search')(full),p('search')(restricted)],wallRates:[a.wallRate,b.wallRate],limits:['Rules intervention, not standard fairness data','Small controls with one seed; no causal generalization or optimal-play claim']};
}

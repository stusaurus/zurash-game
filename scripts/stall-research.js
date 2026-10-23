// Research tools only. No changes to the game rules or production CPU.
import {createHash} from 'node:crypto';
import {successors,key,apply} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
import {validateBoard,recordBoard,definitionKey} from '../src/board-lab.js';
import {discoveryID,factorialPlans,createExperiment,aggregate} from './board-discovery.js';
import {advanceGame,policyMove,verifyGame} from './tactics-completion.js';
export const sha=x=>createHash('sha256').update(typeof x==='string'||Buffer.isBuffer(x)?x:JSON.stringify(x)).digest('hex');
// Independent, deliberately straightforward masked reference implementation.
export function referenceChildren(s){
 if(s.winner!==null)return [];
 const w=s.width??s.size??7,h=s.height??s.size??7,valid=new Set(s.playableCells??Array.from({length:w*h},(_,i)=>i));
 const dirs=[[0,-1],[1,0],[0,1],[-1,0]];
 const neighbor=(i,d)=>{const x=i%w+dirs[d][0],y=Math.floor(i/w)+dirs[d][1],n=y*w+x;return x<0||y<0||x>=w||y>=h||!valid.has(n)?null:n;};
 const end=(ps,ws,p,d)=>{let i=ps[p];for(;;){const n=neighbor(i,d);if(n===null||ws.includes(n)||n===ps[1-p])return i;i=n;}};
 const mobile=(ps,ws,p)=>dirs.some((_,d)=>end(ps,ws,p,d)!==ps[p]);
 const shifts=[{wall:null,walls:[...s.walls]}];
 for(let i=0;i<s.walls.length;i++)for(let d=0;d<4;d++){
  const to=neighbor(s.walls[i],d);if(to===null||[...s.walls,...s.stars,...s.players].includes(to))continue;
  const ws=s.walls.map((v,j)=>i===j?to:v);if(mobile(s.players,ws,0)&&mobile(s.players,ws,1))shifts.push({wall:{wall:i,to},walls:ws});
 }
 const out=[];
 for(const {wall,walls} of shifts)for(let d=0;d<4;d++){
  const p=s.turn,to=end(s.players,walls,p,d);if(to===s.players[p])continue;
  const players=s.players.map((v,i)=>i===p?to:v);if(!mobile(players,walls,0)||!mobile(players,walls,1))continue;
  const gain=s.stars.includes(to),scores=s.scores.map((v,i)=>v+Number(gain&&i===p)),winner=scores[p]>=(s.target??3)?p:null;
  out.push({a:{wall,dir:d},n:{...s,walls:[...walls],players,scores,stars:s.stars.filter(v=>!gain||v!==to),winner,ply:s.ply+1,turn:winner===null?1-p:p}});
 }
 return out;
}
export function reachableGraph(initial,{maxStates=20000,maxMs=2000,independent=false,keepGraph=false}={}){
 const start=performance.now(),queue=[{s:initial,parent:null,a:null}],seen=new Map([[key(initial),0]]),edges=[],winning=[],captured=new Set();let expanded=0,edgeCount=0,stop=null;
 for(let i=0;i<queue.length;i++){
  if(performance.now()-start>maxMs){stop='time';break;}
  const s=queue[i].s,cs=successors(s);if(independent&&JSON.stringify(cs)!==JSON.stringify(referenceChildren(s)))throw Error('Reference rules disagree');
  const es=[];for(const {a,n} of cs){edgeCount++;if(n.scores[s.turn]>s.scores[s.turn])captured.add(n.players[s.turn]);
   let j=seen.get(key(n));if(j===undefined){if(queue.length>=maxStates){stop='states';break;}j=queue.length;seen.set(key(n),j);queue.push({s:n,parent:i,a});if(n.winner!==null)winning.push(j);}
   es.push({to:j,a});
  }edges.push(es);if(stop)break;expanded++;
 }
 const path=j=>{const p=[];while(queue[j].parent!==null){p.push(queue[j].a);j=queue[j].parent;}return p.reverse();};
 const complete=stop===null,states=queue.map(x=>x.s),scorePairs=[...new Set(states.map(s=>s.scores.join('/')))].sort();
 return {complete,stop,states:queue.length,expanded,edges:edgeCount,winningStates:winning.length,reachableWinners:[...new Set(winning.map(i=>queue[i].s.winner))],status:complete&&!winning.length?'no-reachable-victory':winning.length?'victory-witness-found':'unknown',scorePairs,capturedStars:[...captured].sort((a,b)=>a-b),uncapturedInitialStars:initial.stars.filter(x=>!captured.has(x)),maxScores:[0,1].map(p=>Math.max(...states.map(s=>s.scores[p]))),noLegalStates:states.filter(s=>s.winner===null&&!successors(s).length).length,witness:winning.length?{actions:path(winning[0]),state:queue[winning[0]].s}:null,...(keepGraph?{graph:queue.map((x,i)=>({state:x.s,parent:x.parent,action:x.a,edges:edges[i]??null}))}:{}),elapsedMs:performance.now()-start,limits:['Complete cooperative reachability, when exhausted, is stronger than failure of a policy','No reachable victory is not an official draw rule','A reachable victory does not prove either player can force it']};
}
export function minimalVariants(parent){
 const b=parent.board,occupied=new Set([...b.players,...b.stars,...b.walls]),empty=b.playableCells.filter(i=>!occupied.has(i)),free=b.playableCells.filter(i=>!b.stars.includes(i)&&!b.walls.includes(i)),rows=[],rejected=[],seen=new Set([definitionKey(b)]);
 const add=(board,change)=>{const v=validateBoard(board);if(!v.ok){rejected.push({change,errors:v.errors});return;}const k=definitionKey(v.state);if(seen.has(k))return;seen.add(k);rows.push(recordBoard(v.state,{id:discoveryID(v.state),parent:parent.id,name:'停滞改善・'+change.kind,shape:parent.shape,algorithm:'stall-minimal-1',change,seed:20261023}));};
 for(let i=0;i<free.length;i++)for(let j=i+1;j<free.length;j++)if(JSON.stringify([free[i],free[j]].sort((a,b)=>a-b))!==JSON.stringify([...b.players].sort((a,b)=>a-b)))add({...b,players:[free[i],free[j]]},{kind:'positions',from:b.players,to:[free[i],free[j]]});
 for(const field of ['stars','walls'])for(let i=0;i<b[field].length;i++)for(const to of empty)add({...b,[field]:b[field].map((x,j)=>j===i?to:x)},{kind:field,from:b[field][i],to});
 for(let i=0;i<b.walls.length;i++)add({...b,walls:b.walls.filter((_,j)=>j!==i)},{kind:'wall-count',removed:b.walls[i]});
 if(b.target>1)add({...b,target:b.target-1},{kind:'target',from:b.target,to:b.target-1});
 for(let i=0;i<b.width*b.height;i++)if(!b.playableCells.includes(i))add({...b,playableCells:[...b.playableCells,i].sort((a,b)=>a-b)},{kind:'shape',added:i});
 return {parent:parent.id,accepted:rows,rejected};
}
// Least fixed-point winning regions for a finite, completely enumerated graph.
// Unclassified states allow non-termination; no official draw is introduced.
export function solveGraph(result){
 if(!result.complete||!result.graph)return {status:'unknown',reason:'complete graph required'};
 const gs=result.graph,regions=[0,1].map(p=>new Set(gs.flatMap((v,i)=>v.state.winner===p?[i]:[])));
 for(let p=0;p<2;p++){let changed=true;while(changed){changed=false;for(let i=0;i<gs.length;i++){
  if(regions[p].has(i)||gs[i].state.winner!==null)continue;const es=gs[i].edges;
  if(es.length&&(gs[i].state.turn===p?es.some(e=>regions[p].has(e.to)):es.every(e=>regions[p].has(e.to)))){regions[p].add(i);changed=true;}
 }}}
 return {status:regions[0].has(0)?'P0-forces-win':regions[1].has(0)?'P1-forces-win':'neither-forces-victory',winningRegionSizes:regions.map(s=>s.size),nonWinningRegion:gs.length-regions[0].size-regions[1].size,limits:['Reachability-game proof relative to fully checked legal transitions','Unclassified cycles are not official draws']};
}
const mapping={deeper:'search',repeat:'search',score:'star',random:'star'};
export function researchPlans(record,{stage,seeds,pairs}){
 return pairs.flatMap(labels=>factorialPlans(record,{stage,seeds,pairs:[labels.map(x=>mapping[x]??x)]}).map(p=>{
  const policyByActor=p.aiSwap?[...labels].reverse():labels;
  return {...p,id:'s-'+sha({base:p.id,labels,version:'stall-policy-1'}),research:{version:'stall-policy-1',labels,policyByActor}};
 }));
}
export function newResearchGame(plan){const g=createExperiment(plan);g.research=plan.research;return g;}
export function researchMove(s,label,rng,seen,options){
 if(!mapping[label])return policyMove(s,label,rng,seen,options);
 if(!options.length)return null;if(label==='random')return options[Math.floor(rng()*options.length)].a;
 const p=s.turn,win=options.filter(c=>c.n.winner===p);if(win.length)return win[Math.floor(rng()*win.length)].a;
 // Refuse an immediate loss if a legal alternative avoids it. Still not a deeper safety proof.
 const safe= s.scores[1-p]===(s.target??3)-1?options.filter(c=>!successors(c.n).some(r=>r.n.winner===1-p)):options;
 const pool=safe.length?safe:options;
 if(label==='repeat'||label==='score')return pool.map(c=>({...c,v:evaluate(c.n,p)+(label==='score'?500*(c.n.scores[p]-s.scores[p]):0)-Math.min(10,seen.get(key(c.n))??0)*(label==='repeat'?260:80),tie:rng()})).sort((a,b)=>b.v-a.v||a.tie-b.tie)[0].a;
 let nodes=0;const limit=1200;
 function search(n,depth){if(!depth||n.winner!==null||++nodes>limit)return evaluate(n,p);let cs=successors(n);if(!cs.length)return evaluate(n,p);const sign=n.turn===p?1:-1;cs=cs.map(c=>({...c,v:evaluate(c.n,p)})).sort((a,b)=>sign*(b.v-a.v)).slice(0,6);const vs=cs.map(c=>search(c.n,depth-1));return sign===1?Math.max(...vs):Math.min(...vs);}
 const ranked=pool.map(c=>({...c,v:evaluate(c.n,p),tie:rng()})).sort((a,b)=>b.v-a.v||a.tie-b.tie);
 return ranked.slice(0,8).map(c=>({...c,v:search(c.n,2)-Math.min(10,seen.get(key(c.n))??0)*80})).sort((a,b)=>b.v-a.v||a.tie-b.tie)[0].a;
}
export function advanceResearch(g,options){return advanceGame(g,{...options,select:(s,_policy,rng,seen,children)=>researchMove(s,g.research.policyByActor[s.turn],rng,seen,children)});}
export const aggregateResearch=gs=>aggregate(gs.map(g=>({...g,policies:g.research?.policyByActor??g.policies})));
export function mergeContinuation(base,incoming){
 const map=new Map(base.map(g=>[g.id,g]));if(map.size!==base.length)throw Error('Duplicate baseline IDs');let continued=0,settled=0,addedPlies=0;
 const delta=[];
 for(const g of incoming){const old=map.get(g.id);if(!old)throw Error('Unknown continuation ID');for(const f of ['initial','experiment','policies','seed','starter'])if(JSON.stringify(g[f])!==JSON.stringify(old[f]))throw Error('Continuation metadata mismatch');
  if(g.history.length<old.history.length)throw Error('Regressive continuation');if(JSON.stringify(g.history.slice(0,old.history.length))!==JSON.stringify(old.history))throw Error('Divergent continuation');
  if(g.history.length===old.history.length){if(JSON.stringify(g.state)!==JSON.stringify(old.state)||JSON.stringify(g.rngStates)!==JSON.stringify(old.rngStates))throw Error('Same-length state or RNG mismatch');continue;}
  if(old.state.winner!==null)throw Error('Continued terminal game');verifyGame(g);map.set(g.id,g);delta.push(g);continued++;addedPlies+=g.history.length-old.history.length;settled+=Number(g.state.winner!==null);
 }
 return {games:[...map.values()],delta,continued,newlySettled:settled,addedPlies,newGames:0};
}
export function settlementComparison(parent,child){
 const by=new Map(child.map(g=>[g.experiment.condition,g])),pairs=parent.flatMap(g=>by.has(g.experiment.condition)?[[g,by.get(g.experiment.condition)]]:[]),blocks=new Map();
 for(const [a,b] of pairs){const k=a.seed;if(!blocks.has(k))blocks.set(k,[]);blocks.get(k).push(Number(b.state.winner!==null)-Number(a.state.winner!==null));}
 const effects=[...blocks.values()].map(xs=>xs.reduce((a,b)=>a+b,0)/xs.length),effect=effects.length?effects.reduce((a,b)=>a+b,0)/effects.length:null;
 let p=null;if(effects.length>=4&&effects.length<=16){let extreme=0;for(let mask=0;mask<2**effects.length;mask++){const v=effects.reduce((a,x,i)=>a+x*((mask>>i&1)?1:-1),0)/effects.length;if(v>=effect-1e-12)extreme++;}p=extreme/2**effects.length;}
 return {matchedGames:pairs.length,seedClusters:effects.length,settlementGain:effect,oneSidedSeedSignFlipP:p,parent:aggregate(parent),child:aggregate(child),limits:['Exploratory cluster sign-flip reference test, exchangeability is an assumption','Unresolved games retained in denominator','Not a fairness or human-enjoyment certification']};
}
export function holm(ps){const order=ps.map((p,i)=>({p,i})).sort((a,b)=>a.p-b.p),out=Array(ps.length);let prev=0;for(let j=0;j<order.length;j++){prev=Math.max(prev,Math.min(1,order[j].p*(ps.length-j)));out[order[j].i]=prev;}return out;}

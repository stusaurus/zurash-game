// Frozen, research-only D-walk validation. Never imported by production.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {initial,key} from '../src/engine.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {bFactorMove} from './b-factorial-ai.js';
import {tieMove} from './d-walk-ties.js';
import {newGame,advanceGame,policyMove} from './tactics-completion.js';
import {sha,referenceChildren} from './stall-research.js';
import {checkpointFingerprint} from './trajectory-followup.js';
import {oldUnresolved,measure,load as oldLoad} from './b-performance-study.js';
import {randomStream} from './tactics-completion.js';
import {audit} from './trajectory-audit.js';
import {tactical} from './b-performance-analysis.js';
export const directory='reports/d-walk-independent-2026-10-24';
export const protocol=()=>JSON.parse(readFileSync('reports/d-walk-independent-2026-10-24-plan.json','utf8'));
export const load=n=>JSON.parse(gunzipSync(readFileSync(`${directory}/${n}.json.gz`)));
export function save(n,data){mkdirSync(directory,{recursive:true});const p=`${directory}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(data)));renameSync(p+'.tmp',p);}
const has=n=>existsSync(`${directory}/${n}.json.gz`),aid=a=>JSON.stringify(a),quantile=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*p)]:null;};
export function blockEstimate(rows,value,seeds){
 const blocks=seeds.map(seed=>{const rs=rows.filter(r=>r.game.seed===seed);assert.ok(rs.length);return rs.reduce((n,r)=>n+value(r),0)/rs.length;}),mean=xs=>xs.reduce((n,x)=>n+x,0)/xs.length,rng=randomStream(protocol().statistics.seed),boots=[];
 for(let i=0;i<protocol().statistics.bootstrapSamples;i++)boots.push(mean(blocks.map(()=>blocks[Math.floor(rng()*blocks.length)])));
 let extreme=0;for(let mask=0;mask<2**blocks.length;mask++)extreme+=Number(Math.abs(mean(blocks.map((x,i)=>x*((mask>>i&1)?1:-1))))>=Math.abs(mean(blocks))-1e-12);
 return {mean:mean(blocks),bootstrap95:[quantile(boots,.025),quantile(boots,.975)],signFlipP:extreme/2**blocks.length,blocks,seed:protocol().statistics.seed};
}
export function oldSources(){const rs=Array.from({length:12},(_,i)=>oldLoad(`fresh-${i}`)).flat().filter(r=>r.game.state.winner===null);assert.equal(rs.length,24);for(const a of ['A','D'])assert.equal(rs.filter(r=>r.game.research.labels.every(l=>l===a)).length,protocol().extension.counts[a]);return rs;}
export function setup(){
 const source=oldSources(),lock={planSHA256:sha(protocol()),sources:source.map(r=>({id:r.game.id,checkpointSHA256:checkpointFingerprint(r.game),statsSHA256:sha(r.stats)}))};
 if(has('lock'))assert.deepEqual(load('lock'),lock);else save('lock',lock);return lock;
}
export function makeInitial(kind,seed,pair,swap,starter){
 const s=initial(RESEARCH_LAYOUTS.find(r=>r.id==='B'),starter);if(swap)s.players.reverse();const id='dw-'+sha([protocol(),kind,seed,pair,swap,starter]);
 const g=newGame(s,{seed,starter,id,policies:['search','search']});g.research={labels:[...pair],policyByActor:[...pair],version:'d-walk-independent-1'};g.experiment={boardId:'B',stage:kind,pair:[...pair],positionSwap:swap,aiSwap:false,regime:'standard',physicalSlots:swap?[...s.players].reverse():[...s.players],cluster:String(seed),condition:[seed,swap,starter].join('/')};return g;
}
export function plans(kind){const p=protocol(),seeds=kind==='self'?p.selfSeeds:p.panelSeeds,pairs=kind==='self'?p.selfPairs:p.panelTargets.flatMap(a=>p.panelOpponents.map(b=>[a,b]));return seeds.flatMap(seed=>pairs.flatMap(pair=>[false,true].flatMap(swap=>[0,1].map(starter=>makeInitial(kind,seed,pair,swap,starter)))));}
export function play(cp,{ms,plies,stats=[],replayStats=null,override=null}={}){
 const labels=override??cp.research.policyByActor,p=protocol();
 return advanceGame(cp,{timeBudgetMs:ms,maxPlies:Math.min(100000,cp.state.ply+plies),memoryBudgetMb:768,select:(s,_carrier,rng,seen,options)=>{
  const label=labels[s.turn],saved=replayStats?.find(r=>r.ply===s.ply);if(replayStats)assert.ok(saved,'Missing saved workpoint');
  let r;if(label==='A'||p.tieVariants.includes(label)){
   const opts={...p.moveBudget,trace:true,...(replayStats?{maxMs:3600000,maxRoots:saved.complete===false?saved.rootEvaluated:Infinity}:{})};
   r=label==='A'?bFactorMove(s,'A',rng,seen,opts):tieMove(s,label,rng,seen,opts);
   const values=r.scores.map(r=>r.value),best=values.length?Math.max(...values):null,ties=values.filter(v=>Math.abs(v-best)<1e-9).length;
   const {retainedActions,rankedActions,scores,certificate,...small}=r;r={...small,topTies:ties,evaluated:r.scores.length,allTied:r.complete&&r.scores.length>1&&ties===r.scores.length};
  }else{
   const started=performance.now(),before=rng.state(),a=policyMove(s,label,rng,seen,options),mem=process.memoryUsage();r={action:a,rngBefore:before,rngAfter:rng.state(),elapsedMs:performance.now()-started,sampledHeapPeak:mem.heapUsed,processPeakRssKB:process.resourceUsage().maxRSS,complete:null,rootEvaluated:null,searchPositions:null,topTies:null,evaluated:null,allTied:null};
  }
  stats.push({...r,action:undefined,ply:s.ply,actor:s.turn,label});return r.action;
 }});
}
export function extend(part){setup();const name=`extension-${part}`,out=has(name)?load(name):[],p=protocol();
 for(const [i,r] of oldSources().entries()){if(i%6!==part)continue;const previous=out.filter(e=>e.id===r.game.id);let cp=previous.at(-1)?.game??r.game;
  for(let stage=previous.length;stage<p.extension.stagesMs.length&&cp.state.winner===null;stage++){
   const stats=[],game=play(cp,{ms:p.extension.stagesMs[stage],plies:p.extension.extraPlies,stats});out.push({id:r.game.id,stage,sourceSHA256:checkpointFingerprint(cp),game,stats});save(name,out);cp=game;console.log('extension',part,i,stage,game.state.ply,game.reason);
  }
 }return out;
}
export function fresh(kind,index){setup();const p=protocol(),seed=(kind==='self'?p.selfSeeds:p.panelSeeds)[index];assert.ok(seed);const name=`${kind}-${index}`,out=has(name)?load(name):[],done=new Set(out.map(r=>r.game.id)),gs=plans(kind).filter(g=>g.seed===seed);
 // Rotate complete actor pair groups; each seed still covers the full cross.
 const pairs=[...new Set(gs.map(g=>aid(g.research.labels)))];gs.sort((a,b)=>(pairs.indexOf(aid(a.research.labels))+index)%pairs.length-(pairs.indexOf(aid(b.research.labels))+index)%pairs.length);
 for(const start of gs){if(done.has(start.id))continue;let game=start;const stats=[],stages=[];
  for(let stage=0;stage<p.freshStagesMs.length&&game.state.winner===null;stage++){const before=game;game=play(game,{ms:p.freshStagesMs[stage],plies:p.freshExtraPlies,stats});stages.push({stage,sourceSHA256:checkpointFingerprint(before),endingPly:game.state.ply,reason:game.reason,elapsedMs:game.elapsedMs-before.elapsedMs,winner:game.state.winner});}
  out.push({game,stats,stages});save(name,out);done.add(game.id);console.log(kind,index,out.length,'/',gs.length,game.state.ply,game.reason);
 }return out;
}
export const physicalKey=s=>key(s.players[0]<s.players[1]?s:{...s,players:[...s.players].reverse(),scores:[...s.scores].reverse(),turn:1-s.turn});
export function tieCases(kind){
 if(kind==='development')return oldUnresolved().map(r=>({caseID:r.game.id,checkpoint:r.game,seed:r.game.seed}));
 const name='tie-cases';if(has(name))return load(name);
 const occupied=new Set(tieCases('development').map(r=>physicalKey(r.checkpoint.state))),out=[];
 for(let index=0;index<protocol().selfSeeds.length;index++){
  const r=load(`self-${index}`).find(r=>aid(r.game.research.labels)===aid(['D','D'])&&!r.game.experiment.positionSwap&&r.game.starter===0);assert.ok(r);let s=r.game.initial,quiet=0;const states=[];
  for(const h of r.game.history){states.push({state:s,quiet});s=referenceChildren(s).find(c=>aid(c.a)===aid(h.a)).n;quiet=h.gain?0:quiet+1;}
  const ordered=[...states.filter(r=>r.state.ply>=16&&r.quiet>=8),...states.filter(r=>r.state.ply>=12),...states.slice().reverse()];const chosen=ordered.find(r=>!occupied.has(physicalKey(r.state)));if(!chosen)continue;
  const start=makeInitial('self',r.game.seed,r.game.research.labels,r.game.experiment.positionSwap,r.game.starter),cp=play(start,{ms:3600000,plies:chosen.state.ply,replayStats:r.stats});assert.deepEqual(cp.state,chosen.state);assert.deepEqual(cp.history,r.game.history.slice(0,chosen.state.ply));occupied.add(physicalKey(cp.state));out.push({caseID:sha([r.game.id,checkpointFingerprint(cp)]),sourceID:r.game.id,seed:r.game.seed,checkpoint:cp});
 }save(name,out);return out;
}
export function forks(kind,part){const config=protocol()[kind==='development'?'tieDevelopment':'tieHoldout'],name=`ties-${kind}-${part}`,out=has(name)?load(name):[],done=new Set(out.map(r=>r.id));
 for(const [i,c] of tieCases(kind).entries()){if(i%4!==part)continue;for(let j=0;j<4;j++){const variant=protocol().tieVariants[(i+j)%4],id=sha([protocol(),kind,c.caseID,variant]);if(done.has(id))continue;const stats=[],game=play(c.checkpoint,{ms:config.ms,plies:config.plies,stats,override:[variant,variant]});out.push({...c,id,kind,variant,sourceSHA256:checkpointFingerprint(c.checkpoint),game,stats});save(name,out);done.add(id);console.log('ties',kind,part,out.length,variant,game.state.ply,game.reason);}}
 return out;
}
export function workTasks(kind,index){
 if(kind==='self'||kind==='panel')return load(`${kind}-${index}`).map(r=>({id:r.game.id,record:r,start:makeInitial(kind,r.game.seed,r.game.research.labels,r.game.experiment.positionSwap,r.game.starter)}));
 if(kind==='extension'){const prior=new Map(oldSources().map(r=>[r.game.id,r.game]));return load(`extension-${index}`).map(r=>{const start=prior.get(r.id);prior.set(r.id,r.game);return {id:r.id+'/'+r.stage,record:r,start};});}
 return load(`ties-${kind}-${index}`).map(r=>({id:r.id,record:r,start:r.checkpoint,override:[r.variant,r.variant]}));
}
export function replay(kind,index){const name=`replay-${kind}-${index}`,out=has(name)?load(name):[],done=new Set(out.map(r=>r.id));for(const t of workTasks(kind,index)){if(done.has(t.id)){assert.equal(out.find(r=>r.id===t.id).contentSHA256,sha(t.record));continue;}const r=t.record,actual=play(t.start,{ms:3600000,plies:r.game.state.ply-t.start.state.ply,replayStats:r.stats,override:t.override});for(const k of ['state','history','rngStates','visits','metrics','repetitionCount','lastLead'])assert.deepEqual(actual[k],r.game[k],k);out.push({id:t.id,contentSHA256:sha(r),startSHA256:checkpointFingerprint(t.start),matched:true});save(name,out);done.add(t.id);}console.log('AI replay',kind,index,out.length);return out;}
export function lengthBounds(games,horizon=256){
 const lower=games.map(g=>g.state.winner===null?g.history.length+1:g.history.length),upper=games.map(g=>g.state.winner===null?Infinity:g.history.length),pair=p=>[quantile(lower,p),quantile(upper,p)===Infinity?null:quantile(upper,p)];
 return {median:pair(.5),p90:pair(.9),restrictedMean256:[lower.reduce((n,x)=>n+Math.min(x,horizon),0)/games.length,upper.reduce((n,x)=>n+Math.min(x,horizon),0)/games.length],nullMeansUnbounded:true};
}
export function summarize(rows){const gs=rows.map(r=>r.game),ms=rows.map(r=>measure(r.game,r.stats)),decided=gs.filter(g=>g.state.winner!==null),stats=rows.flatMap(r=>r.stats),scored=stats.filter(r=>r.evaluated>1&&r.complete===true);
 return {n:gs.length,settled:decided.length,unresolved:gs.length-decided.length,winsByAI:Object.fromEntries([...new Set(gs.flatMap(g=>g.research.labels))].map(a=>[a,decided.filter(g=>g.research.policyByActor[g.state.winner]===a).length])),firstWins:decided.filter(g=>g.state.winner===g.starter).length,secondWins:decided.filter(g=>g.state.winner!==g.starter).length,slotWins:[0,1].map(slot=>decided.filter(g=>g.experiment.physicalSlots.indexOf(g.initial.players[g.state.winner])===slot).length),
  observedPlies:{median:quantile(ms.map(m=>m.plies),.5),p90:quantile(ms.map(m=>m.plies),.9),max:Math.max(...ms.map(m=>m.plies))},completedPlies:{median:quantile(decided.map(g=>g.history.length),.5),p90:quantile(decided.map(g=>g.history.length),.9),max:decided.length?Math.max(...decided.map(g=>g.history.length)):null},bounds:lengthBounds(gs),quiet:{median:quantile(ms.map(m=>m.longestQuiet),.5),p90:quantile(ms.map(m=>m.longestQuiet),.9),max:Math.max(...ms.map(m=>m.longestQuiet))},repeatingGames:ms.filter(m=>m.repeatedStates>0).length,repeatEvents:ms.reduce((n,m)=>n+m.repeatedStates,0),close:ms.filter(m=>m.close).length,comebacks:ms.filter(m=>m.comebackWin).length,diversity:audit(gs),
  moves:stats.length,allTiedMoves:scored.filter(r=>r.allTied).length,tieDenominator:scored.length,meanTopTies:scored.length?scored.reduce((n,r)=>n+r.topTies,0)/scored.length:null,moveMedianMs:quantile(stats.map(r=>r.elapsedMs),.5),moveP90Ms:quantile(stats.map(r=>r.elapsedMs),.9),maxSampledHeapBytes:stats.reduce((n,r)=>Math.max(n,r.sampledHeapPeak),0),cumulativePeakRssKB:stats.reduce((n,r)=>Math.max(n,r.processPeakRssKB),0),incompleteMoves:stats.filter(r=>r.complete===false).length,unmeasuredSearchMoves:stats.filter(r=>r.complete===null).length,computeMs:gs.reduce((n,g)=>n+g.elapsedMs,0)};
}
export function analysis(kind,index){const rows=load(`${kind}-${index}`),out=rows.map(r=>{const m=measure(r.game,r.stats),t=tactical(r.game),tail=t.rows.filter(t=>t.ply>=r.game.state.ply-128),samples=r.stats.filter(s=>s.ply>=r.game.state.ply-128&&s.complete===true&&s.evaluated>1);return {id:r.game.id,contentSHA256:sha(r),metrics:m,tactics:t.rows,long:m.plies>=256||m.longestQuiet>=128,tags:{budget:r.game.reason,repeatFraction:m.repeatedStates/(m.plies+1),highRepetition:m.repeatedStates/(m.plies+1)>=.1,tailScoring:r.game.history.slice(-128).filter(h=>h.gain).length,tailDefensiveChoices:tail.filter(t=>t.criticalDefense).length,tailAvoidable:tail.filter(t=>t.avoidable).length,tailAllTied:samples.filter(s=>s.allTied).length,tailTieDenominator:samples.length}};});save(`analysis-${kind}-${index}`,out);console.log('independent census',kind,index,out.length);return out;}
function checkStats(r,start){assert.deepEqual(r.stats.map(s=>s.ply),Array.from({length:r.game.state.ply-start.state.ply},(_,i)=>i+start.state.ply));for(const s of r.stats)assert.equal(s.actor,(s.ply-start.state.ply+start.state.turn)%2);}
export function verify({requireReplays=true}={}){
 setup();const all={};let replayCount=0,extensionStages=0,extensionPlies=0;
 function verifyTasks(kind,index){const tasks=workTasks(kind,index),vs=requireReplays?load(`replay-${kind}-${index}`):null;if(vs){assert.equal(vs.length,tasks.length);assert.equal(new Set(vs.map(v=>v.id)).size,vs.length);}for(const t of tasks){const r=t.record;measure(r.game,r.stats);checkStats(r,t.start);for(const sample of r.stats)assert.equal(sample.label,(t.override??t.start.research.policyByActor)[sample.actor]);assert.deepEqual(r.game.history.slice(0,t.start.history.length),t.start.history);for(const k of ['initial','research','experiment','seed','starter','policies'])assert.deepEqual(r.game[k],t.start[k]);if(vs){const v=vs.find(v=>v.id===t.id);assert.ok(v?.matched);assert.equal(v.contentSHA256,sha(r));assert.equal(v.startSHA256,checkpointFingerprint(t.start));replayCount++;}}return tasks;}
 for(const kind of ['self','panel']){const seeds=protocol()[kind==='self'?'selfSeeds':'panelSeeds'],rows=seeds.flatMap((_,i)=>load(`${kind}-${i}`)),expected=plans(kind);assert.deepEqual(rows.map(r=>r.game.id).sort(),expected.map(g=>g.id).sort());assert.equal(new Set(rows.map(r=>r.game.id)).size,expected.length);for(let i=0;i<seeds.length;i++)verifyTasks(kind,i);for(const r of rows){const start=expected.find(g=>g.id===r.game.id);assert.deepEqual(r.game.initial,start.initial);assert.deepEqual(r.game.research,start.research);assert.deepEqual(r.game.experiment,start.experiment);for(let j=0;j<r.stages.length;j++){assert.equal(r.game.stages[j].timeBudgetMs,protocol().freshStagesMs[j]);assert.equal(r.stages[j].endingPly,r.game.stages[j].plies);}assert.ok(r.game.state.winner!==null||r.stages.length===protocol().freshStagesMs.length);}all[kind]=rows;}
 const ext=Array.from({length:6},(_,i)=>verifyTasks('extension',i)).flat().map(t=>t.record);for(const r of oldSources()){const es=ext.filter(e=>e.id===r.game.id);assert.ok(es.length);let cp=r.game;for(const [stage,e] of es.entries()){assert.equal(e.stage,stage);assert.equal(e.sourceSHA256,checkpointFingerprint(cp));assert.equal(e.game.stages.at(-1).timeBudgetMs,protocol().extension.stagesMs[stage]);extensionStages++;extensionPlies+=e.game.state.ply-cp.state.ply;cp=e.game;}assert.ok(cp.state.winner!==null||es.length===protocol().extension.stagesMs.length);}
 const ties={};for(const kind of ['development','holdout']){const rows=Array.from({length:4},(_,i)=>verifyTasks(kind,i)).flat().map(t=>t.record),cases=tieCases(kind);assert.equal(rows.length,cases.length*4);for(const c of cases)for(const variant of protocol().tieVariants){const r=rows.find(r=>r.caseID===c.caseID&&r.variant===variant);assert.ok(r);assert.equal(r.id,sha([protocol(),kind,c.caseID,variant]));assert.equal(r.sourceSHA256,checkpointFingerprint(c.checkpoint));assert.equal(r.game.stages.at(-1).timeBudgetMs,protocol()[kind==='development'?'tieDevelopment':'tieHoldout'].ms);}ties[kind]=Object.fromEntries(protocol().tieVariants.map(v=>[v,summarize(rows.filter(r=>r.variant===v))]));}
 const self=Object.fromEntries(protocol().selfPairs.map(pair=>[pair.join('/'),summarize(all.self.filter(r=>aid(r.game.research.labels)===aid(pair)))])),panel=Object.fromEntries(protocol().panelOpponents.map(opp=>[opp,Object.fromEntries(protocol().panelTargets.map(a=>[a,summarize(all.panel.filter(r=>aid(r.game.research.labels)===aid([a,opp])))]))]));
 const selfSame=all.self.filter(r=>r.game.research.labels[0]===r.game.research.labels[1]),mixed=all.self.filter(r=>r.game.research.labels[0]!==r.game.research.labels[1]),selfSeeds=protocol().selfSeeds,panelSeeds=protocol().panelSeeds;
 const effects={settlement:blockEstimate(selfSame,r=>Number(r.game.state.winner!==null)*(r.game.research.labels[0]==='D-walk'?2:-2),selfSeeds),mixedStrength:blockEstimate(mixed,r=>r.game.state.winner===null?0:r.game.research.labels[r.game.state.winner]==='D-walk'?1:-1,selfSeeds),panel:Object.fromEntries(protocol().panelOpponents.map(opp=>{const rs=all.panel.filter(r=>r.game.research.labels[1]===opp);return [opp,{wins:blockEstimate(rs,r=>Number(r.game.state.winner===0)*(r.game.research.labels[0]==='D-walk'?2:-2),panelSeeds),settlement:blockEstimate(rs,r=>Number(r.game.state.winner!==null)*(r.game.research.labels[0]==='D-walk'?2:-2),panelSeeds)}];}))};
 const extensions=oldSources().map(r=>{const es=ext.filter(e=>e.id===r.game.id),last=es.at(-1),arm=r.game.research.labels[0];return {id:r.game.id,arm,sourcePly:r.game.state.ply,sourceMetrics:measure(r.game),finalMetrics:measure(last.game,last.stats),finalPly:last.game.state.ply,winner:last.game.state.winner,reason:last.game.reason,addedMs:last.game.elapsedMs-r.game.elapsedMs,stages:es.map(e=>({stage:e.stage,ply:e.game.state.ply,winner:e.game.state.winner,scores:e.game.state.scores,sourceSHA256:e.sourceSHA256,tieMoves:e.stats.filter(s=>s.allTied).length,measured:e.stats.filter(s=>s.complete===true&&s.evaluated>1).length,meanTopTies:e.stats.filter(s=>s.complete===true&&s.evaluated>1).reduce((n,s)=>n+s.topTies,0)/Math.max(1,e.stats.filter(s=>s.complete===true&&s.evaluated>1).length)}))};});
 const summary={planSHA256:sha(protocol()),ledger:{newInitialGames:all.self.length+all.panel.length,selfInitial:all.self.length,panelInitial:all.panel.length,newContinuationStages:[...all.self,...all.panel].reduce((n,r)=>n+r.stages.length-1,0),oldContinuationSources:24,oldExtensionStages:extensionStages,oldAddedPlies:extensionPlies,tieDevelopmentForks:32,tieHoldoutForks:tieCases('holdout').length*4,AIReplayTasks:replayCount,newInitialPlies:[...all.self,...all.panel].reduce((n,r)=>n+r.game.state.ply,0)},self,panel,effects,ties,extensions};save('summary',summary);console.log(JSON.stringify({ledger:summary.ledger,self:Object.fromEntries(Object.entries(self).map(([k,r])=>[k,{settled:r.settled,u:r.unresolved,wins:r.winsByAI}]))}));return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [flag,a,b]=process.argv.slice(2);if(flag==='--setup')setup();else if(flag==='--extend')extend(Number(a));else if(flag==='--fresh')fresh(a,Number(b));else if(flag==='--forks')forks(a,Number(b));else if(flag==='--cases')console.log('New tie cases',tieCases('holdout').length);else if(flag==='--replay')replay(a,Number(b));else if(flag==='--analysis')analysis(a,Number(b));else if(flag==='--verify')verify();else if(flag==='--summarize')verify({requireReplays:false});else throw Error('Specify study stage');}

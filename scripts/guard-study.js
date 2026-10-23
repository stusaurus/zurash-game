// Frozen research experiment: initial games, continuations and counterfactual forks are separate ledgers.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {successors,key,apply} from '../src/engine.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {recordBoard} from '../src/board-lab.js';
import {MODELS,modelMove,inventory} from './guard-ai.js';
import {captureRoutes} from '../src/route-ai.js';
import {sourceGames,checkpointAt,checkpointFingerprint,immediateLossCensus,forcedThreeAction} from './trajectory-followup.js';
import {newGame,advanceGame,randomStream} from './tactics-completion.js';
import {researchPlans,newResearchGame,advanceResearch,researchMove,aggregateResearch,mergeContinuation,sha,referenceChildren,reachableGraph} from './stall-research.js';
import {verifyExtension} from './mode-continuation.js';
import {audit,traceKey} from './trajectory-audit.js';
import {replayDiagnosis} from './b-settlement-study.js';
import {completionSummary} from './tactics-completion-statistics.js';
import {prove} from './tactics-proof.js';
import {auditFixedFirst} from './b-followup.js';
export const forkIdentity=(caseID,model)=>sha(model==='depth3'?[caseID,model,'depth-only-root8-all-replies-v2']:[caseID,model]);
const dir='reports/guard-study-2026-10-23',oldDir='reports/trajectory-followup-2026-10-23';
const old=n=>{const path=`${oldDir}/${n}.json.gz.b64`;let b='';if(existsSync(path))b=readFileSync(path,'utf8');else for(let i=0;existsSync(`${oldDir}/${n}.part-${i}.b64`);i++)b+=readFileSync(`${oldDir}/${n}.part-${i}.b64`,'utf8').trim();return JSON.parse(gunzipSync(Buffer.from(b,'base64')));};
const save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);},load=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`))),has=n=>existsSync(`${dir}/${n}.json.gz`);
export const baseline=()=>[...mergeContinuation(sourceGames(),old('continuations')).games,...old('D-games')];
function selectCases(source){
 const previous=old('B-cases'),seen=new Set(previous.flatMap(c=>c.census.map(t=>key(t.state)))),unused=[];
 for(const type of ['mixed-loss','search-unresolved'])for(const g of source.filter(g=>g.experiment.boardId==='B'&&(type==='mixed-loss'?g.experiment.pair.join('/')==='mixed/defensive'&&g.state.winner!==null:g.experiment.pair.join('/')==='search/search'&&g.state.winner===null)).sort((a,b)=>a.id.localeCompare(b.id))){
  const actor=g.state.winner===null?g.state.turn:1-g.state.winner;let state=g.initial,turns=[];
  for(const h of g.history){if(state.turn===actor)turns.push(state.ply);state=apply(state,h.a);}
  const ply=g.state.winner===null?g.state.ply:turns.at(-2)??turns.at(-1);const cp=checkpointAt(g,ply),k=key(cp.state);if(seen.has(k))continue;seen.add(k);unused.push({sourceID:g.id,ply,kind:type,stateHash:sha(cp.state)});if(unused.filter(c=>c.kind===type).length===4)break;
 }
 assert.equal(unused.length,8);return [...previous.map(c=>({sourceID:c.sourceID,ply:c.pickedPly,kind:'previous-nine',stateHash:sha(c.checkpoint.state)})),...unused];
}
export function makePlan(source){return {version:1,sourceCommit:'8fd995aebb446bedeb738aa0cc5b2f62c5961564',sourceHash:sha(source),sourceIDs:source.map(g=>g.id).sort(),models:MODELS,cases:selectCases(source),caseBudget:{initialMs:1500,extensionMs:3000,extraPlies:96,nodeBudget:2048},freshB:{seeds:[8102301,8102323,8102349,8102371,8102393,8102417,8102441,8102467],pairs:[['archived','archived'],['retain','retain'],['routes2','routes2'],['retain','route'],['routes2','route'],['retain','routes2']],perGameMs:2000,maxPlies:4096},freshD:{seeds:[8202301,8202323,8202349,8202371],pairs:[['retain','retain'],['routes2','routes2'],['retain','route']],perGameMs:2000,maxPlies:4096},continuation:{A:{ids:source.filter(g=>g.experiment.boardId==='A'&&g.state.winner===null).map(g=>g.id).sort(),budgets:[2000]},C:{ids:source.filter(g=>g.experiment.boardId==='C'&&g.state.winner===null).map(g=>g.id).sort(),budgets:[3000]},E:{ids:source.filter(g=>g.experiment.boardId==='E'&&g.state.winner===null).map(g=>g.id).sort(),budgets:[1000,3000]},extraPliesPerStage:4096},limits:['Exploratory research; no official adoption','Original 448 + new 288 B + new 64 D = 800 initial-game IDs','85 checkpoint forks are not initial games','Same-model aiSwap duplicates are excluded before play','Wall-clock stopping is soft and environment-dependent; censored outcomes are never losses or draws','No production rules, CPU, boards or modes are changed']};}
function setup(){mkdirSync(dir,{recursive:true});const source=baseline();assert.equal(source.length,448);assert.equal(new Set(source.map(g=>g.id)).size,448);const pp=`${dir}/plan.json`;let plan;if(existsSync(pp)){plan=JSON.parse(readFileSync(pp));assert.equal(plan.sourceHash,sha(source));}else {plan=makePlan(source);writeFileSync(pp,JSON.stringify(plan,null,2)+'\n');}return {source,plan};}
function selectModel(s,label,rng,seen,options,stats){
 if(!MODELS.includes(label))return researchMove(s,label,rng,seen,options);
 const r=modelMove(s,label,rng,seen);if(stats)stats.push({ply:s.ply,actor:s.turn,...Object.fromEntries(Object.entries(r).filter(([k])=>!['action','memoryNote'].includes(k)))});return r.action;
}
function plansFor(mode,config){
 const record=recordBoard(toBoardState(RESEARCH_LAYOUTS.find(r=>r.id===mode)),{id:mode,name:mode});
 // Reuse factorial geometry/seat assignment while retaining the actual research labels.
 return config.pairs.flatMap(labels=>researchPlans(record,{stage:'guard-new-'+mode,seeds:config.seeds,pairs:[labels.map(l=>MODELS.includes(l)?'search':l)]}).filter(p=>labels[0]!==labels[1]||!p.aiSwap).map(p=>{const policies=p.aiSwap?[...labels].reverse():[...labels];return {...p,id:'guard-'+sha([mode,p.id,labels]),research:{labels,policyByActor:policies,version:'guard-1'},actualPair:labels};}));
}
export function runFresh(mode){
 const {plan}=setup(),config=mode==='B'?plan.freshB:plan.freshD,name='new-'+mode,plans=plansFor(mode,config),rows=has(name)?load(name):[],done=new Set(rows.map(r=>r.game.id));
 for(const p of plans){if(done.has(p.id))continue;const g=newResearchGame(p);g.research=p.research;g.experiment.pair=p.actualPair;g.policies=[...p.research.policyByActor];const stats=[];
  const game=advanceGame(g,{maxPlies:config.maxPlies,timeBudgetMs:config.perGameMs,memoryBudgetMb:768,select:(s,l,rng,seen,cs)=>selectModel(s,g.research.policyByActor[s.turn],rng,seen,cs,stats)});
  rows.push({game,stats});done.add(p.id);save(name,rows);if(rows.length%16===0)console.log(mode,'new',rows.length,'of',plans.length);
 }
}
export function runDControls(){
 const {plan}=setup(),config={seeds:plan.freshD.seeds,pairs:[['archived','archived'],['mixed','defensive']],perGameMs:plan.freshD.perGameMs,maxPlies:plan.freshD.maxPlies},pp=`${dir}/D-control-plan.json`,frozen={config,reason:'Supplementary same-seed/same-budget archived and mixed/defensive controls to distinguish AI strategy from seed changes. Adds 48 initial records to the primary 800; not a preregistered confirmatory claim.'};
 if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),frozen);else writeFileSync(pp,JSON.stringify(frozen,null,2)+'\n');
 const plans=plansFor('D',config),rows=has('D-controls')?load('D-controls'):[],done=new Set(rows.map(r=>r.game.id));
 for(const p of plans){if(done.has(p.id))continue;const g=newResearchGame(p);g.research=p.research;g.experiment.pair=p.actualPair;g.policies=[...p.research.policyByActor];const stats=[],game=advanceGame(g,{maxPlies:config.maxPlies,timeBudgetMs:config.perGameMs,memoryBudgetMb:768,select:(s,l,rng,seen,cs)=>selectModel(s,g.research.policyByActor[s.turn],rng,seen,cs,stats)});rows.push({game,stats});done.add(game.id);save('D-controls',rows);}console.log('D controls',rows.length);
}
export function runCases(){
 const {source,plan}=setup(),map=new Map(source.map(g=>[g.id,g])),rows=has('cases')?load('cases'):[],done=new Set(rows.map(r=>r.caseID));
 for(const c of plan.cases){const caseID=sha(c);if(done.has(caseID))continue;const original=map.get(c.sourceID),cp=checkpointAt(original,c.ply),actor=cp.state.turn;assert.equal(sha(cp.state),c.stateHash);
  const seen=new Map(cp.visits.map(([k,v])=>[k,v.count]));
  const probes=plan.models.map(model=>{const rng=randomStream(cp.rngStates[actor]),r=modelMove(cp.state,model,rng,seen,{trace:true}),n=apply(cp.state,r.action);return {model,...r,rngAfter:rng.state(),loss:immediateLossCensus(cp.state,r.action),forcedThree:n.winner===actor?true:auditFixedFirst(cp.state,r.action).forcedWithinThreeAfterThisAction};});
  const forks=plan.models.map(model=>{
   const stats=[],select=(s,l,rng,visits,cs)=>s.turn===actor?selectModel(s,model,rng,visits,cs,stats):researchMove(s,original.research.policyByActor[s.turn],rng,visits,cs);
   let game=advanceGame(cp,{maxPlies:cp.state.ply+plan.caseBudget.extraPlies,timeBudgetMs:plan.caseBudget.initialMs,memoryBudgetMb:768,select});
   const initial={reason:game.reason,ply:game.state.ply,winner:game.state.winner};
   if(game.state.winner===null)game=advanceGame(game,{maxPlies:game.state.ply+plan.caseBudget.extraPlies,timeBudgetMs:plan.caseBudget.extensionMs,memoryBudgetMb:768,select});
   return {forkID:forkIdentity(caseID,model),model,checkpointFingerprint:checkpointFingerprint(cp),initial,game,stats};
  });
  rows.push({caseID,...c,actor,sourceHash:sha(original),checkpoint:cp,probes,forks});save('cases',rows);done.add(caseID);console.log('cases',rows.length,'of',plan.cases.length);
 }
}
export function runContinuation(){
 const {source,plan}=setup(),map=new Map(source.map(g=>[g.id,g])),rows=has('continuations')?load('continuations'):[],done=new Set(rows.map(r=>r.game.id));
 for(const mode of ['A','C','E'])for(const id of plan.continuation[mode].ids){if(done.has(id))continue;const old=map.get(id);let game=old;const stages=[];
  for(const budget of plan.continuation[mode].budgets){if(game.state.winner!==null)break;const before=game;game=advanceResearch(game,{maxPlies:game.state.ply+plan.continuation.extraPliesPerStage,timeBudgetMs:budget,memoryBudgetMb:768});const v=verifyExtension(before,game);stages.push({...v,budgetMs:budget});}
  rows.push({mode,sourceHash:sha(old),game,stages});done.add(id);save('continuations',rows);if(rows.length%8===0)console.log('continuations',rows.length);
 }
}
export function extendBSelf(){
 setup();const primary=load('new-B'),selected=primary.filter(r=>r.game.research.labels[0]===r.game.research.labels[1]&&r.game.state.winner===null),config={sourceIDs:selected.map(r=>r.game.id).sort(),additionalMs:5000,extraPlies:4096,note:'Supplementary exploratory extension, identical additional budget for all unresolved self-play records across the three primary models. Never merged with heterogeneous 2000ms comparisons.'},pp=`${dir}/B-self-extension-plan.json`;
 if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),config);else writeFileSync(pp,JSON.stringify(config,null,2)+'\n');
 const rows=has('B-self-extensions')?load('B-self-extensions'):[],done=new Set(rows.map(r=>r.game.id));
 for(const r of selected){if(done.has(r.game.id))continue;const stats=[],game=advanceGame(r.game,{maxPlies:r.game.state.ply+config.extraPlies,timeBudgetMs:config.additionalMs,memoryBudgetMb:768,select:(s,l,rng,seen,cs)=>selectModel(s,r.game.research.policyByActor[s.turn],rng,seen,cs,stats)});verifyExtension(r.game,game);rows.push({sourceHash:sha(r.game),game,stats});done.add(game.id);save('B-self-extensions',rows);if(rows.length%8===0)console.log('B self continued',rows.length,'of',selected.length);}
}
export function proveBInitial(){
 setup();if(has('B-initial-proofs'))return;const base=toBoardState(RESEARCH_LAYOUTS.find(r=>r.id==='B')),rows=[];
 for(const swap of [false,true])for(const starter of [0,1])for(const horizon of [5,7]){const state={...base,players:swap?[...base.players].reverse():base.players,turn:starter},proof=prove(state,{horizon,nodeBudget:30000,timeBudgetMs:2000,memoryBudgetMb:768});rows.push({swap,starter,state,proof});}save('B-initial-proofs',rows);
}
export function runA(){
 const {source}=setup();if(has('A-witnesses'))return;
 const selected=source.filter(g=>g.experiment.boardId==='A'&&g.state.winner===null).sort((a,b)=>b.metrics.quiet-a.metrics.quiet||a.id.localeCompare(b.id)).slice(0,4);
 const rows=selected.map(g=>{const graph=reachableGraph(g.state,{maxStates:6000,maxMs:1500,independent:true});if(graph.witness){let state=g.state;for(const a of graph.witness.actions){const c=referenceChildren(state).find(c=>JSON.stringify(c.a)===JSON.stringify(a));assert.ok(c);state=c.n;}assert.notEqual(state.winner,null);assert.deepEqual(state,graph.witness.state);}return {sourceID:g.id,stateHash:sha(g.state),sourceQuiet:g.metrics.quiet,graph};});save('A-witnesses',rows);console.log('A witnesses',rows.filter(r=>r.graph.witness).length,'of',rows.length);
}
export function auditA(){
 const {source}=setup();if(has('A-tactical'))return;const witnesses=load('A-witnesses'),rows=[];
 for(const row of witnesses){const g=source.find(g=>g.id===row.sourceID),force=forcedThreeAction(g.state),seen=new Map(g.visits.map(([k,v])=>[k,v.count])),rng=randomStream(g.rngStates[g.state.turn]),ordinary=researchMove(g.state,g.research.policyByActor[g.state.turn],rng,seen,successors(g.state));
  const n=apply(g.state,ordinary),ordinaryProof=n.winner===g.state.turn?{forcedWithinThreeAfterThisAction:true}:auditFixedFirst(g.state,ordinary),certificate=force?(force.plies===1?{action:force.action,plies:1}:auditFixedFirst(g.state,force.action)):null;
  rows.push({sourceID:g.id,state:g.state,quiet:g.metrics.quiet,policy:g.research.policyByActor[g.state.turn],ordinary,ordinaryProof,forcedThree:force,certificate,cooperativeVictoryWitness:row.graph.witness,limits:['A cooperative victory is not a forced victory','No three-ply forced win is not proof of infinite stalemate']});
 }save('A-tactical',rows);console.log('A forced-three',rows.filter(r=>r.forcedThree).length);
}
export function localChoices(s){
 const p=s.turn,children=referenceChildren(s),own=captureRoutes(s,p).size;
 const rows=children.map(c=>{const replies=c.n.winner===null?referenceChildren(c.n):[],unsafe=replies.some(r=>r.n.winner===1-p);return {action:c.a,nextKey:key(c.n),win:c.n.winner===p,unsafe,capture:c.n.scores[p]>s.scores[p],preparation:c.n.winner===null&&captureRoutes(c.n,p).size>own};});
 return {legal:rows.length,uniqueNextStates:new Set(rows.map(r=>r.nextKey)).size,winning:rows.filter(r=>r.win).length,unsafe:rows.filter(r=>r.unsafe).length,safe:rows.filter(r=>!r.unsafe).length,uniqueSafeNextStates:new Set(rows.filter(r=>!r.unsafe).map(r=>r.nextKey)).size,safeCapture:rows.filter(r=>!r.unsafe&&r.capture).length,safeNonCapture:rows.filter(r=>!r.unsafe&&!r.capture).length,potentialPreparations:rows.filter(r=>!r.unsafe&&r.preparation).length,hasSafetyChoice:rows.some(r=>r.unsafe)&&rows.some(r=>!r.unsafe),note:'Safety means no immediate opponent win, not proof against longer play; preparations are projected routes, not forced captures'};
}
export function runChoices(){
 const {source}=setup(),current=mergeContinuation(source,load('continuations').map(r=>r.game)).games,pool=[...current,...load('new-B').map(r=>r.game),...load('new-D').map(r=>r.game),...load('D-controls').map(r=>r.game)];if(has('choices'))return;
 const selected=[];
 for(const mode of 'ABCDE'){
  const groups=new Map();for(const g of pool.filter(g=>g.experiment.boardId===mode).sort((a,b)=>a.id.localeCompare(b.id))){const pair=g.research.labels.join('/');if(!groups.has(pair))groups.set(pair,[]);groups.get(pair).push(g);}
  const seen=new Set();for(let round=0;round<8&&selected.filter(r=>r.mode===mode).length<8;round++)for(const gs of groups.values()){
   if(selected.filter(r=>r.mode===mode).length===8)break;const g=gs[round];if(!g)continue;let state=g.initial,states=[];
   for(const h of g.history){states.push(state);state=apply(state,h.a);}
   const actor=g.state.winner===null?state.turn:1-g.state.winner,eligible=states.filter(s=>s.turn===actor),chosen=g.state.winner===null?state:eligible.at(-2)??eligible.at(-1);if(!chosen||seen.has(key(chosen)))continue;seen.add(key(chosen));selected.push({mode,sourceID:g.id,pair:g.research.labels.join('/'),ply:chosen.ply,state:chosen});
  }
 }
 writeFileSync(`${dir}/choice-plan.json`,JSON.stringify({selection:'Deterministic round-robin by policy pair, sorted IDs; penultimate losing turn or unresolved endpoint. Retrospective descriptive sample, not an unbiased frequency estimate.',selected:selected.map(r=>({mode:r.mode,id:r.sourceID,ply:r.ply,stateHash:sha(r.state)}))},null,2)+'\n');
 save('choices',selected.map(r=>({...r,choices:localChoices(r.state)})));console.log('choice samples',selected.length);
}
function timing(stats){const sorted=stats.map(s=>s.elapsedMs).sort((a,b)=>a-b),median=sorted.length?sorted[Math.floor(sorted.length/2)]:null;return {moves:stats.length,totalMs:stats.reduce((n,s)=>n+s.elapsedMs,0),medianMs:median,maxMs:Math.max(0,...sorted),maxSampledHeapMB:Math.max(0,...stats.map(s=>Math.max(s.heapBefore??0,s.heapAfter??0,s.sampledHeapPeak??0)))/1048576,maxProcessPeakRssMB:Math.max(0,...stats.map(s=>s.processPeakRssKB??0))/1024};}
function groupSummary(gs){
 const completed=gs.filter(g=>g.state.winner!==null),unique=[...new Map(completed.map(g=>[traceKey(g),g])).values()];
 return {metrics:aggregateResearch(gs),diversity:audit(gs),uniqueCompletedMetrics:aggregateResearch(unique),conservative:completionSummary(gs.map(g=>({...g,cluster:g.experiment.cluster})))};
}
export function verify(){
 const {source,plan}=setup(),map=new Map(source.map(g=>[g.id,g])),continuations=load('continuations'),cases=load('cases'),b=load('new-B'),d=load('new-D'),dc=load('D-controls'),dcConfig=JSON.parse(readFileSync(`${dir}/D-control-plan.json`)).config;
 const expectedIDs=['A','C','E'].flatMap(m=>plan.continuation[m].ids).sort();assert.deepEqual(continuations.map(r=>r.game.id).sort(),expectedIDs);let added=0,newPlies=0,forkPlies=0;
 for(const r of continuations){const old=map.get(r.game.id);assert.equal(r.sourceHash,sha(old));added+=verifyExtension(old,r.game).addedPlies;assert.deepEqual(r.stages.map(s=>s.budgetMs),plan.continuation[r.mode].budgets.slice(0,r.stages.length));}
 for(const [mode,rows,config] of [['B',b,plan.freshB],['D',d,plan.freshD],['D',dc,dcConfig]]){
  const plans=plansFor(mode,config);assert.deepEqual(rows.map(r=>r.game.id).sort(),plans.map(p=>p.id).sort());
  for(const r of rows){const p=plans.find(p=>p.id===r.game.id),expected=newResearchGame(p);expected.research=p.research;expected.experiment.pair=p.actualPair;expected.policies=[...p.research.policyByActor];for(const k of ['id','initial','research','experiment','starter','seed','policies'])assert.deepEqual(r.game[k],expected[k]);replayDiagnosis(r.game,{independent:true});newPlies+=r.game.history.length;}
 }
 assert.equal(new Set([...source,...b.map(r=>r.game),...d.map(r=>r.game),...dc.map(r=>r.game)].map(g=>g.id)).size,848);
 assert.deepEqual(cases.map(c=>c.caseID).sort(),plan.cases.map(c=>sha(c)).sort());
 for(const c of cases){assert.deepEqual(c.probes.map(p=>p.model),plan.models);assert.deepEqual(c.forks.map(f=>f.model),plan.models);const original=map.get(c.sourceID),cp=checkpointAt(original,c.ply);assert.equal(c.sourceHash,sha(original));assert.equal(checkpointFingerprint(cp),checkpointFingerprint(c.checkpoint));
  for(const p of c.probes){const rng=randomStream(cp.rngStates[c.actor]),seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),r=modelMove(cp.state,p.model,rng,seen,{trace:true});assert.deepEqual(r.action,p.action);assert.deepEqual(r.retainedActions,p.retainedActions);if(p.model==='depth3'){assert.equal(p.definitionVersion,'depth-only-root8-all-replies-v2');assert.equal(p.replyBeam,'all');assert.equal(p.thirdPlyBeam,'all');}assert.equal(rng.state(),p.rngAfter);assert.deepEqual(immediateLossCensus(cp.state,p.action),p.loss);}
  for(const f of c.forks){assert.equal(f.forkID,forkIdentity(c.caseID,f.model));assert.equal(f.checkpointFingerprint,checkpointFingerprint(cp));assert.deepEqual(f.game.history.slice(0,cp.history.length),cp.history);assert.deepEqual(f.game.history[cp.history.length].a,c.probes.find(p=>p.model===f.model).action);replayDiagnosis(f.game,{independent:true});forkPlies+=f.game.history.length-cp.history.length;}
 }
 const merged=mergeContinuation(source,continuations.map(r=>r.game)),modeRows=[...'ABCDE'].map(mode=>{const gs=merged.games.filter(g=>g.experiment.boardId===mode),us=gs.filter(g=>g.state.winner===null),rs=continuations.filter(r=>r.mode===mode);return {mode,before:groupSummary(source.filter(g=>g.experiment.boardId===mode)),after:groupSummary(gs),continued:rs.length,newlySettled:rs.filter(r=>r.game.state.winner!==null).length,stageResults:rs.map(r=>({id:r.game.id,stages:r.stages})),unresolved:us.map(g=>({id:g.id,plies:g.state.ply,quiet:g.metrics.quiet,repetitions:g.repetitionCount,scoreDelta:g.state.scores.map((v,p)=>v-map.get(g.id).state.scores[p])})),closeFinishes:gs.filter(g=>g.state.winner!==null&&Math.abs(g.state.scores[0]-g.state.scores[1])===1).length};});
 const selfExtensions=load('B-self-extensions'),selfPlan=JSON.parse(readFileSync(`${dir}/B-self-extension-plan.json`));assert.deepEqual(selfExtensions.map(r=>r.game.id).sort(),selfPlan.sourceIDs);let selfAdded=0;const bm=new Map(b.map(r=>[r.game.id,r.game]));for(const r of selfExtensions){assert.equal(r.sourceHash,sha(bm.get(r.game.id)));selfAdded+=verifyExtension(bm.get(r.game.id),r.game).addedPlies;}
 const extendedSelf=mergeContinuation(b.map(r=>r.game),selfExtensions.map(r=>r.game)).games.filter(g=>g.research.labels[0]===g.research.labels[1]);
 const aw=load('A-witnesses'),at=load('A-tactical');assert.deepEqual(at.map(a=>a.sourceID).sort(),aw.map(a=>a.sourceID).sort());
 for(const row of aw){const old=map.get(row.sourceID);assert.equal(row.stateHash,sha(old.state));if(row.graph.witness){let state=old.state;for(const action of row.graph.witness.actions){const child=referenceChildren(state).find(c=>JSON.stringify(c.a)===JSON.stringify(action));assert.ok(child);state=child.n;}assert.notEqual(state.winner,null);assert.deepEqual(state,row.graph.witness.state);}}
 for(const a of at){const old=map.get(a.sourceID);assert.deepEqual(a.state,old.state);if(a.certificate&&a.forcedThree.plies===3)assert.deepEqual(a.certificate,auditFixedFirst(a.state,a.forcedThree.action));}
 const choices=load('choices');for(const c of choices)assert.deepEqual(c.choices,localChoices(c.state));
 const alternatives=[];for(const c of cases){const baseline=c.forks.find(f=>f.model==='archived');if(baseline.game.state.winner!==1-c.actor)continue;
  for(const f of c.forks.filter(f=>f.game.state.winner===c.actor)){let i=c.checkpoint.history.length;while(i<baseline.game.history.length&&i<f.game.history.length&&JSON.stringify(baseline.game.history[i].a)===JSON.stringify(f.game.history[i].a))i++;assert.ok(i<baseline.game.history.length&&i<f.game.history.length);let state=c.checkpoint.state;for(const h of baseline.game.history.slice(c.checkpoint.history.length,i))state=apply(state,h.a);assert.equal(state.turn,c.actor);alternatives.push({caseID:c.caseID,kind:c.kind,sourceID:c.sourceID,model:f.model,firstDivergencePly:state.ply,state,baselineAction:baseline.game.history[i].a,winningAlternative:f.game.history[i].a,baselineWinner:baseline.game.state.winner,alternativeWinner:f.game.state.winner,limits:['Victory against the fixed recorded opponent policy, not a minimax winning-move proof']});}
 }
 save('winning-alternatives',alternatives);
 const fresh=rows=>{const gs=rows.map(r=>r.game),pairs=[...new Set(gs.map(g=>g.research.labels.join('/')))];return {allDiversity:audit(gs),byPair:Object.fromEntries(pairs.map(pair=>{const subset=gs.filter(g=>g.research.labels.join('/')===pair);return [pair,{...groupSummary(subset),positionPairs:positionPairsLocal(subset),timing:MODELS.map(model=>({model,...timing(rows.filter(r=>subset.some(g=>g.id===r.game.id)).flatMap(r=>r.stats.filter(s=>s.model===model)))})),closeFinishes:subset.filter(g=>g.state.winner!==null&&Math.abs(g.state.scores[0]-g.state.scores[1])===1).length}];}))};};
 const casesSummary=plan.models.map(model=>({model,groups:['previous-nine','mixed-loss','search-unresolved'].map(kind=>{const cs=cases.filter(c=>c.kind===kind),probes=cs.map(c=>c.probes.find(p=>p.model===model)),fs=cs.map(c=>({actor:c.actor,f:c.forks.find(f=>f.model===model)}));return {kind,cases:cs.length,selectedRetained:probes.filter(p=>p.selectedRetained).length,immediateLossChoices:probes.filter(p=>p.loss.selectedAllowsImmediateLoss).length,forcedThree:probes.filter(p=>p.forcedThree).length,wins:fs.filter(r=>r.f.game.state.winner===r.actor).length,losses:fs.filter(r=>r.f.game.state.winner===1-r.actor).length,unresolved:fs.filter(r=>r.f.game.state.winner===null).length,probeTiming:timing(probes),forkTiming:timing(fs.flatMap(r=>r.f.stats))};})}));
 const summary={sourceGames:448,newInitialGames:b.length+d.length+dc.length,newB:b.length,newD:d.length+dc.length,DcontrolGames:dc.length,totalInitialIDs:848,continued:continuations.length,newlySettled:merged.newlySettled,addedContinuationPlies:added,verifiedNewPlies:newPlies,checkpointCases:cases.length,counterfactualForks:cases.reduce((n,c)=>n+c.forks.length,0),excludedLegacyDepth3Forks:17,addedForkPlies:forkPlies,models:plan.models,BselfExtended:Object.fromEntries([...new Set(extendedSelf.map(g=>g.research.labels.join('/')))].map(pair=>[pair,groupSummary(extendedSelf.filter(g=>g.research.labels.join('/')===pair))])),BselfContinuations:selfExtensions.length,BselfAddedPlies:selfAdded,BinitialProofs:load('B-initial-proofs'),choiceSamples:choices,winningAlternatives:alternatives.map(a=>({...a,state:undefined})),cases:casesSummary,B:fresh(b),D:fresh([...d,...dc]),modeRows,A:load('A-witnesses'),Atactical:load('A-tactical'),limits:[...plan.limits.filter(x=>!x.includes("= 800 initial-game IDs")),"Primary plan: 800 initial IDs; supplementary D controls: 48; total 848. Supplements are exploratory."]};
 writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');writeFileSync(`${dir}/verification.json`,JSON.stringify({sourceHash:sha(source),newInitialGames:b.length+d.length+dc.length,totalInitialIDs:848,continued:continuations.length,addedContinuationPlies:added,verifiedNewPlies:newPlies,counterfactualForks:summary.counterfactualForks,excludedLegacyDepth3Forks:17,addedForkPlies:forkPlies,sourceIDsUnchanged:true,checkpointRNGReplayed:true,allMovesIndependentlyReplayed:true,BselfContinuations:selfExtensions.length,BselfAddedPlies:selfAdded},null,2)+'\n');console.log(JSON.stringify({new:summary.newInitialGames,continued:summary.continued,settled:summary.newlySettled,B:Object.fromEntries(Object.entries(summary.B.byPair).map(([p,r])=>[p,[r.metrics.first,r.metrics.second,r.metrics.unresolved,r.metrics.positionWins]])),cases:casesSummary}));
}
// Position pairs use actual research labels, not the search labels used to generate factorial IDs.
function positionPairsLocal(gs){const map=new Map();for(const g of gs){const k=[g.seed,g.research.labels.join('/'),g.experiment.aiSwap,g.starter].join(':');if(!map.has(k))map.set(k,[]);map.get(k).push(g);}return [...map].map(([id,rows])=>{assert.equal(rows.length,2);const outcomes=rows.map(g=>({id:g.id,swap:g.experiment.positionSwap,winner:g.state.winner,slot:g.state.winner===null?null:g.experiment.physicalSlots.indexOf(g.initial.players[g.state.winner])}));return {id,seed:rows[0].seed,complete:outcomes.every(o=>o.winner!==null),sameSlot:outcomes.every(o=>o.winner!==null)&&outcomes[0].slot===outcomes[1].slot,outcomes};});}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const flag=process.argv[2];if(flag==='--cases')runCases();else if(flag==='--B')runFresh('B');else if(flag==='--D')runFresh('D');else if(flag==='--continue')runContinuation();else if(flag==='--A')runA();else if(flag==='--choices')runChoices();else if(flag==='--B-self-extend')extendBSelf();else if(flag==='--D-controls')runDControls();else if(flag==='--B-proof')proveBInitial();else if(flag==='--A-tactical')auditA();else if(flag==='--verify')verify();else {runCases();runFresh('B');runFresh('D');runContinuation();runA();auditA();runDControls();extendBSelf();proveBInitial();runChoices();verify();}}

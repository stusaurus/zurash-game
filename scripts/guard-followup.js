// Controlled research follow-up. No application imports; official rules stay fixed.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {key,apply} from '../src/engine.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {recordBoard} from '../src/board-lab.js';
import {MODELS,FACTOR_MODELS,modelMove,factorMove} from './guard-ai.js';
import {baseline as priorBaseline} from './guard-study.js';
import {newGame,advanceGame,randomStream} from './tactics-completion.js';
import {researchMove,researchPlans,newResearchGame,mergeContinuation,sha,aggregateResearch} from './stall-research.js';
import {checkpointFingerprint,immediateLossCensus} from './trajectory-followup.js';
import {verifyExtension} from './mode-continuation.js';
import {audit,traceKey} from './trajectory-audit.js';
import {replayDiagnosis} from './b-settlement-study.js';
import {completionSummary} from './tactics-completion-statistics.js';
import {auditFixedFirst} from './b-followup.js';
import {prove} from './tactics-proof.js';

const previous='reports/guard-study-2026-10-23',dir='reports/guard-followup-2026-10-24';
const read=(base,n)=>JSON.parse(gunzipSync(readFileSync(`${base}/${n}.json.gz`)));
const load=n=>read(dir,n),has=n=>existsSync(`${dir}/${n}.json.gz`);
function save(n,x){const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);}
export function currentSource(){
 const old=mergeContinuation(priorBaseline(),read(previous,'continuations').map(r=>r.game)).games;
 const b=mergeContinuation(read(previous,'new-B').map(r=>r.game),read(previous,'B-self-extensions').map(r=>r.game)).games;
 const source=[...old,...b,...read(previous,'new-D').map(r=>r.game),...read(previous,'D-controls').map(r=>r.game)];
 assert.equal(source.length,848);assert.equal(new Set(source.map(g=>g.id)).size,848);return source;
}
export function select(s,label,rng,seen,children,stats){
 let r;if(FACTOR_MODELS[label])r=factorMove(s,label,rng,seen);
 else if(MODELS.includes(label))r=modelMove(s,label,rng,seen);
 else return researchMove(s,label,rng,seen,children);
 if(stats)stats.push({ply:s.ply,actor:s.turn,...r,action:undefined});return r.action;
}
function play(g,{ms,plies=4096,actor=null,model=null,stats=[]}){
 return advanceGame(g,{maxPlies:Math.min(100000,g.state.ply+plies),timeBudgetMs:ms,memoryBudgetMb:768,
  select:(s,l,rng,seen,children)=>select(s,actor===s.turn?model:g.research.policyByActor[s.turn],rng,seen,children,stats)});
}
function checkpoint(g,ply){
 const cp=newGame(g.initial,{id:g.id,seed:g.seed,starter:g.starter,policies:['search','search']});
 for(const k of ['research','experiment','policies'])cp[k]=structuredClone(g[k]);
 const result=play(cp,{ms:3600000,plies:ply-cp.state.ply});assert.deepEqual(result.history,g.history.slice(0,ply-g.initial.ply));return result;
}
function candidates(source){
 const rows=read(previous,'cases').map(c=>({kind:c.kind,sourceID:c.sourceID,ply:c.ply,checkpoint:c.checkpoint}));
 const used=new Set(rows.map(r=>key(r.checkpoint.state))),groups=['archived','retain','routes2'].map(model=>source.filter(g=>g.experiment.boardId==='B'&&g.id.startsWith('guard-')&&g.research.labels.every(l=>l===model)&&g.state.winner!==null).sort((a,b)=>a.id.localeCompare(b.id)));
 let added=0;for(let i=0;i<20&&added<8;i++)for(const group of groups){
  const g=group[i];if(!g||added===8)continue;let s=g.initial,turns=[];
  for(const h of g.history){if(s.turn!==g.state.winner)turns.push(s.ply);s=apply(s,h.a);}
  const ply=turns.at(-2)??turns.at(-1);if(ply===undefined)continue;
  const cp=checkpoint(g,ply),k=key(cp.state);if(used.has(k))continue;used.add(k);added++;
  rows.push({kind:'new-self-loss',sourceID:g.id,ply,checkpoint:cp});
 }
 assert.equal(added,8);return rows.map(r=>({...r,caseID:sha([r.sourceID,r.ply,'factor-v1'])}));
}
export function setup(){
 mkdirSync(dir,{recursive:true});const source=currentSource(),path=`${dir}/plan.json`;
 if(existsSync(path)){const plan=JSON.parse(readFileSync(path));assert.equal(plan.sourceHash,sha(source));return {source,plan};}
 const cases=candidates(source);save('checkpoints',cases);
 const selected=source.filter(g=>g.state.winner===null&&(
  ['A','C','D','E'].includes(g.experiment.boardId)||
  g.experiment.boardId==='B'&&g.id.startsWith('guard-')&&g.research.labels[0]===g.research.labels[1]));
 const plan={version:1,sourceCommit:'02d33cf0e8161f90bc68cb7d998d1951451378be',sourceHash:sha(source),sourceIDs:source.map(g=>g.id).sort(),
  factors:FACTOR_MODELS,caseIDs:cases.map(c=>c.caseID),checkpointsHash:sha(cases),forkMs:2000,forkPlies:128,
  definition:'Common depth2, all replies, distance-only root order, safe screening in every arm; keeper adds tactical roots without overriding action selection. Routes changes only the evaluator. Shared inventory overhead is measured in all arms.',
  continuations:{ids:selected.map(g=>g.id).sort(),budgets:{A:[4000],B:[5000],C:[6000],D:[4000],E:[2000,6000]},extraPlies:4096},
  D:{seeds:[9102401,9102423,9102449,9102471,9102493,9102517,9102541,9102567],pairs:[['archived','archived'],['retain','retain'],['mixed','defensive']],perGameMs:2000,maxPlies:4096},
  limits:['Exploratory controlled diagnosis, not official adoption','No new B initial games; checkpoint forks and extensions are separate ledgers','Time caps are soft and environment-dependent; unresolved is neither loss nor draw','No production boards, rules, CPU or modes changed','No model selected for adoption from these outcomes']};
 writeFileSync(path,JSON.stringify(plan,null,2)+'\n');return {source,plan};
}
export function runFactors(){
 const {source,plan}=setup(),map=new Map(source.map(g=>[g.id,g])),cases=load('checkpoints'),rows=has('factors')?load('factors'):[],done=new Set(rows.map(r=>r.forkID)),models=Object.keys(FACTOR_MODELS);
 const resumed=rows.length>0&&rows.length<cases.length*models.length?{beforeCount:rows.length,beforeArchiveSHA256:sha(readFileSync(`${dir}/factors.json.gz`)),missingIDs:cases.flatMap(c=>models.map(m=>sha([c.caseID,m]))).filter(id=>!done.has(id)),note:'Only missing frozen IDs resumed; unarchived attempts are excluded, not independent samples.'}:null;
 for(const [i,c] of cases.entries())for(let j=0;j<models.length;j++){
  const model=models[(i+j)%models.length],forkID=sha([c.caseID,model]);if(done.has(forkID))continue;
  const cp=c.checkpoint,actor=cp.state.turn,rng=randomStream(cp.rngStates[actor]),seen=new Map(cp.visits.map(([k,v])=>[k,v.count]));
  const probe=factorMove(cp.state,model,rng,seen,{trace:true});probe.rngAfter=rng.state();probe.loss=immediateLossCensus(cp.state,probe.action);
  probe.forcedWithinThree=apply(cp.state,probe.action).winner===actor||auditFixedFirst(cp.state,probe.action).forcedWithinThreeAfterThisAction;
  const stats=[],game=play(cp,{ms:plan.forkMs,plies:plan.forkPlies,actor,model,stats});
  rows.push({forkID,caseID:c.caseID,kind:c.kind,sourceID:c.sourceID,sourceHash:sha(map.get(c.sourceID)),checkpointHash:checkpointFingerprint(cp),actor,model,probe,game,stats});
  done.add(forkID);save('factors',rows);if(rows.length%4===0)console.log('factor forks',rows.length,'of',cases.length*4);
 }
 if(resumed)writeFileSync(`${dir}/generation-recovery.json`,JSON.stringify({...resumed,afterCount:rows.length,afterArchiveSHA256:sha(readFileSync(`${dir}/factors.json.gz`))},null,2)+'\n');
}
export function runContinuations(){
 const {source,plan}=setup(),map=new Map(source.map(g=>[g.id,g])),rows=has('continuations')?load('continuations'):[],done=new Set(rows.map(r=>r.game.id));
 for(const id of plan.continuations.ids){if(done.has(id))continue;const before=map.get(id);let game=before;const stages=[],stats=[];
  for(const ms of plan.continuations.budgets[before.experiment.boardId]){if(game.state.winner!==null)break;const prior=game;game=play(game,{ms,plies:plan.continuations.extraPlies,stats});stages.push({ms,...verifyExtension(prior,game)});}
  rows.push({sourceHash:sha(before),game,stages,stats});done.add(id);save('continuations',rows);if(rows.length%8===0)console.log('continued',rows.length,'of',plan.continuations.ids.length);
 }
}
function plansD(plan){
 const record=recordBoard(toBoardState(RESEARCH_LAYOUTS.find(r=>r.id==='D')),{id:'D',name:'D'});
 return plan.D.pairs.flatMap(labels=>researchPlans(record,{stage:'guard-followup-D',seeds:plan.D.seeds,pairs:[labels.map(l=>MODELS.includes(l)?'search':l)]}).filter(p=>labels[0]!==labels[1]||!p.aiSwap).map(p=>({...p,id:'factor-D-'+sha([p.id,labels]),research:{labels,policyByActor:p.aiSwap?[...labels].reverse():labels,version:'factor-D-1'},actualPair:labels})));
}
export function runD(){
 const {plan}=setup(),plans=plansD(plan),rows=has('new-D')?load('new-D'):[],done=new Set(rows.map(r=>r.game.id));
 for(const p of plans){if(done.has(p.id))continue;const g=newResearchGame(p);g.research=p.research;g.experiment.pair=p.actualPair;g.policies=[...p.research.policyByActor];const stats=[],game=play(g,{ms:plan.D.perGameMs,plies:plan.D.maxPlies,stats});
  rows.push({game,stats});done.add(game.id);save('new-D',rows);if(rows.length%16===0)console.log('new D',rows.length,'of',plans.length);
 }
}
export function runLimits(){
 const {source}=setup();if(has('limits'))return;const rows=[];
 for(const mode of ['A','C','E'])for(const g of source.filter(g=>g.experiment.boardId===mode&&g.state.winner===null).sort((a,b)=>b.metrics.quiet-a.metrics.quiet||a.id.localeCompare(b.id)).slice(0,2)){
  const proof=prove(g.state,{horizon:5,nodeBudget:20000,timeBudgetMs:3000,memoryBudgetMb:768});rows.push({mode,sourceID:g.id,state:g.state,quiet:g.metrics.quiet,proof});
 }save('limits',rows);
}
// Retrospective explanations of observed successes, excluded from all game counts.
export function runCritical({verifyOnly=false}={}){
 setup();if(has('critical')&&!verifyOnly)return load('critical');const cases=load('checkpoints'),forks=load('factors'),rows=[],recomputed=new Map();
 const edges=[['shield-distance','keeper-distance','candidate'],['shield-routes','keeper-routes','candidate'],['shield-distance','shield-routes','evaluation'],['keeper-distance','keeper-routes','evaluation']];
 for(const c of cases)for(const [control,treatment,factor] of edges){
  const a=forks.find(f=>f.caseID===c.caseID&&f.model===control),b=forks.find(f=>f.caseID===c.caseID&&f.model===treatment);
  if(b.game.state.winner!==b.actor||a.game.state.winner===a.actor)continue;
  if(!recomputed.has(b.forkID)){
   const replay=play(c.checkpoint,{ms:3600000,plies:b.game.state.ply-c.ply,actor:b.actor,model:treatment});
   for(const k of ['history','state','rngStates','metrics','visits','repetitionCount'])assert.deepEqual(replay[k],b.game[k],k);
   recomputed.set(b.forkID,b.game.state.ply-c.ply);
  }
  let i=c.checkpoint.history.length;while(i<a.game.history.length&&i<b.game.history.length&&JSON.stringify(a.game.history[i].a)===JSON.stringify(b.game.history[i].a))i++;
  // The control may merely have stopped earlier along an identical prefix.
  if(i===a.game.history.length||i===b.game.history.length){rows.push({caseID:c.caseID,control,treatment,factor,controlOutcome:'unresolved',kind:'same-prefix-different-compute',winner:b.actor});continue;}
  const cp=play(c.checkpoint,{ms:3600000,plies:i-c.checkpoint.history.length,actor:b.actor,model:treatment});
  assert.equal(cp.state.turn,b.actor);assert.deepEqual(cp.history,b.game.history.slice(0,i));
  const seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),probes=[control,treatment].map(model=>factorMove(cp.state,model,randomStream(cp.rngStates[b.actor]),seen,{trace:true}));
  assert.deepEqual(probes[0].action,a.game.history[i].a);assert.deepEqual(probes[1].action,b.game.history[i].a);
  const aid=x=>JSON.stringify(x),winningAction=probes[1].action;
  rows.push({caseID:c.caseID,kind:c.kind,control,treatment,factor,controlOutcome:a.game.state.winner===null?'unresolved':'loss',winner:b.actor,ply:cp.state.ply,state:cp.state,rngState:cp.rngStates[b.actor],
   controlAction:probes[0].action,winningAction,winningActionInControlRoots:probes[0].retainedActions.some(x=>aid(x)===aid(winningAction)),
   identicalRootSets:JSON.stringify(probes[0].retainedActions)===JSON.stringify(probes[1].retainedActions),
   alternatives:probes.map(p=>({model:p.model,retained:p.retainedCount,scores:p.scores.filter(r=>[aid(probes[0].action),aid(winningAction)].includes(aid(r.action)))})),
   limits:['Subsequent target-AI choices also change; first divergence is not proof that one isolated action alone wins','Observed win versus a fixed opponent is not optimal-play fairness']});
 }
 const result={rows,recomputedWinningBranches:recomputed.size,recomputedPlies:[...recomputed.values()].reduce((a,b)=>a+b,0)};
 if(verifyOnly)assert.deepEqual(result,load('critical'));else save('critical',result);return result;
}
function singleGame(cp,row,{ms,plies}){
 const actor=cp.state.turn,at=cp.state.ply;
 return advanceGame(cp,{maxPlies:Math.min(100000,cp.state.ply+plies),timeBudgetMs:ms,memoryBudgetMb:768,
  select:(s,l,rng,seen,children)=>{
   const ordinary=select(s,s.turn===actor?row.control:cp.research.policyByActor[s.turn],rng,seen,children);
   return s.ply===at?row.winningAction:ordinary;
  }});
}
export function runSingle(){
 setup();const critical=load('critical'),selected=[],seen=new Set();
 for(const row of critical.rows.filter(r=>r.controlOutcome==='loss'&&r.state)){
  const k=sha([key(row.state),row.winningAction]);if(seen.has(k))continue;seen.add(k);selected.push(row);if(selected.length===4)break;
 }
 const config={selected:selected.map(r=>({caseID:r.caseID,control:r.control,ply:r.ply,stateHash:sha(r.state),action:r.winningAction})),ms:4000,extraPlies:128,note:'Post-hoc mechanism test, one state/action once. Change only the first action; then resume control AI. Ordinary control RNG is consumed before intervention. Not initial games or independent seed evidence.'};
 const path=`${dir}/single-action-plan.json`;if(existsSync(path))assert.deepEqual(JSON.parse(readFileSync(path)),config);else writeFileSync(path,JSON.stringify(config,null,2)+'\n');
 const cases=load('checkpoints'),forks=load('factors'),rows=has('single-actions')?load('single-actions'):[],done=new Set(rows.map(r=>r.id));
 for(const row of selected){const id=sha([row.caseID,row.control,row.ply,'single-action']);if(done.has(id))continue;
  const c=cases.find(c=>c.caseID===row.caseID),control=forks.find(f=>f.caseID===row.caseID&&f.model===row.control),cp=play(c.checkpoint,{ms:3600000,plies:row.ply-c.ply,actor:c.checkpoint.state.turn,model:row.control});assert.deepEqual(cp.state,row.state);
  const baseline=play(cp,{ms:3600000,plies:control.game.state.ply-cp.state.ply,actor:cp.state.turn,model:row.control});
  for(const k of ['history','state','rngStates','metrics'])assert.deepEqual(baseline[k],control.game[k]);
  const game=singleGame(cp,row,{ms:config.ms,plies:config.extraPlies});rows.push({id,caseID:row.caseID,control:row.control,checkpoint:cp,winningAction:row.winningAction,baselineWinner:baseline.state.winner,game});done.add(id);save('single-actions',rows);
 }
}
function describe(gs){
 const m=aggregateResearch(gs),complete=gs.filter(g=>g.state.winner!==null),diversity=audit(gs),unique=[...new Map(complete.map(g=>[traceKey(g),g])).values()];
 return {metrics:m,diversity,uniqueCompleted:aggregateResearch(unique),conservative:completionSummary(gs.map(g=>({...g,cluster:g.experiment.cluster}))),closeFinishes:complete.filter(g=>Math.abs(g.state.scores[0]-g.state.scores[1])===1).length,maxQuiet:Math.max(0,...gs.map(g=>Math.max(g.metrics.quiet,g.metrics.longestQuiet))),repeatedUnresolved:gs.filter(g=>g.state.winner===null&&g.repetitionCount>0).length};
}
function times(stats){const a=stats.map(r=>r.elapsedMs).sort((a,b)=>a-b);return {moves:a.length,medianMs:a[Math.floor(a.length/2)]??null,maxMs:Math.max(0,...a),sampledHeapMax:Math.max(0,...stats.flatMap(r=>[r.heapBefore,r.heapAfter,r.sampledHeapPeak].filter(Number.isFinite))),cumulativeProcessPeakRssKB:Math.max(0,...stats.map(r=>r.processPeakRssKB??0))};}
function positionClusters(gs){return [...new Set(gs.map(g=>g.seed))].map(seed=>{const rows=gs.filter(g=>g.seed===seed),wins=[0,0];let unresolved=0;for(const g of rows){if(g.state.winner===null)unresolved++;else wins[g.experiment.physicalSlots.indexOf(g.initial.players[g.state.winner])]++;}return {seed,games:rows.length,wins,unresolved,robustSlot:wins[0]>wins[1]+unresolved?0:wins[1]>wins[0]+unresolved?1:null};});}
export function verify(){
 const {source,plan}=setup(),map=new Map(source.map(g=>[g.id,g])),cs=load('checkpoints'),fs=load('factors'),cont=load('continuations'),d=load('new-D');
 assert.equal(sha(cs),plan.checkpointsHash);assert.deepEqual(cs.map(c=>c.caseID),plan.caseIDs);assert.deepEqual(cont.map(r=>r.game.id).sort(),plan.continuations.ids);
 const expected=cs.flatMap(c=>Object.keys(FACTOR_MODELS).map(model=>sha([c.caseID,model]))).sort();assert.deepEqual(fs.map(r=>r.forkID).sort(),expected);let forkPlies=0,added=0,newPlies=0;
 for(const c of cs){const before=map.get(c.sourceID),cp=checkpoint(before,c.ply);assert.equal(checkpointFingerprint(cp),checkpointFingerprint(c.checkpoint));const pairs=fs.filter(f=>f.caseID===c.caseID);
  for(const prefix of ['shield','keeper'])assert.deepEqual(pairs.find(r=>r.model===prefix+'-distance').probe.retainedActions,pairs.find(r=>r.model===prefix+'-routes').probe.retainedActions);
  for(const f of pairs){assert.equal(f.sourceHash,sha(before));assert.equal(f.checkpointHash,checkpointFingerprint(cp));const rng=randomStream(cp.rngStates[f.actor]),seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),p=factorMove(cp.state,f.model,rng,seen,{trace:true});
   for(const k of ['action','retainedActions','scores','certificate','leafEvaluations'])assert.deepEqual(p[k],f.probe[k]);assert.equal(rng.state(),f.probe.rngAfter);assert.deepEqual(immediateLossCensus(cp.state,p.action),f.probe.loss);
   assert.equal(f.probe.forcedWithinThree,apply(cp.state,p.action).winner===f.actor||auditFixedFirst(cp.state,p.action).forcedWithinThreeAfterThisAction);
   assert.deepEqual(f.game.history.slice(0,cp.history.length),cp.history);assert.deepEqual(f.game.history[cp.history.length].a,p.action);replayDiagnosis(f.game,{independent:true});forkPlies+=f.game.history.length-cp.history.length;
  }
 }
 for(const r of cont){const before=map.get(r.game.id);assert.equal(r.sourceHash,sha(before));added+=verifyExtension(before,r.game).addedPlies;assert.deepEqual(r.stages.map(s=>s.ms),plan.continuations.budgets[before.experiment.boardId].slice(0,r.stages.length));}
 const ps=plansD(plan);assert.deepEqual(d.map(r=>r.game.id).sort(),ps.map(p=>p.id).sort());
 for(const r of d){const p=ps.find(p=>p.id===r.game.id),g=newResearchGame(p);g.research=p.research;g.experiment.pair=p.actualPair;g.policies=[...p.research.policyByActor];for(const k of ['id','initial','research','experiment','policies','seed','starter'])assert.deepEqual(r.game[k],g[k]);replayDiagnosis(r.game,{independent:true});newPlies+=r.game.history.length;}
 const merged=mergeContinuation(source,cont.map(r=>r.game));assert.equal(new Set([...source,...d.map(r=>r.game)].map(g=>g.id)).size,848+d.length);
 const factorRows=Object.keys(FACTOR_MODELS).map(model=>({model,groups:[...new Set(cs.map(c=>c.kind))].map(kind=>{const rows=fs.filter(f=>f.model===model&&f.kind===kind);return {kind,cases:rows.length,wins:rows.filter(r=>r.game.state.winner===r.actor).length,losses:rows.filter(r=>r.game.state.winner===1-r.actor).length,unresolved:rows.filter(r=>r.game.state.winner===null).length,unsafeSelections:rows.filter(r=>r.probe.loss.selectedAllowsImmediateLoss).length,forcedThree:rows.filter(r=>r.probe.forcedWithinThree).length,probeTiming:times(rows.map(r=>r.probe)),moveTiming:times(rows.flatMap(r=>r.stats.filter(s=>s.model===model)))};})}));
 const continuationRows=[...'ABCDE'].map(mode=>{const before=source.filter(g=>g.experiment.boardId===mode),rows=cont.filter(r=>r.game.experiment.boardId===mode),after=merged.games.filter(g=>g.experiment.boardId===mode);return {mode,continued:rows.length,newlySettled:rows.filter(r=>r.game.state.winner!==null).length,addedCaptures:rows.reduce((n,r)=>n+r.stages.reduce((v,s)=>v+s.addedCaptures,0),0),before:describe(before),after:describe(after),stages:rows.map(r=>({id:r.game.id,stages:r.stages})),unresolved:after.filter(g=>g.state.winner===null).map(g=>({id:g.id,pair:g.research.labels,ply:g.state.ply,quiet:g.metrics.quiet,repetitionCount:g.repetitionCount}))};});
 const dRows=Object.fromEntries(plan.D.pairs.map(pair=>{const games=d.filter(r=>r.game.research.labels.join('/')===pair.join('/')).map(r=>r.game);return [pair.join('/'),{...describe(games),positionClusters:positionClusters(games)}];}));
 const selfB=Object.fromEntries(['archived','retain','routes2'].map(model=>{const filter=g=>g.id.startsWith('guard-')&&g.experiment.boardId==='B'&&g.research.labels.every(l=>l===model);return [model,{before:describe(source.filter(filter)),after:describe(merged.games.filter(filter))}];}));
 const critical=runCritical({verifyOnly:has('critical')});
 const single=load('single-actions'),singlePlan=JSON.parse(readFileSync(`${dir}/single-action-plan.json`));assert.deepEqual(single.map(r=>r.id).sort(),singlePlan.selected.map(r=>sha([r.caseID,r.control,r.ply,'single-action'])).sort());let singlePlies=0;
 for(const r of single){
  const row=critical.rows.find(c=>c.caseID===r.caseID&&c.control===r.control&&c.ply===r.checkpoint.state.ply);assert.ok(row);assert.deepEqual(r.winningAction,row.winningAction);
  const c=cs.find(c=>c.caseID===r.caseID),cp=play(c.checkpoint,{ms:3600000,plies:row.ply-c.ply,actor:c.checkpoint.state.turn,model:r.control});assert.equal(checkpointFingerprint(cp),checkpointFingerprint(r.checkpoint));
  assert.equal(r.baselineWinner,fs.find(f=>f.caseID===r.caseID&&f.model===r.control).game.state.winner);assert.equal(r.game.stages.at(-1).timeBudgetMs,singlePlan.ms);
  replayDiagnosis(r.game,{independent:true});const actual=singleGame(cp,row,{ms:3600000,plies:r.game.state.ply-cp.state.ply});for(const k of ['history','state','rngStates','metrics'])assert.deepEqual(actual[k],r.game[k]);singlePlies+=r.game.history.length-r.checkpoint.history.length;
 }
 const outcomes=fs.map(f=>({caseID:f.caseID,kind:f.kind,model:f.model,winner:f.game.state.winner,actor:f.actor,retained:f.probe.retainedCount,choice:f.probe.action,reason:f.game.reason}));
 const summary={sourceInitialIDs:848,newInitialGames:d.length,totalInitialIDs:848+d.length,newPlies,continued:cont.length,newlySettled:merged.newlySettled,addedContinuationPlies:added,checkpointCases:cs.length,forks:fs.length,forkAddedPlies:forkPlies,singleActionBranches:single.length,singleAddedPlies:singlePlies,singleOutcomes:single.map(r=>({id:r.id,caseID:r.caseID,ply:r.checkpoint.state.ply,control:r.control,actor:r.checkpoint.state.turn,winner:r.game.state.winner,reason:r.game.reason})),factorRows,outcomes,continuationRows,D:dRows,Bself:selfB,critical,limits:load('limits'),interpretation:plan.limits};
 writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');writeFileSync(`${dir}/verification.json`,JSON.stringify({sourceHash:plan.sourceHash,newInitialGames:d.length,totalInitialIDs:848+d.length,newPlies,continued:cont.length,addedContinuationPlies:added,forks:fs.length,forkAddedPlies:forkPlies,singleActionBranches:single.length,singleAddedPlies:singlePlies,checkpointRNGRecomputed:true,independentLegalReplay:true,rootSetsIdenticalAcrossEvaluators:true,singleActionHistoryAndRNGRecomputed:true},null,2)+'\n');
 console.log(JSON.stringify({new:d.length,continued:cont.length,settled:merged.newlySettled,factors:factorRows,D:Object.fromEntries(Object.entries(dRows).map(([k,r])=>[k,[r.metrics.first,r.metrics.second,r.metrics.unresolved,r.metrics.positionWins]]))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const flag=process.argv[2];if(flag==='--plan')setup();else if(flag==='--factors')runFactors();else if(flag==='--continue')runContinuations();else if(flag==='--D')runD();else if(flag==='--limits')runLimits();else if(flag==='--critical')runCritical();else if(flag==='--single')runSingle();else if(flag==='--verify')verify();else {setup();runFactors();runContinuations();runD();runLimits();runCritical();runSingle();verify();}}

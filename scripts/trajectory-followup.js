// Research-only follow-up; never imported by the application or production CPU.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {apply,key,successors} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
import {captureRoutes} from '../src/route-ai.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {recordBoard} from '../src/board-lab.js';
import {newGame,advanceGame,randomStream} from './tactics-completion.js';
import {researchPlans,newResearchGame,advanceResearch,researchMove,aggregateResearch,sha,referenceChildren,mergeContinuation} from './stall-research.js';
import {verifyExtension} from './mode-continuation.js';
import {audit} from './trajectory-audit.js';
import {replayDiagnosis} from './b-settlement-study.js';
import {auditFixedFirst} from './b-followup.js';
import {prove} from './tactics-proof.js';
const sourceDir='reports/trajectory-audit-2026-10-23',dir='reports/trajectory-followup-2026-10-23';
export const VARIANTS=['archived','depth3','wide2','routes2','tactical3'];
export const sourceGames=()=>[...'ABCDE'].flatMap(m=>JSON.parse(gunzipSync(Buffer.from(readFileSync(`${sourceDir}/games-${m}.json.gz.b64`,'utf8'),'base64'))));
const save=(n,x)=>writeFileSync(`${dir}/${n}.json.gz.b64`,gzipSync(JSON.stringify(x),{mtime:0}).toString('base64')+'\n');
const has=n=>existsSync(`${dir}/${n}.json.gz.b64`)||existsSync(`${dir}/${n}.part-0.b64`);
const load=n=>{
 const p=`${dir}/${n}.json.gz.b64`;let encoded='';
 if(existsSync(p))encoded=readFileSync(p,'utf8');else for(let i=0;existsSync(`${dir}/${n}.part-${i}.b64`);i++)encoded+=readFileSync(`${dir}/${n}.part-${i}.b64`,'utf8').trim();
 if(!encoded)throw Error('Missing research archive '+n);return JSON.parse(gunzipSync(Buffer.from(encoded,'base64')));
};
export const checkpointFingerprint=g=>sha(Object.fromEntries(['id','initial','state','history','visits','rngStates','research','experiment','starter','seed','policies','metrics','lastLead'].map(k=>[k,g[k]])));
export function checkpointAt(g,ply){
 assert.ok(ply>=g.initial.ply&&ply<=g.state.ply);
 const n=newGame(g.initial,{id:g.id,starter:g.starter,policies:g.policies,seed:g.seed});n.research=structuredClone(g.research);n.experiment=structuredClone(g.experiment);
 const c=advanceResearch(n,{maxPlies:ply,timeBudgetMs:3600000,memoryBudgetMb:768});
 assert.deepEqual(c.history,g.history.slice(0,ply-g.initial.ply),'Policy/RNG replay diverged');return c;
}
export function immediateLossCensus(s,chosen){
 const cs=referenceChildren(s),p=s.turn,rows=cs.map(c=>({action:c.a,allowsOpponentWin:c.n.winner===null&&referenceChildren(c.n).some(r=>r.n.winner===1-p),wins:c.n.winner===p}));
 const selected=rows.find(r=>JSON.stringify(r.action)===JSON.stringify(chosen));assert.ok(selected);
 return {legal:rows.length,safe:rows.filter(r=>!r.allowsOpponentWin).length,selectedAllowsImmediateLoss:selected.allowsOpponentWin,avoidableImmediateLoss:selected.allowsOpponentWin&&rows.some(r=>!r.allowsOpponentWin),safeExample:rows.find(r=>!r.allowsOpponentWin)?.action??null};
}
// A complete root/response census for a forced win within three plies.
// captureRoutes is exact for next-turn captures; saved certificates are rechecked independently.
export function forcedThreeAction(s,cs=successors(s)){
 const p=s.turn;for(const c of cs){
  if(c.n.winner===p)return {action:c.a,plies:1};
  if(c.n.winner!==null||c.n.scores[p]<(s.target??3)-1)continue;
  const replies=successors(c.n);
  if(replies.length&&replies.every(r=>r.n.winner===null&&captureRoutes(r.n,p).size>0))return {action:c.a,plies:3};
 }
 return null;
}
export function diagnosticMove(s,variant,rng,seen=new Map(),{nodeBudget=2048}={}){
 const cs=successors(s),p=s.turn;if(!cs.length)return {action:null,nodes:0,complete:true};
 if(variant==='archived')return {action:researchMove(s,'search',rng,seen,cs),nodes:null,complete:null};
 assert.ok(VARIANTS.includes(variant));const routes=variant==='routes2'||variant==='tactical3';
 const val=n=>{
  let v=evaluate(n,p);if(!routes||n.winner!==null)return v;
  const a=captureRoutes(n,p).size,b=captureRoutes(n,1-p).size;v+=180*(a-b);
  if(n.turn===p&&n.scores[p]===(n.target??3)-1&&a)v+=20000;
  if(n.turn===1-p&&n.scores[1-p]===(n.target??3)-1&&b)v-=20000;return v;
 };
 const ranked=cs.map(c=>({...c,v:val(c.n)-(seen.get(key(c.n))??0)*130,tie:rng()})).sort((a,b)=>b.v-a.v||a.tie-b.tie);
 const win=ranked.find(c=>c.n.winner===p);if(win)return {action:win.a,nodes:0,complete:true,forced:1};
 let pool=ranked;
 if(routes&&s.scores[1-p]===(s.target??3)-1){const safe=pool.filter(c=>!captureRoutes(c.n,1-p).size);if(safe.length)pool=safe;}
 if(variant==='tactical3'){
  const force=forcedThreeAction(s,pool);if(force)return {action:force.action,nodes:0,complete:true,forced:force.plies,safeRoots:pool.length};
 }
 const depth=variant==='depth3'?3:2,beam=variant==='wide2'?Infinity:routes?12:8;
 let nodes=0,complete=true,done=0,best=-Infinity,action=pool[0].a;const stop=Symbol();
 function search(n,d){
  if(n.winner!==null||!d)return val(n);if(++nodes>nodeBudget)throw stop;
  const children=successors(n);if(!children.length)return val(n);
  const sign=n.turn===p?1:-1,ordered=children.map(c=>({...c,v:val(c.n)})).sort((a,b)=>sign*(b.v-a.v)).slice(0,beam);
  let value=sign===1?-Infinity:Infinity;
  for(const c of ordered){const v=search(c.n,d-1);value=sign===1?Math.max(value,v):Math.min(value,v);}return value;
 }
 for(const c of pool.slice(0,beam))try{
  const v=.88*search(c.n,depth-1)+.12*c.v-(seen.get(key(c.n))??0)*130;done++;
  if(v>best){best=v;action=c.a;}
 }catch(e){if(e!==stop)throw e;complete=false;break;}
 return {action,nodes,complete,depth,beam:Number.isFinite(beam)?beam:'all',rootEvaluated:done,safeRoots:pool.length};
}
export function positionPairs(gs){
 const groups=new Map();for(const g of gs){const e=g.experiment,k=[g.seed,e.pair.join('/'),e.aiSwap,g.starter].join(':');if(!groups.has(k))groups.set(k,[]);groups.get(k).push(g);}
 return [...groups].map(([id,rows])=>{
  assert.equal(rows.length,2,'Each position comparison needs both swaps');assert.deepEqual(rows.map(g=>g.experiment.positionSwap).sort(),[false,true]);
  const outcomes=rows.map(g=>({id:g.id,swap:g.experiment.positionSwap,winner:g.state.winner,slot:g.state.winner===null?null:g.experiment.physicalSlots.indexOf(g.initial.players[g.state.winner]),first:g.state.winner===null?null:g.state.winner===g.starter}));
  return {id,seed:rows[0].seed,pair:rows[0].experiment.pair.join('/'),outcomes,complete:outcomes.every(o=>o.winner!==null),followsSlot:outcomes.every(o=>o.winner!==null)&&outcomes[0].slot===outcomes[1].slot,followsActor:outcomes.every(o=>o.winner!==null)&&outcomes[0].winner===outcomes[1].winner};
 });
}
export function makePlan(source){return {version:1,sourceCommit:'12e37117c5db4f2f757d1469d6494e65e125c7f8',sourceHash:sha(source),sourceGames:400,continuation:{ids:source.filter(g=>g.state.winner===null&&['A','C','D','E'].includes(g.experiment.boardId)).map(g=>g.id).sort(),timeBudgetMs:2500,extraPlies:4096},B:{ids:source.filter(g=>g.experiment.boardId==='B'&&g.experiment.pair.join('/')==='search/search'&&g.state.winner===g.starter).map(g=>g.id).sort(),variants:VARIANTS,checkpoint:'Last avoidable immediate-loss move, otherwise penultimate losing-player turn; chosen using original traces only',forkBudgetMs:1000,extraPlies:48,nodeBudget:2048,discoverySeeds:[6102301,6102323],heldoutSeeds:[6102349,6102371],note:'Variants frozen before comparison. Original losses selected retrospectively; local diagnosis, not a fairness estimate.'},D:{seeds:[7102301,7102323,7102349,7102371],pairs:[['search','search'],['mixed','defensive']],timeBudgetMs:2000,maxPlies:4096,note:'Fresh holdout; report separately from original 400 and original budgets.'},accounting:'400 source games + 48 new D games; continuations preserve IDs; B forks excluded from both ledgers. No official settings changed.'};}
function planAndSource(){mkdirSync(dir,{recursive:true});const source=sourceGames(),plan=makePlan(source),p=`${dir}/plan.json`;assert.equal(source.length,400);if(existsSync(p))assert.deepEqual(JSON.parse(readFileSync(p)),plan);else writeFileSync(p,JSON.stringify(plan,null,2)+'\n');return {source,plan};}
export function runContinuations(){
 const {source,plan}=planAndSource(),map=new Map(source.map(g=>[g.id,g]));let delta=has('continuations')?load('continuations'):[],done=new Set(delta.map(g=>g.id));
 for(const id of plan.continuation.ids){if(done.has(id))continue;const g=map.get(id),n=advanceResearch(g,{maxPlies:g.state.ply+plan.continuation.extraPlies,timeBudgetMs:plan.continuation.timeBudgetMs,memoryBudgetMb:768});verifyExtension(g,n);delta.push(n);done.add(id);save('continuations',delta);if(delta.length%8===0)console.log('continued',delta.length);}
}
export function runD(){
 const {plan}=planAndSource(),record=recordBoard(toBoardState(RESEARCH_LAYOUTS.find(r=>r.id==='D')),{id:'D',name:'D'}),plans=researchPlans(record,{stage:'trajectory-followup-D',seeds:plan.D.seeds,pairs:plan.D.pairs}).filter(p=>p.pair[0]!==p.pair[1]||!p.aiSwap);
 let games=has('D-games')?load('D-games'):[],done=new Set(games.map(g=>g.id));
 for(const p of plans){if(done.has(p.id))continue;games.push(advanceResearch(newResearchGame(p),{timeBudgetMs:plan.D.timeBudgetMs,maxPlies:plan.D.maxPlies,memoryBudgetMb:768}));save('D-games',games);done.add(p.id);}console.log('new D',games.length);
}
export function runB(){
 const {source,plan}=planAndSource();let cases=has('B-cases')?load('B-cases'):[],done=new Set(cases.map(c=>c.sourceID));
 for(const id of plan.B.ids){if(done.has(id))continue;const g=source.find(g=>g.id===id),loser=1-g.state.winner;let s=g.initial,census=[];
  for(let i=0;i<g.history.length;i++){if(s.turn===loser)census.push({ply:s.ply,state:s,chosen:g.history[i].a,...immediateLossCensus(s,g.history[i].a)});s=apply(s,g.history[i].a);}
  const picked=census.filter(c=>c.avoidableImmediateLoss).at(-1)??census.at(-2)??census.at(-1);assert.ok(picked);
  const checkpoint=checkpointAt(g,picked.ply);assert.equal(checkpoint.state.turn,loser);
  const proof=prove(checkpoint.state,{horizon:3,nodeBudget:10000,timeBudgetMs:1500,memoryBudgetMb:768});
  const probes=plan.B.variants.map(variant=>{const rng=randomStream(checkpoint.rngStates[loser]),seen=new Map(checkpoint.visits.map(([k,v])=>[k,v.count])),start=performance.now(),r=diagnosticMove(checkpoint.state,variant,rng,seen,{nodeBudget:plan.B.nodeBudget}),chosen=successors(checkpoint.state).find(c=>JSON.stringify(c.a)===JSON.stringify(r.action));
   const forced=chosen.n.winner===loser?{forcedWithinThreeAfterThisAction:true,plies:1}:auditFixedFirst(checkpoint.state,r.action);return {variant,...r,rngAfter:rng.state(),elapsedMs:performance.now()-start,loss:immediateLossCensus(checkpoint.state,r.action),forced};});
  const forks=plan.B.variants.map(variant=>{const fork=advanceGame(checkpoint,{maxPlies:checkpoint.state.ply+plan.B.extraPlies,timeBudgetMs:plan.B.forkBudgetMs,memoryBudgetMb:768,select:(n,label,rng,seen,options)=>n.turn===loser?diagnosticMove(n,variant,rng,seen,{nodeBudget:plan.B.nodeBudget}).action:researchMove(n,g.research.policyByActor[n.turn],rng,seen,options)});return {forkID:sha([id,picked.ply,variant]),variant,sourceID:id,checkpointHash:sha(checkpoint),game:fork};});
  cases.push({sourceID:id,seed:g.seed,loser,split:plan.B.discoverySeeds.includes(g.seed)?'discovery':'heldout',sourceHash:sha(g),census,pickedPly:picked.ply,checkpoint,proof,probes,forks});save('B-cases',cases);console.log('B cases',cases.length,'ply',picked.ply,'avoidable',picked.avoidableImmediateLoss);
 }
}
// Supplementary fixed-horizon analysis of every losing-player turn, without using variant outcomes to select a state.
export function analyseB(){
 const {plan}=planAndSource(),cases=load('B-cases'),ap={sourceCases:cases.map(c=>c.sourceID),horizon:3,nodeBudget:5000,timeBudgetMs:1000,selectedHorizon:5,selectedNodeBudget:10000,note:'Retrospective diagnosis; finite-horizon non-win is not proof of safety forever.'},pp=`${dir}/B-analysis-plan.json`;
 if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),ap);else writeFileSync(pp,JSON.stringify(ap,null,2)+'\n');
 let rows=has('B-analysis')?load('B-analysis'):[],done=new Set(rows.map(r=>r.sourceID));
 for(const c of cases){if(done.has(c.sourceID))continue;
  const turns=c.census.map(t=>{
   const proof=prove(t.state,{horizon:ap.horizon,nodeBudget:ap.nodeBudget,timeBudgetMs:ap.timeBudgetMs,memoryBudgetMb:768}),chosen=apply(t.state,t.chosen),p=t.state.turn;
   return {ply:t.ply,proof,originalAction:t.chosen,avoidableImmediateLoss:t.avoidableImmediateLoss,ownImmediateCaptures:captureRoutes(t.state,p).size,opponentCapturesBefore:captureRoutes(t.state,1-p).size,opponentCapturesAfter:captureRoutes(chosen,1-p).size,safeActions:t.safe,legal:t.legal};
  });
  const depth5=prove(c.checkpoint.state,{horizon:ap.selectedHorizon,nodeBudget:ap.selectedNodeBudget,timeBudgetMs:ap.timeBudgetMs,memoryBudgetMb:768});
  rows.push({sourceID:c.sourceID,turns,selectedPly:c.pickedPly,selectedProof3:c.proof,selectedProof5:depth5,limits:['Failure to find a forced win within the horizon does not establish a game-theoretic draw','A forced-loss horizon identifies a locally lost state, not the earliest game-theoretic losing move']});save('B-analysis',rows);console.log('B horizon cases',rows.length);
 }
 assert.equal(rows.length,plan.B.ids.length);
}
export function extendBForks(){
 const {plan}=planAndSource(),cases=load('B-cases'),config={timeBudgetMs:5000,extraPlies:48,selected:cases.flatMap(c=>c.forks.filter(f=>f.game.state.winner===null).map(f=>f.forkID)),note:'Supplementary equal additional budget for every time-censored B fork; retains fork IDs, never counted as initial games.'},pp=`${dir}/B-extension-plan.json`;
 if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),config);else writeFileSync(pp,JSON.stringify(config,null,2)+'\n');
 let rows=has('B-extensions')?load('B-extensions'):[],done=new Set(rows.map(r=>r.forkID));
 for(const c of cases)for(const f of c.forks){if(f.game.state.winner!==null||done.has(f.forkID))continue;
  const g=advanceGame(f.game,{maxPlies:f.game.state.ply+config.extraPlies,timeBudgetMs:config.timeBudgetMs,memoryBudgetMb:768,select:(n,label,rng,seen,options)=>n.turn===c.loser?diagnosticMove(n,f.variant,rng,seen,{nodeBudget:plan.B.nodeBudget}).action:researchMove(n,f.game.research.policyByActor[n.turn],rng,seen,options)});
  verifyExtension(f.game,g);rows.push({forkID:f.forkID,sourceForkHash:sha(f.game),variant:f.variant,game:g});done.add(f.forkID);save('B-extensions',rows);console.log('B forks extended',rows.length);
 }
}
export function runBEarly(){
 const {source,plan}=planAndSource(),config={ids:plan.B.ids,variants:['archived','route'],atPly:1,timeBudgetMs:4000,extraPlies:128,extraBudgetMs:4000,note:'Supplementary earliest-response control, chosen before its outcomes. Existing route AI changes only the losing actor; forks are excluded from fairness ledgers.'},pp=`${dir}/B-early-plan.json`;
 if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),config);else writeFileSync(pp,JSON.stringify(config,null,2)+'\n');
 let rows=has('B-early')?load('B-early'):[],done=new Set(rows.map(r=>r.forkID));
 for(const id of config.ids){const g=source.find(g=>g.id===id),loser=1-g.state.winner,checkpoint=checkpointAt(g,1);assert.equal(checkpoint.state.turn,loser);
  for(const variant of config.variants){const forkID=sha(['early',id,variant]);if(done.has(forkID))continue;
   const select=(s,label,rng,seen,options)=>researchMove(s,s.turn===loser&&variant==='route'?'route':g.research.policyByActor[s.turn],rng,seen,options);
   let fork=advanceGame(checkpoint,{maxPlies:config.atPly+config.extraPlies,timeBudgetMs:config.timeBudgetMs,memoryBudgetMb:768,select});
   if(fork.state.winner===null)fork=advanceGame(fork,{maxPlies:config.atPly+config.extraPlies,timeBudgetMs:config.extraBudgetMs,memoryBudgetMb:768,select});
   rows.push({forkID,sourceID:id,sourceHash:sha(g),loser,seed:g.seed,variant,checkpointHash:checkpointFingerprint(checkpoint),checkpointHashSchema:'source-and-policy-state-v1',game:fork});done.add(forkID);save('B-early',rows);
  }console.log('B early',rows.length);
 }
}
export function verify(){
 const {source,plan}=planAndSource(),delta=load('continuations'),fresh=load('D-games'),cases=load('B-cases'),map=new Map(source.map(g=>[g.id,g]));
 assert.deepEqual(delta.map(g=>g.id).sort(),plan.continuation.ids);let added=0;
 for(const g of delta){const v=verifyExtension(map.get(g.id),g);added+=v.addedPlies;assert.equal(g.stages.at(-1).timeBudgetMs,plan.continuation.timeBudgetMs);}
 const record=recordBoard(toBoardState(RESEARCH_LAYOUTS.find(r=>r.id==='D')),{id:'D',name:'D'}),expected=researchPlans(record,{stage:'trajectory-followup-D',seeds:plan.D.seeds,pairs:plan.D.pairs}).filter(p=>p.pair[0]!==p.pair[1]||!p.aiSwap);assert.deepEqual(fresh.map(g=>g.id).sort(),expected.map(p=>p.id).sort());assert.equal(new Set([...source,...fresh].map(g=>g.id)).size,448);
 for(const g of fresh){const n=newResearchGame(expected.find(p=>p.id===g.id));for(const k of ['initial','research','experiment','seed','starter','policies'])assert.deepEqual(g[k],n[k]);replayDiagnosis(g,{independent:true});}
 assert.deepEqual(cases.map(c=>c.sourceID).sort(),plan.B.ids);let forkPlies=0;
 for(const c of cases){const old=map.get(c.sourceID);assert.equal(c.sourceHash,sha(old));const checkpoint=checkpointAt(old,c.pickedPly);for(const k of ['state','history','visits','rngStates'])assert.deepEqual(c.checkpoint[k],checkpoint[k]);
  for(const p of c.probes){const rng=randomStream(checkpoint.rngStates[c.loser]),seen=new Map(checkpoint.visits.map(([k,v])=>[k,v.count])),r=diagnosticMove(checkpoint.state,p.variant,rng,seen,{nodeBudget:plan.B.nodeBudget});assert.deepEqual(r.action,p.action);assert.equal(rng.state(),p.rngAfter);assert.deepEqual(immediateLossCensus(checkpoint.state,p.action),p.loss);if(p.forced.plies!==1)assert.deepEqual(auditFixedFirst(checkpoint.state,p.action),p.forced);else assert.equal(apply(checkpoint.state,p.action).winner,c.loser);}
  assert.deepEqual(c.forks.map(f=>f.variant),plan.B.variants);for(const f of c.forks){assert.equal(f.checkpointHash,sha(c.checkpoint));assert.deepEqual(f.game.history.slice(0,checkpoint.history.length),checkpoint.history);
   assert.deepEqual(f.game.history[checkpoint.history.length].a,c.probes.find(p=>p.variant===f.variant).action);if(f.variant==='archived'){assert.deepEqual(f.game.history,old.history);assert.deepEqual(f.game.state,old.state);}
replayDiagnosis(f.game,{independent:true});forkPlies+=f.game.history.length-checkpoint.history.length;}
 }
 const analyses=load('B-analysis');assert.deepEqual(analyses.map(a=>a.sourceID).sort(),plan.B.ids);
 for(const c of cases){const old=map.get(c.sourceID);let state=old.initial;
  for(let i=0;i<old.history.length;i++){if(state.turn===c.loser){const t=c.census.find(t=>t.ply===state.ply);assert.deepEqual(t.state,state);assert.deepEqual(t.chosen,old.history[i].a);const actual=immediateLossCensus(state,t.chosen);for(const k of Object.keys(actual))assert.deepEqual(t[k],actual[k]);}state=apply(state,old.history[i].a);}
  const a=analyses.find(a=>a.sourceID===c.sourceID);assert.equal(a.turns.length,c.census.length);
  if(a.selectedProof5.result!==null){const repeated=prove(checkpointAt(old,c.pickedPly).state,{horizon:5,nodeBudget:100000,timeBudgetMs:10000,memoryBudgetMb:768});assert.equal(repeated.result,a.selectedProof5.result);}

  for(const t of a.turns){const state=c.census.find(r=>r.ply===t.ply).state;if(t.proof.result===-1)assert.equal(immediateLossCensus(state,t.originalAction).safe,0);if(t.proof.result===1){const f=forcedThreeAction(state);assert.ok(f);if(f.plies===3)assert.equal(auditFixedFirst(state,f.action).forcedWithinThreeAfterThisAction,true);}}
 }
 const extensions=load('B-extensions'),extensionPlan=JSON.parse(readFileSync(`${dir}/B-extension-plan.json`));assert.deepEqual(extensions.map(e=>e.forkID).sort(),extensionPlan.selected.toSorted());let addedExtendedForkPlies=0;
 const extensionMap=new Map(extensions.map(e=>[e.forkID,e]));assert.equal(extensionMap.size,extensions.length);
 for(const c of cases)for(const f of c.forks){const e=extensionMap.get(f.forkID);if(e){assert.equal(e.sourceForkHash,sha(f.game));const v=verifyExtension(f.game,e.game);addedExtendedForkPlies+=v.addedPlies;assert.equal(e.game.stages.at(-1).timeBudgetMs,extensionPlan.timeBudgetMs);}}
 const finalFork=f=>extensionMap.get(f.forkID)?.game??f.game;
 const early=load('B-early');assert.equal(early.length,18);assert.equal(new Set(early.map(e=>e.forkID)).size,18);let earlyForkPlies=0;
 for(const e of early){const g=map.get(e.sourceID),cp=checkpointAt(g,1);assert.equal(e.sourceHash,sha(g));assert.equal(e.checkpointHash,checkpointFingerprint(cp));assert.equal(e.checkpointHashSchema,'source-and-policy-state-v1');assert.deepEqual(e.game.history.slice(0,cp.history.length),cp.history);if(e.variant==='archived'){assert.deepEqual(e.game.history,g.history);assert.deepEqual(e.game.state,g.state);}replayDiagnosis(e.game,{independent:true});earlyForkPlies+=e.game.history.length-cp.history.length;}
 
 const merged=mergeContinuation(source,delta),rows=[...'ABCDE'].map(mode=>{const gs=merged.games.filter(g=>g.experiment.boardId===mode),diagnoses=gs.map(g=>replayDiagnosis(g)),samples=diagnoses.flatMap(d=>d.snapshots);return {mode,closeFinishes:gs.filter(g=>g.state.winner!==null&&Math.abs(g.state.scores[0]-g.state.scores[1])===1).length,meanLegalActions:gs.reduce((n,g)=>n+g.history.reduce((m,h)=>m+h.legal,0),0)/Math.max(1,gs.reduce((n,g)=>n+g.history.length,0)),tacticalSamples:{positions:samples.length,multipleScoringDestinations:samples.filter(s=>s.scoringDestinations.length>=2).length,captureAndNonCapture:samples.filter(s=>s.scoringActions>0&&s.scoringActions<s.legal).length,meanUniqueNextStates:samples.reduce((n,s)=>n+s.uniqueNextStates,0)/samples.length},before:aggregateResearch(source.filter(g=>g.experiment.boardId===mode)),after:aggregateResearch(gs),diversity:audit(gs),byPair:Object.fromEntries([...new Set(gs.map(g=>g.experiment.pair.join('/')))].map(pair=>[pair,aggregateResearch(gs.filter(g=>g.experiment.pair.join('/')===pair))])),unresolved:gs.filter(g=>g.state.winner===null).map(g=>{const d=replayDiagnosis(g);return {id:g.id,ply:d.plies,quiet:d.quiet,longestQuiet:d.longestQuiet,repeatedStates:d.duplicateStates,legal:d.snapshots.at(-1).legal,scoreDelta:g.state.scores.map((v,p)=>v-map.get(g.id).state.scores[p])};})};});
 const dGroups=gs=>({pairs:positionPairs(gs),metrics:aggregateResearch(gs),diversity:audit(gs)});
 const summary={sourceHash:sha(source),sourceGames:400,uniqueGamesAfter:400+fresh.length,newInitialGames:fresh.length,continued:delta.length,newlySettled:merged.newlySettled,addedContinuationPlies:added,BcaseCount:cases.length,BforkCount:cases.reduce((n,c)=>n+c.forks.length,0),addedForkPlies:forkPlies,extendedBforks:extensions.length,addedExtendedForkPlies,earlyForkPlies,earlyBforkCount:early.length,Bearly:['archived','route'].map(variant=>{const es=early.filter(e=>e.variant===variant);return {variant,forks:es.length,wins:es.filter(e=>e.game.state.winner===e.loser).length,losses:es.filter(e=>e.game.state.winner===1-e.loser).length,unresolved:es.filter(e=>e.game.state.winner===null).length};}),rows,D:{original:dGroups(merged.games.filter(g=>g.experiment.boardId==='D')),holdout:dGroups(fresh),byPair:Object.fromEntries(plan.D.pairs.map(p=>[p.join('/'),dGroups(fresh.filter(g=>g.experiment.pair.join('/')===p.join('/')))]))},B:plan.B.variants.map(variant=>({variant,splits:['discovery','heldout'].map(split=>{const cs=cases.filter(c=>c.split===split),fs=cs.map(c=>({c,f:{game:finalFork(c.forks.find(f=>f.variant===variant))}}));return {split,cases:cs.length,safeSelected:cs.filter(c=>!c.probes.find(p=>p.variant===variant).loss.selectedAllowsImmediateLoss).length,forcedThree:cs.filter(c=>c.probes.find(p=>p.variant===variant).forced.forcedWithinThreeAfterThisAction).length,wins:fs.filter(({c,f})=>f.game.state.winner===c.loser).length,losses:fs.filter(({c,f})=>f.game.state.winner===1-c.loser).length,unresolved:fs.filter(({f})=>f.game.state.winner===null).length};})})),limits:['Selected original losing cases; forks do not estimate game fairness','Finite proof horizon is not an official draw','Time limits vary by environment; traces are the reproducible evidence','D holdout has a separate budget; do not combine with old win rates','Heuristic depth/beam completion is not exhaustive game-theoretic proof','No official layout, rule, or CPU changes']};
 writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');writeFileSync(`${dir}/verification.json`,JSON.stringify({sourceHash:sha(source),continued:delta.length,newInitialGames:fresh.length,addedContinuationPlies:added,verifiedNewPlies:fresh.reduce((n,g)=>n+g.history.length,0),addedForkPlies:forkPlies,extendedBforks:extensions.length,addedExtendedForkPlies,earlyBforkCount:early.length,earlyForkPlies,sourceIDsPreserved:true,sourceRNGReplayed:true},null,2)+'\n');console.log(JSON.stringify({continued:summary.continued,settled:summary.newlySettled,new:summary.newInitialGames,B:summary.B,rows:rows.map(r=>({mode:r.mode,first:r.after.first,second:r.after.second,u:r.after.unresolved}))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const flag=process.argv[2];if(flag==='--continue')runContinuations();else if(flag==='--B')runB();else if(flag==='--D')runD();else if(flag==='--B-audit')analyseB();else if(flag==='--B-extend')extendBForks();else if(flag==='--B-early')runBEarly();else if(flag==='--verify')verify();else {runContinuations();runB();analyseB();extendBForks();runBEarly();runD();verify();}}

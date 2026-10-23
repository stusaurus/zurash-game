// Research follow-up: longer training, frozen families and fresh holdout seeds.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {apply,successors,key} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
import {recordBoard,validateBoard,definitionKey} from '../src/board-lab.js';
import {discoveryID,verifyExperiment} from './board-discovery.js';
import {prove} from './tactics-proof.js';
import {referenceChildren,researchPlans,newResearchGame,advanceResearch,aggregateResearch,mergeContinuation,settlementComparison,holm,sha,researchMove} from './stall-research.js';
import {randomStream,advanceGame} from './tactics-completion.js';
import {verifyExtension} from './mode-continuation.js';
import {completionSummary} from './tactics-completion-statistics.js';
import {replayDiagnosis} from './b-settlement-study.js';
export function positionChildren(parent){
 return [[0,80],[18,62],[36,44],[54,26]].map(players=>{
  const b={...parent.board,players},v=validateBoard(b);assert.ok(v.ok);return recordBoard(v.state,{id:discoveryID(v.state),parent:parent.id,name:'B位置研究・'+players.join('-'),shape:parent.shape,change:{kind:'players',from:parent.board.players,to:players},algorithm:'B-position-followup-1'});
 });
}
// Exact response census for a FIXED cooperative three-ply line. Not a proof that
// every other root action is refuted, nor that the defender can avoid defeat forever.
export function auditCooperativeLine(state,actions){
 assert.equal(actions.length,3);const root=state.turn,first=referenceChildren(state).find(c=>JSON.stringify(c.a)===JSON.stringify(actions[0]));assert.ok(first);assert.equal(first.n.winner,null);
 let witness=state;for(const a of actions)witness=apply(witness,a);assert.equal(witness.winner,root,'Line must end in root victory');
 return auditFixedFirst(state,actions[0]);
}
export function auditFixedFirst(state,action){
 const root=state.turn,first=referenceChildren(state).find(c=>JSON.stringify(c.a)===JSON.stringify(action));assert.ok(first);assert.equal(first.n.winner,null);
 const replies=referenceChildren(first.n),rows=replies.map(c=>{
  const wins=referenceChildren(c.n).filter(r=>r.n.winner===root);
  return {action:c.a,state:c.n,rootWinningResponses:wins.length,winningResponse:wins[0]?.a??null};
 });
 const prevented=rows.filter(r=>!r.rootWinningResponses),forced=replies.length>0&&!prevented.length;
 return {root,firstAction:action,replies:rows.length,allowImmediateRootWin:rows.length-prevented.length,preventImmediateRootWin:prevented.length,forcedWithinThreeAfterThisAction:forced,exampleCounter:prevented[0]??null,rows,limits:['Complete legal opponent replies to this fixed first action','A counter only prevents the next-turn victory, not all future victories','An alternative first move may still force victory']};
}
export function threePlyCertificate(state){
 const start=performance.now();let tested=0;
 for(const c of referenceChildren(state)){
  if(performance.now()-start>5000)return {status:'unknown',tested};
  if(c.n.winner!==null)continue;const root=state.turn,replies=referenceChildren(c.n);let valid=replies.length>0;
  for(const reply of replies)if(!referenceChildren(reply.n).some(n=>n.n.winner===root)){valid=false;break;}
  tested++;if(valid)return {status:'independent-forced-three',tested,certificate:auditFixedFirst(state,c.a)};
 }
 return {status:'no-three-ply-certificate-found',tested};
}
export function forkWithFirstAction(source,firstAction,{extraPlies=128,timeBudgetMs=1000}={}){
 const at=source.state.ply;
 return advanceGame(source,{maxPlies:at+extraPlies,timeBudgetMs,memoryBudgetMb:640,select:(s,_policy,rng,seen,children)=>{
  // Consume the ordinary policy RNG in both forks; override ONLY the first action.
  const ordinary=researchMove(s,source.research.policyByActor[s.turn],rng,seen,children);
  return s.ply===at&&firstAction?firstAction:ordinary;
 }});
}
export function orderingDiagnostic(state,rngState,visits,action){
 const rng=randomStream(rngState),seen=new Map(visits.map(([k,v])=>[k,v.count]));
 const ranked=successors(state).map(c=>({...c,value:evaluate(c.n,state.turn)-(seen.get(key(c.n))??0)*130,tie:rng()})).sort((a,b)=>b.value-a.value||a.tie-b.tie);
 const rank=ranked.findIndex(c=>JSON.stringify(c.a)===JSON.stringify(action))+1;assert.ok(rank>0);
 return {rootActions:ranked.length,uniqueOrderingValues:[...new Set(ranked.map(c=>c.value))],certificateRank1Based:rank,beam:8,certificateExcludedFromSearchBeam:rank>8,limits:['Ordering diagnostic of the archived search family, not all route heuristics','Other forced-winning actions may exist']};
}
export function chooseFamilies(rows,metrics){
 const rank=rs=>rs.sort((a,b)=>metrics.get(a.id).unresolvedRate-metrics.get(b.id).unresolvedRate||Math.max(metrics.get(a.id).firstBias,metrics.get(a.id).positionBias)-Math.max(metrics.get(b.id).firstBias,metrics.get(b.id).positionBias)||a.id.localeCompare(b.id));
 const wall=rank(rows.filter(r=>r.change?.kind==='walls'))[0],position=rank(rows.filter(r=>r.change?.kind==='players'))[0];assert.ok(wall&&position);return [wall.id,position.id];
}
const dir=process.env.B_FOLLOWUP_REPORT??'reports/b-followup-2026-10-23',base='reports/b-settlement-2026-10-23';
const read=(d,n)=>JSON.parse(gunzipSync(readFileSync(`${d}/${n}.json.gz`)));
const save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);};
const sourceTraining=()=>read(base,'games').filter(g=>g.experiment.stage==='B-settlement-train');
function summaries(records,games,stage){return records.map(r=>{const gs=games.filter(g=>g.experiment.boardId===r.id&&g.experiment.stage===stage);return {id:r.id,name:r.name,metrics:aggregateResearch(gs),conservative:completionSummary(gs.map(g=>({...g,cluster:g.experiment.cluster}))),byPair:Object.fromEntries([...new Set(gs.map(g=>g.research.labels.join('/')))].map(pair=>[pair,aggregateResearch(gs.filter(g=>g.research.labels.join('/')===pair))]))};});}
export function run(){
 mkdirSync(dir,{recursive:true});const original=read(base,'roster').rows,parent=original[0],positions=positionChildren(parent),roster=[...original,...positions],source=sourceTraining();save('roster',roster);
 const plan={version:1,sourceCommit:'0325a1ddcfeaff6d5085ad729ca6a5fc1948485b',sourceHash:sha(source),sourceGames:source.length,sourceIDs:source.filter(g=>g.state.winner===null).map(g=>g.id),rosterHash:sha(roster),continuation:{timeBudgetMs:500,extraPlies:2048},positionTrain:{seeds:[2301001,2301019],timeBudgetMs:660,maxPlies:2560},selection:'One wall-removal and one position-only child; rank by settlement then worst turn/slot bias then ID. Target2 and previously rejected 8x8 not eligible. Freeze before holdout.',holdout:{seeds:[2310001,2310019,2310033,2310051,2310073,2310087,2310103,2310129],timeBudgetMs:1500,maxPlies:4096},policy:{seeds:[2320001,2320019],pairs:[['star','positional'],['mixed','defensive']],timeBudgetMs:700,maxPlies:2048},rules:'unchanged; no draw or official turn limit; soft computation budgets'};
 const pp=`${dir}/plan.json`;if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),plan);else writeFileSync(pp,JSON.stringify(plan,null,2)+'\n');
 let delta=existsSync(`${dir}/delta.json.gz`)?read(dir,'delta'):[],games=existsSync(`${dir}/games.json.gz`)?read(dir,'games'):[],audit=existsSync(`${dir}/audit.json.gz`)?read(dir,'audit'):[];const done=new Set(delta.map(g=>g.id)),bySource=new Map(source.map(g=>[g.id,g])),ids=new Set(games.map(g=>g.id));assert.equal(done.size,delta.length);assert.equal(ids.size,games.length);
 for(const id of plan.sourceIDs){if(done.has(id))continue;const g=bySource.get(id),n=advanceResearch(g,{timeBudgetMs:plan.continuation.timeBudgetMs,maxPlies:g.state.ply+plan.continuation.extraPlies,memoryBudgetMb:640});audit.push(verifyExtension(g,n));delta.push(n);done.add(id);if(delta.length%8===0){save('delta',delta);save('audit',audit);console.log('continued',delta.length);}}save('delta',delta);save('audit',audit);
 const play=(records,stage,config,pairs)=>{for(const r of records)for(const p of researchPlans(r,{stage,seeds:config.seeds,pairs})){if(ids.has(p.id))continue;const g=advanceResearch(newResearchGame(p),{timeBudgetMs:config.timeBudgetMs,maxPlies:config.maxPlies,memoryBudgetMb:640});verifyExperiment(g);games.push(g);ids.add(g.id);if(games.length%8===0){save('games',games);console.log(stage,games.length);}}save('games',games);};
 play(positions,'B-position-training',plan.positionTrain,[['search','route']]);
 const extended=mergeContinuation(source,delta),training=roster.map(r=>({id:r.id,metrics:aggregateResearch([...extended.games,...games.filter(g=>g.experiment.stage==='B-position-training')].filter(g=>g.experiment.boardId===r.id))})),chosen=chooseFamilies(roster,new Map(training.map(r=>[r.id,r.metrics]))),frozen={ids:chosen,training,selection:plan.selection};
 if(existsSync(`${dir}/frozen.json.gz`))assert.deepEqual(read(dir,'frozen'),frozen);else save('frozen',frozen);
 const held=[parent,...chosen.map(id=>roster.find(r=>r.id===id))];play(held,'B-followup-independent',plan.holdout,[['search','route']]);play(held,'B-followup-policy',plan.policy,plan.policy.pairs);
 const rows=summaries(held,games,'B-followup-independent'),comparisons=chosen.map(id=>({id,...settlementComparison(games.filter(g=>g.experiment.boardId===parent.id&&g.experiment.stage==='B-followup-independent'),games.filter(g=>g.experiment.boardId===id&&g.experiment.stage==='B-followup-independent'))}));const adjusted=holm(comparisons.map(c=>c.oneSidedSeedSignFlipP??1));comparisons.forEach((c,i)=>c.holmP=adjusted[i]);
 const result={newUniqueGames:games.length,continued:delta.length,newGamesFromContinuation:0,newlySettled:extended.newlySettled,addedPlies:extended.addedPlies,training,holdout:rows,policy:summaries(held,games,'B-followup-policy'),comparisons,decision:'Research only; no promotion. Human enjoyment and optimal-play fairness unproved.'};save('summary',result);
 const catalogue=new Map(read(base,'catalogue').map(r=>[r.id,{...r,warnings:['前段：700ms/2,048手の独立比較。今回の1,500ms比較とは別予算。',...r.warnings]}]));
 for(const r of held){const m=rows.find(x=>x.id===r.id).metrics;catalogue.set(r.id,{...r,status:'AI検証中',games:m.games,unresolvedRate:m.unresolvedRate,metrics:{...m,stages:{holdout:m}},traits:[],warnings:['今回：1,500ms/4,096手。長めの訓練後、未使用8seed・同一予算で比較。研究用・未認定。人間の時間・楽しさは未測定。']});}save('catalogue',[...catalogue.values()]);
 // Same saved B checkpoints: finite-horizon proof and independent counter replies.
 const diagnostics=read(base,'source-diagnosis'),witnesses=read(base,'capture-witnesses');
 if(!existsSync(`${dir}/tactics.json.gz`)){
  const tactics=witnesses.filter(r=>r.witnesses.some(w=>w.actions?.length===3&&w.actor===w.state.winner)).map(row=>{
   const s=diagnostics.find(d=>d.id===row.id).snapshots.at(-1).state;
   const lines=row.witnesses.filter(w=>w.actions?.length===3&&w.actor===s.turn).map(w=>auditCooperativeLine(s,w.actions));
   return {id:row.id,state:s,lines,proof3:prove(s,{horizon:3,nodeBudget:10000,timeBudgetMs:1000,memoryBudgetMb:640}),proof5:prove(s,{horizon:5,nodeBudget:20000,timeBudgetMs:1500,memoryBudgetMb:640})};
  });save('tactics',tactics);
 }
 if(!existsSync(`${dir}/forced-certificates.json.gz`)){
  const full=mergeContinuation(read('reports/stall-2026-10-23','games'),read('reports/mode-continuation-2026-10-23','delta')).games;
  const forced=read(dir,'tactics').filter(t=>t.proof3.result===1).map(t=>{
   const g=full.find(g=>g.id===t.id);assert.deepEqual(t.state,g.state);const independent=threePlyCertificate(t.state);assert.equal(independent.status,'independent-forced-three');
   const children=successors(t.state),seen=new Map(g.visits.map(([k,v])=>[k,v.count]));
   const probes=['search','route','deeper','repeat','score','mixed','defensive','star','positional'].map(label=>{const rng=randomStream(g.rngStates[g.state.turn]),action=researchMove(t.state,label,rng,seen,children);return {label,action,rngAfter:rng.state(),audit:auditFixedFirst(t.state,action)};});
   const forks=[['ordinary',null],['certified-first-only',independent.certificate.firstAction]].map(([kind,firstAction])=>({kind,sourceID:g.id,sourceHash:sha(g),sourceRNG:g.rngStates,firstAction,game:forkWithFirstAction(g,firstAction),limits:['Counterfactual fork of one saved checkpoint, not a new game from initial board','Not merged into original ledger or standard fairness results','Only first move intervened; later ordinary policies unchanged']}));
   return {id:t.id,state:t.state,sourceHash:sha(g),sourceRNG:g.rngStates,sourceVisits:g.visits,independent,probes,forks};
  });save('forced-certificates',forced);
 }
 const forced=read(dir,'forced-certificates');if(forced.some(r=>!r.ordering)){for(const r of forced)r.ordering=orderingDiagnostic(r.state,r.sourceRNG[r.state.turn],r.sourceVisits,r.independent.certificate.firstAction);save('forced-certificates',forced);}
 console.log({continued:delta.length,newlySettled:extended.newlySettled,newUniqueGames:games.length,holdout:rows.map(r=>({id:r.id,first:r.metrics.first,second:r.metrics.second,u:r.metrics.unresolved}))});
}
export function verifySaved(){
 const plan=JSON.parse(readFileSync(`${dir}/plan.json`)),source=sourceTraining(),roster=read(dir,'roster'),delta=read(dir,'delta'),audit=read(dir,'audit'),games=read(dir,'games'),summary=read(dir,'summary'),frozen=read(dir,'frozen');assert.equal(sha(source),plan.sourceHash);assert.equal(sha(roster),plan.rosterHash);assert.equal(new Set(delta.map(g=>g.id)).size,delta.length);assert.equal(new Set(games.map(g=>g.id)).size,games.length);assert.deepEqual([...plan.sourceIDs].sort(),delta.map(g=>g.id).sort());
 const map=new Map(source.map(g=>[g.id,g]));assert.deepEqual(delta.map(g=>verifyExtension(map.get(g.id),g)),audit);const merged=mergeContinuation(source,delta);assert.equal(summary.newGamesFromContinuation,0);assert.equal(summary.newlySettled,merged.newlySettled);assert.equal(summary.addedPlies,merged.addedPlies);
 let newPlies=0;for(const g of games){replayDiagnosis(g,{independent:true});newPlies+=g.history.length;}
 assert.equal(summary.newUniqueGames,games.length);assert.equal(summary.continued,delta.length);
 const held=[roster[0],...frozen.ids.map(id=>roster.find(r=>r.id===id))];assert.deepEqual(summary.holdout,summaries(held,games,'B-followup-independent'));assert.deepEqual(summary.policy,summaries(held,games,'B-followup-policy'));
 const positions=roster.filter(r=>r.change?.kind==='players'),expected=[...positions.flatMap(r=>researchPlans(r,{stage:'B-position-training',seeds:plan.positionTrain.seeds,pairs:[['search','route']]})),...held.flatMap(r=>researchPlans(r,{stage:'B-followup-independent',seeds:plan.holdout.seeds,pairs:[['search','route']]})),...held.flatMap(r=>researchPlans(r,{stage:'B-followup-policy',seeds:plan.policy.seeds,pairs:plan.policy.pairs}))];assert.deepEqual(expected.map(p=>p.id).sort(),games.map(g=>g.id).sort());const plans=new Map(expected.map(p=>[p.id,p]));for(const g of games){const n=newResearchGame(plans.get(g.id));for(const f of ['initial','research','experiment','policies','starter','seed'])assert.deepEqual(g[f],n[f]);}
 const training=roster.map(r=>({id:r.id,metrics:aggregateResearch([...merged.games,...games.filter(g=>g.experiment.stage==='B-position-training')].filter(g=>g.experiment.boardId===r.id))}));assert.deepEqual(frozen.training,training);assert.deepEqual(frozen.ids,chooseFamilies(roster,new Map(training.map(r=>[r.id,r.metrics]))));
 for(const r of summary.comparisons){const c=settlementComparison(games.filter(g=>g.experiment.boardId===roster[0].id&&g.experiment.stage==='B-followup-independent'),games.filter(g=>g.experiment.boardId===r.id&&g.experiment.stage==='B-followup-independent'));for(const k of Object.keys(c))assert.deepEqual(r[k],c[k]);}
 const old=read(base,'catalogue'),starSummary=existsSync(`${dir}/star-summary.json.gz`)?read(dir,'star-summary'):null;
 for(const r of read(dir,'catalogue')){const h=held.find(h=>h.id===r.id);assert.equal(r.status,'AI検証中');if(h){assert.deepEqual(r.board,h.board);assert.deepEqual(r.metrics.stages.holdout,summary.holdout.find(h=>h.id===r.id).metrics);}else if(starSummary&&(r.id==='mode-B-stars-control'||starSummary.rows.some(x=>x.id===r.id))){const row=starSummary.rows.find(x=>x.id===(r.id==='mode-B-stars-control'?'mode-B':r.id));assert.ok(row);assert.deepEqual(r.board,roster.find(x=>x.id===row.id).board);assert.deepEqual(r.metrics.stages.holdout,row.metrics);}else{const previous=old.find(x=>x.id===r.id);assert.ok(previous);assert.deepEqual(r.board,previous.board);assert.deepEqual(r.metrics,previous.metrics);}}
 for(const r of read(dir,'tactics'))for(const line of r.lines){const cs=referenceChildren(r.state),first=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(line.firstAction));assert.ok(first);const replies=referenceChildren(first.n);assert.equal(replies.length,line.replies);for(let i=0;i<replies.length;i++){assert.deepEqual(line.rows[i].action,replies[i].a);assert.deepEqual(line.rows[i].state,replies[i].n);assert.equal(line.rows[i].rootWinningResponses,referenceChildren(replies[i].n).filter(c=>c.n.winner===r.state.turn).length);}}
 const full=mergeContinuation(read('reports/stall-2026-10-23','games'),read('reports/mode-continuation-2026-10-23','delta')).games;
 for(const r of read(dir,'forced-certificates')){
  const g=full.find(g=>g.id===r.id);assert.equal(r.sourceHash,sha(g));assert.deepEqual(r.state,g.state);assert.deepEqual(r.sourceRNG,g.rngStates);assert.deepEqual(r.sourceVisits,g.visits);
  assert.deepEqual(r.independent.certificate,auditFixedFirst(r.state,r.independent.certificate.firstAction));assert.equal(r.independent.certificate.forcedWithinThreeAfterThisAction,true);
  assert.deepEqual(r.ordering,orderingDiagnostic(r.state,r.sourceRNG[r.state.turn],r.sourceVisits,r.independent.certificate.firstAction));
  const seen=new Map(g.visits.map(([k,v])=>[k,v.count]));for(const p of r.probes){const rng=randomStream(g.rngStates[g.state.turn]);assert.deepEqual(p.action,researchMove(g.state,p.label,rng,seen,successors(g.state)));assert.equal(p.rngAfter,rng.state());assert.deepEqual(p.audit,auditFixedFirst(g.state,p.action));}
  for(const fork of r.forks){assert.equal(fork.sourceHash,sha(g));assert.deepEqual(fork.game.history.slice(0,g.history.length),g.history);replayDiagnosis(fork.game,{independent:true});if(fork.kind==='certified-first-only'){assert.deepEqual(fork.game.history[g.history.length].a,r.independent.certificate.firstAction);assert.equal(fork.game.state.winner,g.state.turn);assert.ok(fork.game.state.ply<=g.state.ply+3);}}
 }
 const result={newUniqueGames:games.length,continued:delta.length,newlySettled:merged.newlySettled,newGamesFromContinuation:0,verifiedNewPlies:newPlies,verifiedAddedPlies:merged.addedPlies,sourceHash:sha(source),gamesHash:sha(games),deltaHash:sha(delta),allLegal:true};writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--verify'))verifySaved();else run();}

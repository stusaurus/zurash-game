// One frozen continuation pass: original IDs, policies, RNG and rules are retained.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {referenceChildren,mergeContinuation,advanceResearch,aggregateResearch,settlementComparison,holm,sha} from './stall-research.js';
import {verifyExperiment} from './board-discovery.js';
import {completionSummary} from './tactics-completion-statistics.js';
export const MODE_IDS=['mode-Sprint','mode-A','mode-B','mode-C','mode-D','mode-E'];
export function continuationPlan(source){
 const seen=new Set();for(const g of source){if(seen.has(g.id))throw Error('Duplicate source game');seen.add(g.id);}
 const selected=source.filter(g=>MODE_IDS.includes(g.experiment.boardId)&&g.experiment.stage==='stall-holdout'&&g.state.winner===null);
 selected.sort((a,b)=>Number(b.experiment.boardId==='mode-E')-Number(a.experiment.boardId==='mode-E')||a.experiment.condition.localeCompare(b.experiment.condition)||a.experiment.boardId.localeCompare(b.experiment.boardId));
 return {version:1,sourceHash:sha(source),sourceGames:source.length,selectedIDs:selected.map(g=>g.id),modeIDs:MODE_IDS,perGameMs:2000,extraPlies:4096,rule:'unchanged; budget stops and repetitions are unresolved',newGames:0};
}
export function verifyExtension(before,after){
 assert.deepEqual(after.research,before.research,'Research policy changed');
 const merged=mergeContinuation([before],[after]);assert.equal(merged.newGames,0);verifyExperiment(after);
 let s=before.state,addedCaptures=0,addedWalls=0;
 for(const h of after.history.slice(before.history.length)){
  const cs=referenceChildren(s),c=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(h.a));assert.ok(c,'Independent illegal added action');
  assert.equal(h.legal,cs.length);assert.equal(h.from,s.players[s.turn]);assert.equal(h.gain,c.n.scores[s.turn]>s.scores[s.turn]);assert.equal(h.canScore,cs.some(c=>c.n.scores[s.turn]>s.scores[s.turn]));assert.equal(h.canWin,cs.some(c=>c.n.winner===s.turn));
  if(h.gain)addedCaptures++;if(h.a.wall){addedWalls++;assert.equal(h.wallFrom,s.walls[h.a.wall.wall]);}s=c.n;
 }
 assert.deepEqual(s,after.state);assert.equal(after.metrics.wallMoves-before.metrics.wallMoves,addedWalls);assert.equal(after.metrics.scorePlies.length-before.metrics.scorePlies.length,addedCaptures);
 return {id:before.id,boardId:before.experiment.boardId,beforePrefixSHA256:sha(before.history),beforeRNG:before.rngStates,afterRNG:after.rngStates,beforePlies:before.history.length,afterPlies:after.history.length,addedPlies:after.history.length-before.history.length,beforeScores:before.state.scores,afterScores:after.state.scores,addedCaptures,settled:after.state.winner!==null,beforeReason:before.reason,afterReason:after.reason};
}
export function modeResults(source,delta){
 if(new Set(delta.map(g=>g.id)).size!==delta.length)throw Error('Duplicate continuation IDs');
 const merged=mergeContinuation(source,delta),rows=MODE_IDS.map(id=>{
  const before=source.filter(g=>g.experiment.boardId===id),after=merged.games.filter(g=>g.experiment.boardId===id),statistics=aggregateResearch(after),comparison=settlementComparison(before,after),extra=delta.filter(g=>g.experiment.boardId===id);
  const behavior=gs=>({stopReasons:Object.fromEntries([...new Set(gs.map(g=>g.reason))].map(reason=>[reason,gs.filter(g=>g.reason===reason).length])),quietRepeatedUnresolved:gs.filter(g=>g.state.winner===null&&g.repetitionCount>0&&g.metrics.quiet>=30).length,maxScorelessPlies:Math.max(0,...gs.map(g=>Math.max(g.metrics.quiet,g.metrics.longestQuiet))),byPair:Object.fromEntries([...new Set(gs.map(g=>g.research.labels.join('/')))].map(pair=>[pair,aggregateResearch(gs.filter(g=>g.research.labels.join('/')===pair))]))});
  return {id,before:aggregateResearch(before),after:statistics,continued:extra.length,newlySettled:extra.filter(g=>g.state.winner!==null).length,comparison,beforeBehavior:behavior(before),afterBehavior:behavior(after),conservative:completionSummary(after.map(g=>({...g,cluster:g.experiment.cluster})))};
 });
 const adjusted=holm(rows.map(r=>r.comparison.oneSidedSeedSignFlipP??1));rows.forEach((r,i)=>r.comparison.holmSettlementP=adjusted[i]);
 return {sourceUniqueGames:source.length,uniqueGamesAfter:merged.games.length,newGames:0,continued:merged.continued,newlySettled:merged.newlySettled,addedPlies:merged.addedPlies,rows};
}
export function run(){
 const base='reports/stall-2026-10-23',dir=process.env.MODE_CONTINUE_REPORT??'reports/mode-continuation-2026-10-23',read=(d,n)=>JSON.parse(gunzipSync(readFileSync(`${d}/${n}.json.gz`)));
 mkdirSync(dir,{recursive:true});const save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);},source=read(base,'games'),sourceByID=new Map(source.map(g=>[g.id,g])),plan=continuationPlan(source);
 if(existsSync(`${dir}/plan.json`))assert.deepEqual(JSON.parse(readFileSync(`${dir}/plan.json`)),plan);else writeFileSync(`${dir}/plan.json`,JSON.stringify(plan,null,2)+'\n');
 let delta=existsSync(`${dir}/delta.json.gz`)?read(dir,'delta'):[],audit=[];
 for(const g of delta){assert.ok(plan.selectedIDs.includes(g.id));audit.push(verifyExtension(sourceByID.get(g.id),g));}
 assert.equal(new Set(delta.map(g=>g.id)).size,delta.length);const done=new Set(delta.map(g=>g.id)),budget=Number(process.env.MODE_CONTINUE_MS??480000),start=performance.now();
 if(!Number.isInteger(budget)||budget<1000||budget>1200000)throw Error('Invalid continuation budget');
 for(const id of plan.selectedIDs){
  if(done.has(id))continue;if(performance.now()-start>budget)break;const g=sourceByID.get(id);
  const n=advanceResearch(g,{maxPlies:Math.min(100000,g.state.ply+plan.extraPlies),timeBudgetMs:plan.perGameMs,memoryBudgetMb:640});
  audit.push(verifyExtension(g,n));delta.push(n);done.add(id);
  save('delta',delta);save('audit',audit);if(delta.length%8===0)console.log({continued:delta.length,settled:audit.filter(a=>a.settled).length,lastBoard:g.experiment.boardId});
 }
 const result={...modeResults(source,delta),complete:done.size===plan.selectedIDs.length,plannedContinuations:plan.selectedIDs.length,sourceFileSHA256:sha(readFileSync(`${base}/games.json.gz`)),deltaFileSHA256:sha(gzipSync(JSON.stringify(delta))),elapsedMs:performance.now()-start};
 save('delta',delta);save('audit',audit);writeFileSync(`${dir}/summary.json`,JSON.stringify(result,null,2)+'\n');
 const old=read(base,'catalogue'),results=new Map(result.rows.map(r=>[r.id,r])),catalogue=old.map(r=>{
  const row=results.get(r.id);if(!row)return r;const m=row.after;return {...r,metrics:{...m,stages:{holdout:m},continuation:{continued:row.continued,newlySettled:row.newlySettled,perGameMs:plan.perGameMs,extraPlies:plan.extraPlies}},warnings:[`元の64局を継続。追加${plan.perGameMs}ms／${plan.extraPlies}手の研究予算。新規対局0。他の形状候補とは追加予算が異なります。`,'研究用・未認定。人間の所要時間・楽しさは未測定。'],games:m.games,unresolvedRate:m.unresolvedRate};
 });save('catalogue',catalogue);
 const verification={sourceGames:source.length,continued:delta.length,verifiedAddedPlies:audit.reduce((n,a)=>n+a.addedPlies,0),newGames:0,sourceHash:sha(source),deltaHash:sha(delta),sourceRNGAndPolicyPreserved:true};writeFileSync(`${dir}/verification.json`,JSON.stringify(verification,null,2)+'\n');
 console.log({complete:result.complete,continued:result.continued,settled:result.newlySettled,newGames:0,rows:result.rows.map(r=>({id:r.id,first:r.after.first,second:r.after.second,unresolved:r.after.unresolved}))});
}
export function verifySaved(){
 const base='reports/stall-2026-10-23',dir=process.env.MODE_CONTINUE_REPORT??'reports/mode-continuation-2026-10-23',read=(d,n)=>JSON.parse(gunzipSync(readFileSync(`${d}/${n}.json.gz`)));
 const source=read(base,'games'),delta=read(dir,'delta'),sourceByID=new Map(source.map(g=>[g.id,g])),plan=continuationPlan(source),savedPlan=JSON.parse(readFileSync(`${dir}/plan.json`));assert.deepEqual(savedPlan,plan);
 const audit=delta.map(g=>{assert.ok(plan.selectedIDs.includes(g.id));return verifyExtension(sourceByID.get(g.id),g);});assert.deepEqual(audit,read(dir,'audit'));
 const s=JSON.parse(readFileSync(`${dir}/summary.json`)),actual=modeResults(source,delta);for(const k of Object.keys(actual))assert.deepEqual(s[k],actual[k],k);assert.equal(s.complete,delta.length===plan.selectedIDs.length);assert.equal(s.sourceFileSHA256,sha(readFileSync(`${base}/games.json.gz`)));assert.equal(s.deltaFileSHA256,sha(readFileSync(`${dir}/delta.json.gz`)));
 const old=read(base,'catalogue'),catalogue=read(dir,'catalogue');assert.equal(old.length,catalogue.length);
 for(const r of catalogue){const original=old.find(x=>x.id===r.id);assert.ok(original);assert.deepEqual(r.board,original.board);if(!MODE_IDS.includes(r.id))assert.deepEqual(r,original);else{const row=actual.rows.find(x=>x.id===r.id);assert.deepEqual(r.metrics.stages.holdout,row.after);assert.equal(r.metrics.continuation.newlySettled,row.newlySettled);}}
 const verification={sourceGames:source.length,continued:delta.length,verifiedAddedPlies:audit.reduce((n,a)=>n+a.addedPlies,0),newGames:0,sourceHash:sha(source),deltaHash:sha(delta),sourceRNGAndPolicyPreserved:true,summaryAndCatalogueMatched:true,hashes:Object.fromEntries(['delta','audit','catalogue'].map(n=>[n,sha(readFileSync(`${dir}/${n}.json.gz`))]))};writeFileSync(`${dir}/verification.json`,JSON.stringify(verification,null,2)+'\n');console.log(verification);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--verify'))verifySaved();else run();}

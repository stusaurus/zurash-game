import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {initial} from '../src/engine.js';
import {toBoardState} from '../src/geometry.js';
import {recordBoard,definitionKey} from '../src/board-lab.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {uniqueGames,basicFeatures} from './board-discovery.js';
import {aggregateResearch as aggregate,sha,reachableGraph,minimalVariants,researchPlans,newResearchGame,advanceResearch,mergeContinuation,settlementComparison,holm} from './stall-research.js';
const dir=process.env.STALL_REPORT??'reports/stall-2026-10-23',base='reports/discovery-2026-10-22';
mkdirSync(dir,{recursive:true});
const read=(d,n)=>JSON.parse(gunzipSync(readFileSync(`${d}/${n}.json.gz`))),save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);},json=(n,x)=>{writeFileSync(`${dir}/${n}.json`,JSON.stringify(x,null,2)+'\n');};
const catalogue=read(base,'catalogue'),original=[...read(base,'games'),...read(base,'position-games')];
const ids=['z-55f2fedf','d-40d94fcdb64db85ae957dd95','z-affd4d6e'],targets=ids.map(id=>catalogue.find(r=>r.id===id));
if(process.env.STALL_IMPORT){
 const d=process.env.STALL_IMPORT,full=[...read(d,'games'),...read(d,'position-games')];if(full.length!==original.length)throw Error('Partial source ledger');
 const m=mergeContinuation(original,full);save('imported-delta',m.delta);
 json('import-provenance',{runId:39782117108,commit:'de00468bd1e500776fa1798b2bbde981844e17bf',artifactId:12426614536,artifactSHA256:'55ad41eb511f5416960b06e83bd2b6113ea2682ef6d056edb6f22c79df688b08',baseline:sha(original),source:sha(full),delta:sha(m.delta),continued:m.continued,newlySettled:m.newlySettled,addedPlies:m.addedPlies,newGames:0,sourceHashes:Object.fromEntries(['games','position-games','continuation-audit'].map(n=>[n,sha(readFileSync(`${d}/${n}.json.gz`))]))});
 save('imported-source-audit',read(d,'continuation-audit'));console.log('Imported',m.continued,'settled',m.newlySettled);
}
if(!existsSync(`${dir}/imported-delta.json.gz`))throw Error('Import a verified continuation artifact first');
const merged=mergeContinuation(original,read(dir,'imported-delta')),all=uniqueGames(merged.games);
if(!existsSync(`${dir}/diagnosis.json.gz`)){
 const diagnoses=targets.map(r=>({id:r.id,board:r.board,basic:basicFeatures(r),all:aggregate(all.filter(g=>g.experiment.boardId===r.id)),proofs:r.board.playableCells.length<=10?[0,1].map(turn=>({turn,...reachableGraph({...r.board,turn},{maxStates:50000,maxMs:10000,independent:true,keepGraph:true})})):[],examples:all.filter(g=>g.experiment.boardId===r.id&&g.state.winner===null).slice(0,2).map(g=>({id:g.id,initial:g.initial,policies:g.policies,actions:g.history.slice(0,16).map(h=>h.a),checkpoint:g.state,quiet:g.metrics.quiet,repeated:g.repetitionCount,declinedCaptures:g.metrics.declinedCapture}))}));
 save('diagnosis',diagnoses);
 const generated=minimalVariants(targets[0]);
 const checks=generated.accepted.map(r=>({record:r,graph:reachableGraph(r.board,{maxStates:5000,maxMs:500})}));
 save('variants',{...generated,accepted:checks});console.log('Diagnosed',diagnoses.map(d=>({id:d.id,proofs:d.proofs.map(p=>({states:p.states,status:p.status}))})),checks.length,'variants');
}
let games=existsSync(`${dir}/games.json.gz`)?read(dir,'games'):[],byId=new Map(games.map(g=>[g.id,g]));
const totalMs=Number(process.env.STALL_MS??480000);if(!Number.isInteger(totalMs)||totalMs<1000||totalMs>1800000)throw Error('Invalid STALL_MS');
const start=performance.now(),timedOut=()=>performance.now()-start>=totalMs;
const play=(plans,{timeBudgetMs=500,maxPlies=2048}={})=>{for(const p of plans){if(byId.has(p.id))continue;if(timedOut())return false;const g=advanceResearch(newResearchGame(p),{maxPlies,timeBudgetMs,memoryBudgetMb:640});games.push(g);byId.set(g.id,g);if(games.length%16===0){save('games',games);console.log('games',games.length,'settled',games.filter(g=>g.state.winner!==null).length);}}save('games',games);return true;};
const variants=read(dir,'variants').accepted,trainRecords=[targets[0],...variants.filter(v=>v.graph.status!=='no-reachable-victory').map(v=>v.record)];
// Freeze all conditions before viewing any new-game outcomes. Holdout labels are disjoint.
const protocol={version:1,trainingSeeds:[12000101,12000139],holdoutSeeds:[13000001,13000019,13000033,13000051,13000073,13000087,13000103,13000129],diagnosticSeeds:[14000029,14000041],timeBudgetMs:500,maxPlies:2048,selection:'Within each mutation class, train-only: unresolved rate, maximum turn/slot bias, edit count, ID; keep at most 3, prioritize stars/walls before target/shape. Position-only impossibility retained.',familyWise:'Holm on selected child settlement sign-flip tests',fairness:'No official certification; all unresolved outcomes retained as ranges',baseDefinitionHashes:Object.fromEntries([...targets,...catalogue.filter(r=>r.status==='有望候補')].map(r=>[r.id,sha(definitionKey(r.board))]))};
if(!existsSync(`${dir}/protocol.json`))json('protocol',protocol);else if(JSON.stringify(JSON.parse(readFileSync(`${dir}/protocol.json`)))!==JSON.stringify(protocol))throw Error('Changed frozen protocol');
const trainPlans=trainRecords.flatMap(r=>researchPlans(r,{stage:'stall-train',seeds:protocol.trainingSeeds,pairs:[['search','route']]}));
let done=play(trainPlans);
if(done&&!existsSync(`${dir}/frozen.json.gz`)){
 const ranks=variants.filter(v=>v.graph.status!=='no-reachable-victory').map(v=>({r:v.record,m:aggregate(games.filter(g=>g.experiment.boardId===v.record.id&&g.experiment.stage==='stall-train'))})).sort((a,b)=>a.m.unresolvedRate-b.m.unresolvedRate||Math.max(a.m.firstBias,a.m.positionBias)-Math.max(b.m.firstBias,b.m.positionBias)||a.r.id.localeCompare(b.r.id));
 const chosen=[];for(const kind of ['positions','stars','walls','wall-count','target','shape']){const row=ranks.find(x=>x.r.change.kind===kind&&x.m.unresolvedRate<1);if(row)chosen.push(row);}save('frozen',chosen.slice(0,3).map(x=>({record:x.r,training:x.m,selection:'Frozen before holdout; unchanged parent retained'})));console.log('Frozen',chosen.slice(0,3).map(x=>[x.r.change,x.m.first,x.m.second,x.m.unresolved]));
}
const modes=[recordBoard(toBoardState(initial(0)),{id:'mode-Sprint',name:'スプリント',shape:'square'}),...RESEARCH_LAYOUTS.map(b=>recordBoard(toBoardState(initial(b)),{id:'mode-'+b.id,name:b.name,shape:'square'}))];
if(done){
 const frozen=read(dir,'frozen'),records=[...targets,...frozen.map(f=>f.record),...catalogue.filter(r=>r.status==='有望候補'),...modes];
 save('roster',records);
 const plans=records.flatMap(r=>protocol.holdoutSeeds.flatMap((seed,i)=>researchPlans(r,{stage:'stall-holdout',seeds:[seed],pairs:[i%2?['mixed','defensive']:['search','route']]})));
 done=play(plans);
 if(done){
  const diagnosisPlans=targets.flatMap(r=>[['search','route'],['deeper','route'],['repeat','route'],['score','route'],['random','random']].flatMap(pair=>researchPlans(r,{stage:'stall-ai-diagnostic',seeds:protocol.diagnosticSeeds,pairs:[pair]})));
  done=play(diagnosisPlans);
 }
 const held=id=>games.filter(g=>g.experiment.boardId===id&&g.experiment.stage==='stall-holdout');
 const comparisons=frozen.map(f=>({id:f.record.id,change:f.record.change,...settlementComparison(held(targets[0].id),held(f.record.id))})),ps=comparisons.map(c=>c.oneSidedSeedSignFlipP??1),adjusted=holm(ps);comparisons.forEach((c,i)=>c.holmP=adjusted[i]);
 save('comparisons',comparisons);
 const library=records.map(r=>{const gs=held(r.id),m=aggregate(gs);return {...r,status:'AI検証中',games:m.games,unresolvedRate:m.unresolvedRate,metrics:{...m,stages:{holdout:m}},traits:[...(m.medianDecidedPlies!==null&&m.medianDecidedPlies<=20?['短期決着を観測']:[]),...(m.nearVictoryReversals?['逆転を観測']:[]),...(m.wallRate>.5?['壁操作が多い']:[])],warnings:['停滞研究の独立条件。未認定。人間の時間・楽しさは未測定。',...(ids.slice(0,2).includes(r.id)?['全到達状態の列挙で勝利不能。初期位置番号の交換だけでは改善しない。']:[])]};});save('catalogue',library);
 json('summary',{complete:done,uniqueNewGames:games.length,importedContinuations:merged.continued,importedNewlySettled:merged.newlySettled,newGamesFromImport:0,allSourceGames:all.length,sourceNormal:aggregate(all.filter(g=>g.experiment.regime==='standard')),newByStage:Object.fromEntries(['stall-train','stall-holdout','stall-ai-diagnostic'].map(stage=>[stage,aggregate(games.filter(g=>g.experiment.stage===stage))])),boards:library.map(r=>({id:r.id,name:r.name,change:r.change,metrics:r.metrics})),comparisons,elapsedMs:performance.now()-start,limitations:['All results are policy- and budget-conditional','Human play duration and enjoyment not measured','No official board replacement or certification']});
}
save('games',games);console.log({complete:done,newGames:games.length,elapsedMs:performance.now()-start});

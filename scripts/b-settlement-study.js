// Research only: no production layout, CPU, rule or time-limit changes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {initial,apply,key,successors} from '../src/engine.js';
import {toBoardState} from '../src/geometry.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {recordBoard,generateBoard,definitionKey,validateBoard} from '../src/board-lab.js';
import {discoveryID,verifyExperiment,decisionAudit} from './board-discovery.js';
import {sha,researchPlans,newResearchGame,advanceResearch,aggregateResearch,referenceChildren,settlementComparison,holm,mergeContinuation} from './stall-research.js';
import {completionSummary} from './tactics-completion-statistics.js';

export function replayDiagnosis(g,{independent=false}={}){
 verifyExperiment(g);let s=g.initial,counts=new Map(),duplicateStates=0,maxVisits=0,quiet=0,longestQuiet=0;
 const visits=()=>{const k=key(s),n=(counts.get(k)??0)+1;counts.set(k,n);duplicateStates+=Number(n>1);maxVisits=Math.max(maxVisits,n);};visits();
 const sampleAt=new Set([0,Math.floor(g.history.length/2),g.history.length]),snapshots=[];
 const snapshot=()=>{const children=successors(s),p=s.turn,scoring=children.filter(c=>c.n.scores[p]>s.scores[p]);snapshots.push({ply:s.ply,state:s,legal:children.length,uniqueNextStates:new Set(children.map(c=>key(c.n))).size,scoringActions:scoring.length,winningActions:children.filter(c=>c.n.winner===p).length,scoringDestinations:[...new Set(scoring.map(c=>c.n.players[p]))],quiet});};
 if(sampleAt.has(0))snapshot();
 for(let i=0;i<g.history.length;i++){
  const h=g.history[i],cs=independent?referenceChildren(s):successors(s),c=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(h.a));assert.ok(c,'Illegal recorded action');assert.equal(h.legal,cs.length);assert.equal(h.gain,c.n.scores[s.turn]>s.scores[s.turn]);
  assert.equal(h.from,s.players[s.turn]);assert.equal(h.wallFrom,h.a.wall?s.walls[h.a.wall.wall]:null);assert.equal(h.canScore,cs.some(c=>c.n.scores[s.turn]>s.scores[s.turn]));assert.equal(h.canWin,cs.some(c=>c.n.winner===s.turn));
  quiet=h.gain?0:quiet+1;longestQuiet=Math.max(longestQuiet,quiet);s=c.n;visits();if(sampleAt.has(i+1))snapshot();
 }
 assert.deepEqual(s,g.state);
 return {id:g.id,boardId:g.experiment.boardId,policies:g.research.policyByActor,seed:g.seed,starter:g.starter,positionSwap:g.experiment.positionSwap,aiSwap:g.experiment.aiSwap,reason:g.reason,plies:g.history.length,duplicateStates,maxVisits,quiet,longestQuiet,wallBacktracks:g.metrics.wallBacktracks,pawnBacktracks:g.metrics.pawnBacktracks,scores:s.scores,snapshots,tail:g.history.slice(-12),limits:['Repetition is observational, not a draw','No scoring action now does not prove permanent inaccessibility','RNG and policy memory are not part of the game-state key']};
}
// Cooperative scoring witness, NOT minimax: an opponent may refuse this route.
export function captureWitness(state,actor,{maxDepth=3,maxStates=5000,maxMs=500}={}){
 const started=performance.now(),q=[{s:state,actions:[]}],seen=new Set([key(state)]);let expanded=0;
 for(let i=0;i<q.length;i++){
  if(performance.now()-started>=maxMs)return {status:'unknown',stop:'time',expanded};
  const {s,actions}=q[i];if(actions.length>=maxDepth)continue;expanded++;
  for(const c of successors(s)){
   const path=[...actions,c.a];if(c.n.scores[actor]>state.scores[actor])return {status:'cooperative-capture-witness',expanded,actions:path,state:c.n,actor};
   const k=key(c.n);if(seen.has(k))continue;if(seen.size>=maxStates)return {status:'unknown',stop:'states',expanded};seen.add(k);q.push({s:c.n,actions:path});
  }
 }
 return {status:'no-capture-within-horizon',maxDepth,expanded,limits:['Not a proof of permanent inaccessibility or forced defense']};
}
export function candidates(){
 const parent=recordBoard(toBoardState(RESEARCH_LAYOUTS.find(r=>r.id==='B')),{id:'mode-B',name:'B現行',shape:'square'}),rows=[parent],rejected=[],seen=new Set([definitionKey(parent.board)]);
 const add=(b,change)=>{const v=validateBoard(b);if(!v.ok){rejected.push({change,errors:v.errors});return;}const k=definitionKey(v.state);if(seen.has(k))return;seen.add(k);rows.push(recordBoard(v.state,{id:discoveryID(v.state),parent:parent.id,name:'B研究・'+change.label,shape:'square',change,algorithm:'B-settlement-1',seed:230001}));};
 const b=parent.board;
 add({...b,target:2},{label:'先取2',kind:'target',from:3,to:2});
 for(const remove of [[39,41],[48,50,39,41],[1,7,74,78]])add({...b,walls:b.walls.filter(x=>!remove.includes(x))},{label:'壁削減'+remove.join('-'),kind:'walls',removed:remove});
 add({...b,stars:[0,18,40,62,80]},{label:'星分散',kind:'stars',from:b.stars,to:[0,18,40,62,80]});
 add({...b,walls:b.walls.filter(x=>![39,41].includes(x)),stars:[0,18,40,62,80]},{label:'星分散と壁削減',kind:'multiple'});
 for(const [size,walls,stars,target,seed] of [[9,6,5,3,230101],[9,8,5,3,230113],[9,6,7,3,230129],[8,6,5,3,230143],[7,6,5,3,230159],[9,6,7,4,230173]]){
  try{const r=generateBoard({width:size,height:size,shape:'square',walls,stars,target,seed,symmetry:size%2?'rotation':'none'});add(r.board,{label:`再配置${size}-${walls}-${stars}-${target}`,kind:'regenerate',parameters:r.parameters});}catch(e){rejected.push({seed,error:e.message});}
 }
 return {parent,rows,rejected};
}
const read=p=>JSON.parse(gunzipSync(readFileSync(p)));
const dir=process.env.B_SETTLEMENT_REPORT??'reports/b-settlement-2026-10-23';
const save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);};
export function run(){
 mkdirSync(dir,{recursive:true});const generated=candidates(),roster=generated.rows;
 const protocol={version:1,sourceCommit:'4b3f6adeb044b0e2039d03eea6c3801f8f744a1a',trainSeeds:[2301001,2301019],holdoutSeeds:[2302001,2302019,2302033,2302051,2302073,2302087,2302103,2302129],modeSeeds:[2303001,2303019,2303033,2303051],diagnosticSeeds:[2304001,2304019],train:{timeBudgetMs:160,maxPlies:512},holdout:{timeBudgetMs:700,maxPlies:2048},modes:{timeBudgetMs:300,maxPlies:1024},diagnostic:{timeBudgetMs:700,maxPlies:2048},selection:'Train only: settlement first, worst turn/slot bias second, opening diversity third, ID; top two frozen before holdout. No official adoption.',rosterHash:sha(roster),rules:'unchanged; all caps unresolved; soft per-game wall-clock limits',limits:['Host performance can affect time censoring','Different AI pairs and budgets are reported separately','Human time and enjoyment not measured']};
 const protocolPath=`${dir}/protocol.json`;if(existsSync(protocolPath))assert.deepEqual(JSON.parse(readFileSync(protocolPath)),protocol);else writeFileSync(protocolPath,JSON.stringify(protocol,null,2)+'\n');
 save('roster',generated);
 const source=mergeContinuation(read('reports/stall-2026-10-23/games.json.gz'),read('reports/mode-continuation-2026-10-23/delta.json.gz')).games;
 const previous=source.filter(g=>g.experiment.boardId==='mode-B');save('source-diagnosis',previous.map(g=>replayDiagnosis(g,{independent:true})));
 if(!existsSync(`${dir}/capture-witnesses.json.gz`))save('capture-witnesses',previous.filter(g=>g.state.winner===null).map(g=>({id:g.id,plies:g.history.length,scores:g.state.scores,witnesses:[0,1].map(actor=>captureWitness(g.state,actor))})));
 let games=existsSync(`${dir}/games.json.gz`)?read(`${dir}/games.json.gz`):[];assert.equal(new Set(games.map(g=>g.id)).size,games.length);const done=new Set(games.map(g=>g.id)),start=performance.now();
 const play=(records,stage,seeds,pairs,budget)=>{const plans=records.flatMap(r=>researchPlans(r,{stage,seeds,pairs}));for(const p of plans){if(done.has(p.id))continue;const g=advanceResearch(newResearchGame(p),{...budget,memoryBudgetMb:640});verifyExperiment(g);games.push(g);done.add(g.id);if(games.length%8===0){save('games',games);console.log(stage,games.length);}}save('games',games);};
 play(roster,'B-settlement-train',protocol.trainSeeds,[['search','route']],protocol.train);
 const stageGames=(id,stage)=>games.filter(g=>g.experiment.boardId===id&&g.experiment.stage===stage);
 const training=roster.map(r=>({id:r.id,metrics:aggregateResearch(stageGames(r.id,'B-settlement-train'))}));
 const ranking=training.filter(r=>r.id!=='mode-B').sort((a,b)=>a.metrics.unresolvedRate-b.metrics.unresolvedRate||Math.max(a.metrics.firstBias,a.metrics.positionBias)-Math.max(b.metrics.firstBias,b.metrics.positionBias)||b.metrics.openingDiversity-a.metrics.openingDiversity||a.id.localeCompare(b.id));
 const frozen={ids:ranking.slice(0,2).map(r=>r.id),training,selection:protocol.selection};if(existsSync(`${dir}/frozen.json.gz`))assert.deepEqual(read(`${dir}/frozen.json.gz`),frozen);else save('frozen',frozen);
 const held=[roster[0],...frozen.ids.map(id=>roster.find(r=>r.id===id))];
 play(held,'B-settlement-holdout',protocol.holdoutSeeds,[['search','route']],protocol.holdout);
 // Distinct policy families on separate seeds; do not merge into training or holdout rates.
 play(held,'B-policy-diagnostic',protocol.diagnosticSeeds,[['star','positional'],['mixed','defensive'],['deeper','route'],['repeat','score']],protocol.diagnostic);
 const modes=[recordBoard(toBoardState(initial()),{id:'mode-Sprint',name:'Sprint'}),...RESEARCH_LAYOUTS.map(r=>recordBoard(toBoardState(r),{id:'mode-'+r.id,name:r.id}))];
 play(modes,'all-mode-independent',protocol.modeSeeds,[['star','search']],protocol.modes);
 const summarize=(r,stage)=>{const gs=stageGames(r.id,stage);return {id:r.id,name:r.name,change:r.change??null,metrics:aggregateResearch(gs),conservative:completionSummary(gs.map(g=>({...g,cluster:g.experiment.cluster}))),reasons:Object.fromEntries([...new Set(gs.map(g=>g.reason))].map(reason=>[reason,gs.filter(g=>g.reason===reason).length])),byPair:Object.fromEntries([...new Set(gs.map(g=>g.research.labels.join('/')))].map(pair=>[pair,aggregateResearch(gs.filter(g=>g.research.labels.join('/')===pair))])),decisionAudit:decisionAudit(r,gs.find(g=>g.state.winner!==null)??gs[0],{samples:3})};};
 const holdout=held.map(r=>summarize(r,'B-settlement-holdout')),comparisons=held.slice(1).map(r=>({id:r.id,...settlementComparison(stageGames('mode-B','B-settlement-holdout'),stageGames(r.id,'B-settlement-holdout'))}));const adjusted=holm(comparisons.map(r=>r.oneSidedSeedSignFlipP??1));comparisons.forEach((r,i)=>r.holmP=adjusted[i]);
 const summary={complete:true,newUniqueGames:games.length,elapsedMs:performance.now()-start,generated:roster.length-1,rejected:generated.rejected,holdout,comparisons,policyDiagnostics:held.map(r=>summarize(r,'B-policy-diagnostic')),modes:modes.map(r=>summarize(r,'all-mode-independent')),decision:'No production changes. Research candidates require independent policy confirmation and human tests.'};
 save('summary',summary);save('catalogue',held.map(r=>{const m=holdout.find(x=>x.id===r.id).metrics;return {...r,status:'AI検証中',metrics:m,games:m.games,unresolvedRate:m.unresolvedRate,warnings:['研究用・未認定。選別後の独立seed結果。人間の時間・楽しさ未測定。'],traits:[]};}));
 const examples=held.flatMap(r=>{const gs=stageGames(r.id,'B-settlement-holdout');return [gs.find(g=>g.state.winner===null),gs.find(g=>g.state.winner!==null)].filter(Boolean).map(g=>replayDiagnosis(g,{independent:true}));});save('examples',examples);
 console.log(JSON.stringify({games:games.length,holdout:holdout.map(r=>({id:r.id,...r.metrics})),comparisons},null,2));
}
export function verifySaved(){
 const gs=read(`${dir}/games.json.gz`),roster=read(`${dir}/roster.json.gz`),protocol=JSON.parse(readFileSync(`${dir}/protocol.json`));assert.equal(sha(roster.rows),protocol.rosterHash);assert.equal(new Set(gs.map(g=>g.id)).size,gs.length);
 let plies=0;for(const g of gs){replayDiagnosis(g,{independent:true});plies+=g.history.length;}
 const s=read(`${dir}/summary.json.gz`);assert.equal(s.newUniqueGames,gs.length);for(const [rows,stage] of [[s.holdout,'B-settlement-holdout'],[s.modes,'all-mode-independent'],[s.policyDiagnostics,'B-policy-diagnostic']])for(const r of rows)assert.deepEqual(r.metrics,aggregateResearch(gs.filter(g=>g.experiment.boardId===r.id&&g.experiment.stage===stage)));
 const frozen=read(`${dir}/frozen.json.gz`),held=[roster.rows[0],...frozen.ids.map(id=>roster.rows.find(r=>r.id===id))];
 const modes=[recordBoard(toBoardState(initial()),{id:'mode-Sprint',name:'Sprint'}),...RESEARCH_LAYOUTS.map(r=>recordBoard(toBoardState(r),{id:'mode-'+r.id,name:r.id}))];
 const expected=[...roster.rows.flatMap(r=>researchPlans(r,{stage:'B-settlement-train',seeds:protocol.trainSeeds,pairs:[['search','route']]})),...held.flatMap(r=>researchPlans(r,{stage:'B-settlement-holdout',seeds:protocol.holdoutSeeds,pairs:[['search','route']]})),...held.flatMap(r=>researchPlans(r,{stage:'B-policy-diagnostic',seeds:protocol.diagnosticSeeds,pairs:[['star','positional'],['mixed','defensive'],['deeper','route'],['repeat','score']]})),...modes.flatMap(r=>researchPlans(r,{stage:'all-mode-independent',seeds:protocol.modeSeeds,pairs:[['star','search']]}))];
 assert.deepEqual(gs.map(g=>g.id).sort(),expected.map(p=>p.id).sort(),'Missing or unexpected experiment');
 const plans=new Map(expected.map(p=>[p.id,p]));for(const g of gs){const original=newResearchGame(plans.get(g.id));for(const f of ['initial','experiment','research','policies','starter','seed'])assert.deepEqual(g[f],original[f]);}
 const source=mergeContinuation(read('reports/stall-2026-10-23/games.json.gz'),read('reports/mode-continuation-2026-10-23/delta.json.gz')).games,byID=new Map(source.map(g=>[g.id,g]));
 assert.deepEqual(read(`${dir}/source-diagnosis.json.gz`),source.filter(g=>g.experiment.boardId==='mode-B').map(g=>replayDiagnosis(g,{independent:true})));
 for(const row of read(`${dir}/capture-witnesses.json.gz`))for(const w of row.witnesses)if(w.actions){let n=byID.get(row.id).state;const start=n;for(const a of w.actions){const c=referenceChildren(n).find(c=>JSON.stringify(c.a)===JSON.stringify(a));assert.ok(c);n=c.n;}assert.deepEqual(n,w.state);assert.ok(n.scores[w.actor]>start.scores[w.actor]);}
 for(const r of s.comparisons){const actual=settlementComparison(gs.filter(g=>g.experiment.boardId==='mode-B'&&g.experiment.stage==='B-settlement-holdout'),gs.filter(g=>g.experiment.boardId===r.id&&g.experiment.stage==='B-settlement-holdout'));for(const k of Object.keys(actual))assert.deepEqual(r[k],actual[k]);}
 for(const r of read(`${dir}/catalogue.json.gz`)){assert.deepEqual(r.board,held.find(h=>h.id===r.id).board);assert.deepEqual(r.metrics,s.holdout.find(h=>h.id===r.id).metrics);assert.equal(r.status,'AI検証中');}
 const result={games:gs.length,independentPlies:plies,gamesHash:sha(gs),allLegal:true,summaryMatched:true};writeFileSync(`${dir}/verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--verify'))verifySaved();else run();}

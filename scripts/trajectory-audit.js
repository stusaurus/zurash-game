// Research only. Complete traces and censored prefixes are deliberately separate.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {recordBoard} from '../src/board-lab.js';
import {key} from '../src/engine.js';
import {sha,researchPlans,newResearchGame,advanceResearch,aggregateResearch} from './stall-research.js';
import {replayDiagnosis} from './b-settlement-study.js';
export function traceKey(g,n=Infinity,physical=false){
 let s=g.initial;
 // Player names do not create new physical games. Keep actual starting cell and turn.
 if(physical&&s.players[0]>s.players[1])s={...s,players:[...s.players].reverse(),scores:[...s.scores].reverse(),turn:1-s.turn,winner:s.winner===null?null:1-s.winner};
 return sha([key(s),g.history.slice(0,n).map(h=>h.a)]);
}
export function diversity(gs,n=Infinity,physical=false){
 const groups=new Map();for(const g of gs){if(g.history.length<n&&n!==Infinity)continue;const k=traceKey(g,n,physical);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(g);}
 const eligible=[...groups.values()].reduce((s,v)=>s+v.length,0);
 return {eligible,tooShort:gs.length-eligible,unique:groups.size,repeatedRecords:eligible-groups.size,maxMultiplicity:Math.max(0,...[...groups.values()].map(v=>v.length))};
}
export function audit(gs){
 const decided=gs.filter(g=>g.state.winner!==null),unique=[...new Map(decided.map(g=>[traceKey(g),g])).values()],physicalUnique=[...new Map(decided.map(g=>[traceKey(g,Infinity,true),g])).values()];
 return {records:gs.length,observedTrace:diversity(gs),completed:diversity(decided),first5:diversity(gs,5),first10:diversity(gs,10),uniqueCompletedOutcomes:{first:unique.filter(g=>g.state.winner===g.starter).length,second:unique.filter(g=>g.state.winner!==g.starter).length},physicalUniqueCompletedOutcomes:{first:physicalUnique.filter(g=>g.state.winner===g.starter).length,second:physicalUnique.filter(g=>g.state.winner!==g.starter).length},physicalCompleted:diversity(decided,Infinity,true),physicalFirst5:diversity(gs,5,true),censored:gs.length-decided.length};
}
const dir='reports/trajectory-audit-2026-10-23';
const load=n=>{
 const p=`${dir}/${n}.json.gz`;if(existsSync(p))return JSON.parse(gunzipSync(readFileSync(p)));
 if(n==='games')return ['A','B','C','D','E'].flatMap(mode=>JSON.parse(gunzipSync(Buffer.from(readFileSync(`${dir}/games-${mode}.json.gz.b64`,'utf8'),'base64'))));
 throw Error('Missing archive '+n);
};
const save=(n,x)=>writeFileSync(`${dir}/${n}.json.gz`,gzipSync(JSON.stringify(x)));
export function run(){
 mkdirSync(dir,{recursive:true});
 const plan={source:'c3dd6e176a22e8335e0789732df8c2a9625c7bf1',modes:['A','B','C','D','E'],seeds:[6102301,6102323,6102349,6102371],pairs:[['search','search'],['star','route'],['mixed','defensive']],initialBudgetMs:400,continuationBudgetMs:1200,maxPlies:4096,note:'Exploratory fixed plan. Same-policy aiSwap duplicates omitted before running. Each pair has both physical starts and both starters; heterogeneous pairs also exchange actors. No official adoption.'};
 const pp=`${dir}/plan.json`;if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),plan);else writeFileSync(pp,JSON.stringify(plan,null,2)+'\n');
 let games=existsSync(`${dir}/games.json.gz`)||existsSync(`${dir}/games-E.json.gz.b64`)?load('games'):[],known=new Set(games.map(g=>g.id));
 for(const mode of plan.modes){
  const record=recordBoard(toBoardState(RESEARCH_LAYOUTS.find(x=>x.id===mode)),{id:mode,name:mode});
  for(const p of researchPlans(record,{stage:'trajectory-audit-fixed',seeds:plan.seeds,pairs:plan.pairs}).filter(p=>p.pair[0]!==p.pair[1]||!p.aiSwap)){
   if(known.has(p.id))continue;
   let g=advanceResearch(newResearchGame(p),{timeBudgetMs:plan.initialBudgetMs,maxPlies:plan.maxPlies,memoryBudgetMb:768});
   if(g.state.winner===null&&g.reason==='budget-time')g=advanceResearch(g,{timeBudgetMs:plan.continuationBudgetMs,maxPlies:plan.maxPlies,memoryBudgetMb:768});
   games.push(g);known.add(g.id);save('games',games);
  }
  console.log(mode,games.filter(g=>g.experiment.boardId===mode).length);
 }
 verify();
}
export function verify(){
 const gs=load('games'),plan=JSON.parse(readFileSync(`${dir}/plan.json`));assert.equal(gs.length,400);assert.equal(new Set(gs.map(g=>g.id)).size,gs.length);
 const expected=plan.modes.flatMap(mode=>researchPlans(recordBoard(toBoardState(RESEARCH_LAYOUTS.find(x=>x.id===mode)),{id:mode,name:mode}),{stage:'trajectory-audit-fixed',seeds:plan.seeds,pairs:plan.pairs}).filter(p=>p.pair[0]!==p.pair[1]||!p.aiSwap));
 assert.deepEqual(gs.map(g=>g.id).sort(),expected.map(p=>p.id).sort());
 const em=new Map(expected.map(p=>[p.id,p]));
 for(const g of gs){const p=em.get(g.id);assert.deepEqual(g.initial,newResearchGame(p).initial);assert.deepEqual(g.research,p.research);assert.equal(g.seed,p.seed);assert.equal(g.starter,p.starter);assert.deepEqual(g.experiment,newResearchGame(p).experiment);
 assert.ok(g.stages.length===1||g.stages.length===2);assert.equal(g.stages[0].timeBudgetMs,plan.initialBudgetMs);for(const stage of g.stages)assert.equal(stage.maxPlies,plan.maxPlies);
 if(g.stages.length===2){assert.equal(g.stages[0].reason,'budget-time');assert.equal(g.stages[1].timeBudgetMs,plan.continuationBudgetMs);}}
 const diagnostics=gs.map(g=>replayDiagnosis(g,{independent:true}));save('diagnostics',diagnostics);
 const rows=plan.modes.flatMap(mode=>plan.pairs.map(pair=>{
  const subset=gs.filter(g=>g.experiment.boardId===mode&&g.experiment.pair.join('/')===pair.join('/')),ds=diagnostics.filter(d=>subset.some(g=>g.id===d.id));
  return {mode,pair:pair.join('/'),...audit(subset),metrics:aggregateResearch(subset),budget:{continued:subset.filter(g=>g.stages.length===2).length,settledAfterExtension:subset.filter(g=>g.stages.length===2&&g.state.winner!==null).length,reasons:Object.fromEntries([...new Set(subset.map(g=>g.reason))].map(r=>[r,subset.filter(g=>g.reason===r).length]))},unresolved:ds.filter(d=>d.reason!=='win').map(d=>({id:d.id,plies:d.plies,quiet:d.quiet,repeatedStates:d.duplicateStates,legal:d.snapshots.at(-1).legal})),medianComputeMs:subset.map(g=>g.elapsedMs).sort((a,b)=>a-b)[Math.floor(subset.length/2)],closeFinishes:subset.filter(g=>g.state.winner!==null&&Math.abs(g.state.scores[0]-g.state.scores[1])===1).length,meanLegalActions:subset.reduce((n,g)=>n+g.history.reduce((s,h)=>s+h.legal,0),0)/Math.max(1,subset.reduce((n,g)=>n+g.history.length,0))};
 }));
 const summary={games:gs.length,plies:gs.reduce((s,g)=>s+g.history.length,0),rows,limits:['Unique trajectory outcomes are descriptive, not unbiased win-rate estimates','Only four seed blocks; fixed board and policy correlation remain','Censored traces are not completed trajectories, nor draws','Compute milliseconds are not human playing time','Legal action count and reversals do not prove human enjoyment','No rule, board or production CPU changes']};
 writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({games:summary.games,plies:summary.plies,rows:rows.map(r=>({mode:r.mode,pair:r.pair,first:r.metrics.first,second:r.metrics.second,u:r.censored,unique:r.completed.unique}))}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--verify'))verify();else run();}

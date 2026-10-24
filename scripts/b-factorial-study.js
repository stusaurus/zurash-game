import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,renameSync,mkdirSync,existsSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {successors,key,apply,initial} from '../src/engine.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {choose} from '../src/ai.js';
import {bFactorMove,B_FACTOR_ARMS} from './b-factorial-ai.js';
import {makeOracle,auditPosition} from './guard-contract.js';
import {referenceChildren,sha} from './stall-research.js';
import {newGame,advanceGame,randomStream} from './tactics-completion.js';
import {replayDiagnosis} from './b-settlement-study.js';
import {checkpointFingerprint} from './trajectory-followup.js';
import {traceKey,audit} from './trajectory-audit.js';
import {select as archivedSelect} from './guard-followup.js';
const dir='reports/b-factorial-2026-10-24',planPath='reports/b-factorial-2026-10-24-plan.json';
const aid=a=>JSON.stringify(a),read=p=>JSON.parse(gunzipSync(readFileSync(p))),load=n=>read(`${dir}/${n}.json.gz`);
const has=n=>existsSync(`${dir}/${n}.json.gz`);
function save(n,x){mkdirSync(dir,{recursive:true});const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);}
export function plan(){const p=JSON.parse(readFileSync(planPath,'utf8'));assert.deepEqual(p.arms,B_FACTOR_ARMS);return p;}
export function seenAt(cp){const m=new Map(cp.visits.map(([k,v])=>[k,v.count]));m.set(key(cp.state),(m.get(key(cp.state))??0)+1);return m;}
export function independentRoots(s){
 const p=s.turn,cs=referenceChildren(s),oracle=makeOracle(),safe=[],forced=[],captures=[];
 for(const c of cs){const rs=referenceChildren(c.n);if(c.n.winner===p||!rs.some(r=>r.n.winner===1-p))safe.push(c.a);
  if(oracle.wins(c.n,p,2))forced.push(c.a);if(c.n.scores[p]>s.scores[p])captures.push(c.a);}
 return {legal:cs.map(c=>c.a),safe,forced,captures};
}
export function judgeChoice(truth,probe){
 const has=(xs,a)=>xs.some(x=>aid(x)===aid(a)),ret=probe.retainedActions;
 return {legal:has(truth.legal,probe.action),safeAvailable:truth.safe.length,safeRetained:ret.filter(a=>has(truth.safe,a)).length,
  anySafeRetained:ret.some(a=>has(truth.safe,a)),safeFraction:truth.safe.length?ret.filter(a=>has(truth.safe,a)).length/truth.safe.length:null,
  dangerousSelection:!has(truth.safe,probe.action),avoidableDanger:truth.safe.length>0&&!has(truth.safe,probe.action),
  forcedAvailable:truth.forced.length,forcedRetained:ret.filter(a=>has(truth.forced,a)).length,selectedForced:has(truth.forced,probe.action)};
}
export function verifyResearchGame(g){
 // newGame's carrier accepts registered policies only. The actual research
 // identity is factorArm/research; preserve the raw archive, and explicitly
 // adapt its metadata for the older independent verifier's schema.
 if(g.factorArm!==undefined){
  assert.ok(B_FACTOR_ARMS[g.factorArm]);assert.deepEqual(g.policies,['search','search']);
  assert.deepEqual(g.research.labels,[g.factorArm,g.factorArm]);assert.deepEqual(g.research.policyByActor,g.research.labels);assert.deepEqual(g.experiment.pair,g.research.labels);
  assert.ok(g.experiment.regime===undefined||g.experiment.regime==='standard');
  const view={...g,policies:[...g.research.labels],experiment:{...g.experiment,regime:'standard'}};
  return replayDiagnosis(view,{independent:true});
 }
 return replayDiagnosis(g,{independent:true});
}
export function play(cp,{arm=null,actor=null,ms,plies,stats=[],replayStats=null}){
 const budget=plan().moveBudget;
 return advanceGame(cp,{maxPlies:Math.min(100000,cp.state.ply+plies),timeBudgetMs:ms,memoryBudgetMb:768,
  select:(s,_label,rng,seen,children)=>{
   if(actor!==null&&s.turn!==actor&&cp.factorArm===undefined)return archivedSelect(s,cp.research.policyByActor[s.turn],rng,seen,children);
   const use=actor===null?cp.factorArm:s.turn===actor?arm:cp.factorArm;
   const saved=replayStats?.find(r=>r.ply===s.ply&&r.actor===s.turn);
   const r=bFactorMove(s,use,rng,seen,replayStats?{...budget,maxMs:3600000,maxRoots:saved?.complete===false?saved.rootEvaluated:Infinity}:budget);stats.push({ply:s.ply,actor:s.turn,...r,action:undefined});return r.action;}});
}
function newInitial(arm,seed,swap,starter,stage){
 const base=initial(RESEARCH_LAYOUTS.find(r=>r.id==='B'),starter);if(swap)base.players.reverse();
 const id='bf-'+sha([plan(),stage,arm,seed,swap,starter]),g=newGame(base,{seed,starter,id,policies:['search','search']});
 g.factorArm=arm;g.research={labels:[arm,arm],policyByActor:[arm,arm],version:'b-factorial-1'};
 g.experiment={boardId:'B',stage,pair:[arm,arm],positionSwap:swap,aiSwap:false,physicalSlots:swap?[...base.players].reverse():[...base.players],cluster:String(seed),condition:[seed,swap,starter].join('/')};return g;
}
export function replayCheckpoint(game,ply,stats=null){
 const g=newGame(game.initial,{id:game.id,starter:game.starter,seed:game.seed,policies:game.policies});
 for(const k of ['factorArm','research','experiment'])if(game[k]!==undefined)g[k]=structuredClone(game[k]);
  const n=play(g,{ms:3600000,plies:ply-g.initial.ply,replayStats:stats});assert.deepEqual(n.history,game.history.slice(0,ply-g.initial.ply));return n;
}
export function setup(){
 const p=plan(),dev=read(p.development.source);assert.equal(dev.length,p.development.expectedCases);
 const lock={planSHA256:sha(p),developmentArchiveSHA256:sha(readFileSync(p.development.source)),developmentCasesSHA256:sha(dev),productionPathsChanged:false};
 if(has('lock'))assert.deepEqual(load('lock'),lock);else save('lock',lock);return {p,dev};
}
export function runSources(){
 const {p}=setup(),rows=has('source-games')?load('source-games'):[],done=new Set(rows.map(r=>r.game.id));
 for(const seed of p.freshSource.seeds)for(const swap of [false,true])for(const starter of [0,1]){
  const g=newInitial('A',seed,swap,starter,'holdout-source');if(done.has(g.id))continue;
  const stats=[];let game=play(g,{ms:p.freshSource.initialMs,plies:p.freshSource.maxPlies,stats}),extension=null;
  if(game.state.winner===null){const before=game;game=play(game,{ms:p.freshSource.extensionMs,plies:p.freshSource.maxPlies-game.state.ply,stats});extension={source:checkpointFingerprint(before),addedPlies:game.history.length-before.history.length};}
  rows.push({game,extension,stats});done.add(g.id);save('source-games',rows);console.log('holdout source',rows.length,'/32');
 }
}
export function holdoutCases(){
 const {p,dev}=setup(),used=new Set(dev.map(c=>key(c.checkpoint.state))),rows=[],skipped=[];
 for(const {game:g,stats} of load('source-games')){
  let s=g.initial;const states=[];for(const h of g.history){states.push(s);s=apply(s,h.a);}
  const order=[...states.filter(s=>s.ply>=8&&s.scores[1-s.turn]===(s.target??3)-1),...states.filter(s=>s.ply>=12),...states],pick=order.find(s=>!used.has(key(s)));
  if(!pick){skipped.push(g.id);continue;}used.add(key(pick));const cp=replayCheckpoint(g,pick.ply,stats);
  rows.push({caseID:sha(['holdout',g.id,pick.ply]),sourceID:g.id,seed:g.seed,kind:'fresh-holdout',checkpoint:cp});
 }
 const result={planSHA256:sha(p),rows,skipped};
 if(has('holdout-cases')){const old=load('holdout-cases');assert.equal(old.planSHA256,result.planSHA256);assert.deepEqual(old.skipped,skipped);assert.deepEqual(old.rows.map(r=>r.caseID),rows.map(r=>r.caseID));for(const r of rows)assert.equal(checkpointFingerprint(r.checkpoint),checkpointFingerprint(old.rows.find(x=>x.caseID===r.caseID).checkpoint));return old.rows;}
 save('holdout-cases',result);return rows;
}
export function runForks(kind){
 const {p,dev}=setup(),cases=kind==='development'?dev.map(c=>({...c,seed:c.checkpoint.seed})):holdoutCases(),config=p[kind==='development'?'development':'holdout'];
 const name=kind+'-forks',rows=has(name)?load(name):[],done=new Set(rows.map(r=>r.id)),arms=Object.keys(B_FACTOR_ARMS);
 for(const [i,c] of cases.entries()){
  const cp=c.checkpoint,truth=independentRoots(cp.state);auditPosition(cp.state); // PR16 independent bounded contract.
  for(let j=0;j<arms.length;j++){
   const arm=arms[(i+j)%4],id=sha([kind,c.caseID,arm]);if(done.has(id))continue;
   const rng=randomStream(cp.rngStates[cp.state.turn]),seen=seenAt(cp),probe=bFactorMove(cp.state,arm,rng,seen,{...p.moveBudget,trace:true});
   const shadowRng=randomStream(cp.rngStates[cp.state.turn]),shadow=choose(cp.state,{level:'search',rng:shadowRng,seen,beam:8});
   const stats=[],game=play(cp,{arm,actor:cp.state.turn,ms:config.forkMs,plies:config.extraPlies,stats});
   assert.deepEqual(game.history[cp.history.length]?.a,probe.action);
   rows.push({id,caseID:c.caseID,sourceID:c.sourceID,seed:c.seed,kind,actor:cp.state.turn,arm,checkpoint:cp,checkpointSHA256:checkpointFingerprint(cp),truth,probe,judgement:judgeChoice(truth,probe),shadow:{action:shadow,rngAfter:shadowRng.state(),sameAsA:arm==='A'?aid(shadow)===aid(probe.action):null},game,stats});
   done.add(id);save(name,rows);console.log(kind,'forks',rows.length,'/',cases.length*4);
  }
 }
}
export function runSelf(){
 const {p}=setup(),rows=has('self-games')?load('self-games'):[],done=new Set(rows.map(r=>r.game.id));
 for(const [i,seed] of p.selfPlay.seeds.entries())for(const swap of [false,true])for(const starter of [0,1])for(let j=0;j<4;j++){
  const arm=p.selfPlay.arms[(i+j)%4],g=newInitial(arm,seed,swap,starter,'self');if(done.has(g.id))continue;
  const stats=[],game=play(g,{ms:p.selfPlay.initialMs,plies:p.selfPlay.maxPlies,stats});rows.push({arm,game,stats});done.add(g.id);save('self-games',rows);console.log('self initial',rows.length,'/128');
 }
}
export function extendSelf(){
 const p=plan(),rows=has('self-extensions')?load('self-extensions'):[],done=new Set(rows.map(r=>r.game.id));
 for(const r of load('self-games')){if(r.game.state.winner!==null||done.has(r.game.id))continue;
  const stats=[],game=play(r.game,{ms:p.selfPlay.extensionMs,plies:p.selfPlay.maxPlies-r.game.state.ply,stats});rows.push({arm:r.arm,sourceSHA256:checkpointFingerprint(r.game),game,stats});done.add(game.id);save('self-extensions',rows);console.log('self extended',rows.length);
 }
}
export function extendForks(){
 const initial=['development','holdout'].flatMap(kind=>load(kind+'-forks')),selected=initial.filter(r=>r.game.state.winner===null),path=`${dir}/fork-extension-plan.json`;
 const config={version:1,initialArchiveSHA256:sha(initial),ids:selected.map(r=>r.id).sort(),extraMs:8000,extraPlies:256,note:'Supplementary equal extension of EVERY unresolved fork, fixed after inspecting primary 4-second outcomes. Original outcomes retained. Extensions are not new cases, games, seeds, or a second independent confirmation.'};
 if(existsSync(path))assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),config);else writeFileSync(path,JSON.stringify(config,null,2)+'\n');
 const rows=has('fork-extensions')?load('fork-extensions'):[],done=new Set(rows.map(r=>r.id));
 for(const r of selected){if(done.has(r.id))continue;const stats=[],game=play(r.game,{arm:r.arm,actor:r.actor,ms:config.extraMs,plies:config.extraPlies,stats});rows.push({id:r.id,kind:r.kind,arm:r.arm,actor:r.actor,sourceSHA256:checkpointFingerprint(r.game),game,stats});done.add(r.id);save('fork-extensions',rows);console.log('fork extended',rows.length,'/',selected.length);}
}
function quantile(xs,p){const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*p)]:null;}
export function armSummary(rows){
 const n=rows.length,stats=rows.flatMap(r=>r.stats.filter(s=>s.arm===r.arm)),probes=rows.map(r=>r.probe).filter(Boolean);
 return {n,wins:rows.filter(r=>r.game.state.winner===(r.actor??r.game.starter)).length,losses:rows.filter(r=>r.game.state.winner!==null&&r.game.state.winner!==(r.actor??r.game.starter)).length,unresolved:rows.filter(r=>r.game.state.winner===null).length,
  safetyEligible:rows.filter(r=>r.judgement?.safeAvailable>0).length,anySafeRetained:rows.filter(r=>r.judgement?.safeAvailable>0&&r.judgement.anySafeRetained).length,avoidableDanger:rows.filter(r=>r.judgement?.avoidableDanger).length,dangerous:rows.filter(r=>r.judgement?.dangerousSelection).length,
  safeActionRetentionMean:probes.length?rows.filter(r=>r.judgement.safeFraction!==null).reduce((v,r)=>v+r.judgement.safeFraction,0)/Math.max(1,rows.filter(r=>r.judgement.safeFraction!==null).length):null,
  forcedAvailable:rows.filter(r=>r.judgement?.forcedAvailable>0).length,forcedChosen:rows.filter(r=>r.judgement?.selectedForced).length,
  probeMedianMs:quantile(probes.map(r=>r.elapsedMs),.5),probeP90Ms:quantile(probes.map(r=>r.elapsedMs),.9),probeMaxMs:Math.max(0,...probes.map(r=>r.elapsedMs)),medianRoots:quantile(probes.map(r=>r.retainedCount),.5),medianSearchPositions:quantile(probes.map(r=>r.searchPositions),.5),probeIncomplete:probes.filter(r=>!r.complete).length,
  moves:stats.length,moveMedianMs:quantile(stats.map(r=>r.elapsedMs),.5),moveP90Ms:quantile(stats.map(r=>r.elapsedMs),.9),maxSampledHeapBytes:Math.max(0,...stats.map(r=>r.sampledHeapPeak)),cumulativePeakRssKB:Math.max(0,...stats.map(r=>r.processPeakRssKB)),incompleteMoves:stats.filter(r=>!r.complete).length,
  uniqueFullTrajectories:new Set(rows.map(r=>traceKey(r.game))).size,diversity:audit(rows.map(r=>r.game))};
}
export function pairedEffects(rows){
 const p=plan(),arms=['A','B','C','D'],cases=[...new Set(rows.map(r=>r.caseID))],clusters=new Map();
 for(const c of cases){const rs=rows.filter(r=>r.caseID===c);assert.equal(rs.length,4);const seed=String(rs[0].seed);if(!clusters.has(seed))clusters.set(seed,[]);clusters.get(seed).push(Object.fromEntries(arms.map(a=>{const r=rs.find(r=>r.arm===a);return [a,Number(r.game.state.winner===r.actor)];})));}
 const blocks=[...clusters.values()],mean=xs=>xs.reduce((v,x)=>v+x,0)/xs.length,contrasts=p.statistics.contrasts.map(([a,b])=>({a,b,fn:r=>r[b]-r[a]}));contrasts.push({a:'interaction',b:'D-B-C+A',fn:r=>r.D-r.B-r.C+r.A});
 const effects=contrasts.map(({a,b,fn})=>{const values=blocks.map(xs=>mean(xs.map(fn))),rng=randomStream(p.statistics.bootstrapSeed),boots=[];
  for(let i=0;i<p.statistics.samples;i++)boots.push(mean(values.map(()=>values[Math.floor(rng()*values.length)])));
  let extreme=0;for(let mask=0;mask<2**values.length;mask++){const v=mean(values.map((x,i)=>x*((mask>>i&1)?1:-1)));extreme+=Number(Math.abs(v)>=Math.abs(mean(values))-1e-12);}
  return {control:a,treatment:b,clusters:blocks.length,seedEffects:values,observedWinDifference:mean(values),seedBootstrap95:[quantile(boots,.025),quantile(boots,.975)],twoSidedSeedSignFlipP:extreme/2**values.length,note:'Exploratory observed wins, not final win probabilities. Bootstrap intervals are unadjusted and unstable with eight clusters. Sign-flip exchangeability is an assumption; censored outcomes stay separate.'};});
 let previous=0;for(const [i,r] of effects.slice(0,4).map((r,i)=>[i,r]).sort((a,b)=>a[1].twoSidedSeedSignFlipP-b[1].twoSidedSeedSignFlipP)){previous=Math.max(previous,Math.min(1,r.twoSidedSeedSignFlipP*(4-effects.slice(0,4).filter(x=>x.holmReferenceP!==undefined).length)));effects[i].holmReferenceP=previous;}
 return effects;
}
export function verify(){
 setup();let forks=0,added=0;const source=load('source-games'),self=load('self-games'),ext=load('self-extensions');
 assert.equal(source.length,32);assert.equal(self.length,128);assert.equal(new Set([...source,...self].map(r=>r.game.id)).size,160);
 const p=plan(),expectedSource=[],expectedSelf=[];
 for(const seed of p.freshSource.seeds)for(const swap of [false,true])for(const starter of [0,1])expectedSource.push(newInitial('A',seed,swap,starter,'holdout-source'));
 for(const seed of p.selfPlay.seeds)for(const swap of [false,true])for(const starter of [0,1])for(const arm of p.selfPlay.arms)expectedSelf.push(newInitial(arm,seed,swap,starter,'self'));
 for(const [actual,expected] of [[source,expectedSource],[self,expectedSelf]]){
  assert.deepEqual(actual.map(r=>r.game.id).sort(),expected.map(g=>g.id).sort());
  for(const r of actual){const original=expected.find(g=>g.id===r.game.id);for(const k of ['initial','seed','starter','policies','research','experiment','factorArm'])assert.deepEqual(r.game[k],original[k]);verifyResearchGame(r.game);}
  for(const seed of new Set(actual.map(r=>r.game.seed)))for(const arm of new Set(actual.map(r=>r.game.factorArm))){const group=actual.filter(r=>r.game.seed===seed&&r.game.factorArm===arm);assert.deepEqual(group.map(r=>`${r.game.experiment.positionSwap}/${r.game.starter}`).sort(),['false/0','false/1','true/0','true/1']);for(const r of group)assert.equal(r.game.experiment.condition,[seed,r.game.experiment.positionSwap,r.game.starter].join('/'));}
 }
 assert.deepEqual(ext.map(r=>r.game.id).sort(),self.filter(r=>r.game.state.winner===null).map(r=>r.game.id).sort());
 for(const r of ext){const old=self.find(x=>x.game.id===r.game.id);assert.ok(old);assert.equal(r.sourceSHA256,checkpointFingerprint(old.game));for(const k of ['initial','seed','starter','policies','research','experiment','factorArm'])assert.deepEqual(r.game[k],old.game[k]);assert.deepEqual(r.game.history.slice(0,old.game.history.length),old.game.history);verifyResearchGame(r.game);added+=r.game.history.length-old.game.history.length;}
 const results={};
 for(const kind of ['development','holdout']){
  const rows=load(kind+'-forks'),expected=(kind==='development'?25:holdoutCases().length)*4;assert.equal(rows.length,expected);assert.equal(new Set(rows.map(r=>r.id)).size,expected);
  for(const r of rows){assert.equal(r.checkpointSHA256,checkpointFingerprint(r.checkpoint));const rng=randomStream(r.checkpoint.rngStates[r.actor]),probe=bFactorMove(r.checkpoint.state,r.arm,rng,seenAt(r.checkpoint),{...plan().moveBudget,trace:true,maxMs:3600000,maxRoots:r.probe.complete?Infinity:r.probe.rootEvaluated});
   for(const k of ['action','retainedActions','scores','rngAfter','searchPositions','complete'])assert.deepEqual(probe[k],r.probe[k],k);
   assert.deepEqual(independentRoots(r.checkpoint.state),r.truth);assert.deepEqual(judgeChoice(r.truth,probe),r.judgement);assert.ok(r.judgement.legal);
   const other=rows.find(x=>x.caseID===r.caseID&&x.arm===({A:'C',B:'D',C:'A',D:'B'})[r.arm]);assert.deepEqual(r.probe.retainedActions,other.probe.retainedActions);assert.equal(r.probe.rngAfter,other.probe.rngAfter);
   assert.equal(r.shadow.rngAfter,r.probe.rngAfter);assert.equal(new Set(rows.filter(x=>x.caseID===r.caseID).map(x=>x.probe.rngAfter)).size,1);
   assert.deepEqual(r.game.history.slice(0,r.checkpoint.history.length),r.checkpoint.history);verifyResearchGame(r.game);forks++;}
  results[kind]={arms:Object.fromEntries(['A','B','C','D'].map(a=>[a,armSummary(rows.filter(r=>r.arm===a))])),...(kind==='holdout'?{effects:pairedEffects(rows)}:{})};
 }
 const merged=self.map(r=>ext.find(e=>e.game.id===r.game.id)?{...r,...ext.find(e=>e.game.id===r.game.id),stats:[...r.stats,...ext.find(e=>e.game.id===r.game.id).stats]}:r);
 results.self=Object.fromEntries(['A','B','C','D'].map(a=>{const rows=merged.filter(r=>r.arm===a),s=armSummary(rows),slot=[0,0];for(const r of rows)if(r.game.state.winner!==null)slot[r.game.experiment.physicalSlots.indexOf(r.game.initial.players[r.game.state.winner])]++;return [a,{...s,positionWins:slot,firstFinalPossible:[s.wins/s.n,(s.wins+s.unresolved)/s.n]}];}));
 const allForks=['development','holdout'].flatMap(k=>load(k+'-forks'));let forkExtensionCount=0,forkExtraPlies=0;
 if(has('fork-extensions')){
  const fes=load('fork-extensions'),ep=JSON.parse(readFileSync(`${dir}/fork-extension-plan.json`,'utf8'));assert.equal(ep.initialArchiveSHA256,sha(allForks));assert.deepEqual(fes.map(r=>r.id).sort(),ep.ids);
  for(const e of fes){const old=allForks.find(r=>r.id===e.id);assert.ok(old&&old.game.state.winner===null);assert.equal(e.sourceSHA256,checkpointFingerprint(old.game));assert.deepEqual(e.game.history.slice(0,old.game.history.length),old.game.history);for(const k of ['initial','seed','starter','policies','research','experiment','factorArm'])assert.deepEqual(e.game[k],old.game[k]);verifyResearchGame(e.game);forkExtraPlies+=e.game.history.length-old.game.history.length;}
  results.supplementary={};for(const kind of ['development','holdout']){const rs=load(kind+'-forks').map(r=>{const e=fes.find(e=>e.id===r.id);return e?{...r,game:e.game,stats:[...r.stats,...e.stats]}:r;});results.supplementary[kind]={arms:Object.fromEntries(['A','B','C','D'].map(a=>[a,armSummary(rs.filter(r=>r.arm===a))])),...(kind==='holdout'?{effects:pairedEffects(rs)}:{})};}forkExtensionCount=fes.length;
 }
 const ledger={newInitialGames:160,sourceInitialGames:32,selfInitialGames:128,sourceExtensionGames:source.filter(r=>r.extension).length,selfExtensionGames:ext.length,selfAddedPlies:added,checkpointForks:forks,checkpointForkAddedPlies:allForks.reduce((n,r)=>n+r.game.history.length-r.checkpoint.history.length,0),forkExtensionCount,forkExtraPlies,sourceTotalPlies:source.reduce((n,r)=>n+r.game.history.length,0),selfInitialPlies:self.reduce((n,r)=>n+r.game.history.length,0),continuedGamesAreNotNew:true};
 const summary={planSHA256:sha(plan()),ledger,results};writeFileSync(`${dir}/summary.json`,JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify({ledger,development:results.development.arms,holdout:results.holdout.arms,self:results.self}));return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const flag=process.argv[2];if(flag==='--setup')setup();else if(flag==='--source')runSources();else if(flag==='--development')runForks('development');else if(flag==='--holdout')runForks('holdout');else if(flag==='--self')runSelf();else if(flag==='--extend')extendSelf();else if(flag==='--extend-forks')extendForks();else if(flag==='--verify')verify();else throw Error('Specify a study stage');}

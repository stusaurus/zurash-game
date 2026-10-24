// Research-only continuations and crossed A/D comparison. No app imports.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {initial,key} from '../src/engine.js';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {bFactorMove} from './b-factorial-ai.js';
import {newGame,advanceGame,randomStream} from './tactics-completion.js';
import {referenceChildren,sha} from './stall-research.js';
import {checkpointFingerprint} from './trajectory-followup.js';
import {audit} from './trajectory-audit.js';
export const directory='reports/b-performance-2026-10-24';
export const protocol=()=>JSON.parse(readFileSync('reports/b-performance-2026-10-24-plan.json','utf8'));
export const readGzip=p=>JSON.parse(gunzipSync(readFileSync(p)));
export const load=n=>readGzip(`${directory}/${n}.json.gz`);
export function save(n,data){mkdirSync(directory,{recursive:true});const p=`${directory}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(data)));renameSync(p+'.tmp',p);}
const actionID=a=>JSON.stringify(a);
export function oldUnresolved(){
 const p=protocol(),a=readGzip(`${p.source}/self-games.json.gz`),b=readGzip(`${p.source}/self-extensions.json.gz`);
 const rows=a.filter(r=>r.arm==='D').map(r=>{const e=b.find(e=>e.game.id===r.game.id);return e?{...e,stats:[...r.stats,...e.stats]}:r;}).filter(r=>r.game.state.winner===null);
 assert.equal(rows.length,p.extension.expected);return rows;
}
export function makeInitial(seed,pair,swap,starter){
 const s=initial(RESEARCH_LAYOUTS.find(r=>r.id==='B'),starter);if(swap)s.players.reverse();
 const id='bp-'+sha([protocol(),seed,pair,swap,starter]),g=newGame(s,{seed,starter,id,policies:['search','search']});
 g.research={labels:[...pair],policyByActor:[...pair],version:'b-performance-1'};
 g.experiment={boardId:'B',stage:'b-performance',pair:[...pair],positionSwap:swap,aiSwap:false,regime:'standard',physicalSlots:swap?[...s.players].reverse():[...s.players],cluster:String(seed),condition:[seed,swap,starter].join('/')};return g;
}
export function plans(){return protocol().seeds.flatMap(seed=>protocol().pairs.flatMap(pair=>[false,true].flatMap(swap=>[0,1].map(starter=>makeInitial(seed,pair,swap,starter)))));}
export function play(checkpoint,{ms,plies,stats=[],replayStats=null}={}){
 const labels=checkpoint.research.policyByActor;
 return advanceGame(checkpoint,{timeBudgetMs:ms,maxPlies:Math.min(100000,checkpoint.state.ply+plies),memoryBudgetMb:768,
  select:(s,_policy,rng,seen)=>{
   const saved=replayStats?.find(r=>r.ply===s.ply),r=bFactorMove(s,labels[s.turn],rng,seen,{...protocol().moveBudget,trace:true,...(replayStats?{maxMs:3600000,maxRoots:saved?.complete===false?saved.rootEvaluated:Infinity}:{})});
   const scores=r.scores.map(c=>c.value).sort((a,b)=>b-a),near=scores.filter(v=>scores[0]-v<=180).length;
   // A proxy only: multiple near-best roots must also lead to distinct states.
   const cs=referenceChildren(s),nearKeys=new Set(r.scores.filter(c=>scores[0]-c.value<=180).map(c=>key(cs.find(x=>actionID(x.a)===actionID(c.action)).n)));
   const {retainedActions,rankedActions,scores:fullScores,certificate,...sample}=r;
   stats.push({...sample,ply:s.ply,actor:s.turn,action:undefined,nearBestRoots:near,choiceProxy:nearKeys.size>=2});return r.action;
  }});
}
function persistLock(){
 const lock={planSHA256:sha(protocol()),sources:oldUnresolved().map(r=>({id:r.game.id,checkpointSHA256:checkpointFingerprint(r.game),statsSHA256:sha(r.stats)}))};
 if(existsSync(`${directory}/lock.json.gz`))assert.deepEqual(load('lock'),lock);else save('lock',lock);return lock;
}
export function extend(index){
 persistLock();const source=oldUnresolved()[index];assert.ok(source);const name=`extension-${index}`,rows=existsSync(`${directory}/${name}.json.gz`)?load(name):[];
 let checkpoint=rows.at(-1)?.game??source.game;
 for(let stage=rows.length;stage<protocol().extension.stagesMs.length&&checkpoint.state.winner===null;stage++){
  const stats=[],game=play(checkpoint,{ms:protocol().extension.stagesMs[stage],plies:protocol().extension.extraPliesPerStage,stats});
  rows.push({id:source.game.id,stage,sourceSHA256:checkpointFingerprint(checkpoint),game,stats});save(name,rows);checkpoint=game;console.log('extension',index,stage,game.state.ply,game.state.scores,game.reason);
 }return rows;
}
export function fresh(index){
 persistLock();const seed=protocol().seeds[index];assert.ok(seed);const name=`fresh-${index}`,rows=existsSync(`${directory}/${name}.json.gz`)?load(name):[],done=new Set(rows.map(r=>r.game.id));
 const gs=plans().filter(g=>g.seed===seed); // Rotate pair order across seeds.
 gs.sort((a,b)=>(protocol().pairs.findIndex(p=>actionID(p)===actionID(a.research.labels))+index)%4-(protocol().pairs.findIndex(p=>actionID(p)===actionID(b.research.labels))+index)%4);
 for(const first of gs){if(done.has(first.id))continue;let game=first;const stats=[],stages=[];
  for(let stage=0;stage<protocol().freshStagesMs.length&&game.state.winner===null;stage++){
   const before=game;game=play(game,{ms:protocol().freshStagesMs[stage],plies:protocol().freshExtraPliesPerStage,stats});stages.push({stage,sourceSHA256:checkpointFingerprint(before),endingPly:game.state.ply,elapsedMs:game.elapsedMs-before.elapsedMs,reason:game.reason,winner:game.state.winner});
  }rows.push({game,stats,stages});save(name,rows);done.add(game.id);console.log('fresh',index,rows.length,'/16',game.state.ply,game.reason);
 }return rows;
}
// Independent bounded scoring oracle. Original terminal conditions stay in force.
export function forceCapture(s,actor,{horizon=3,maxNodes=100000,maxMs=1000,now=()=>performance.now(),children=referenceChildren}={}){
 const start=now(),base=s.scores[actor],cache=new Map();let nodes=0,stop=null;
 function solve(n,left){
  if(n.scores[actor]>base)return true;
  if(n.winner!==null||left===0)return false;
  if(nodes>=maxNodes){stop='nodes';return null;}if(now()-start>=maxMs){stop='time';return null;}
  const id=key(n)+':'+left;if(cache.has(id))return cache.get(id);nodes++;
  const cs=children(n);if(!cs.length)return false;
  let unknown=false;const own=n.turn===actor;
  for(const c of cs){const v=solve(c.n,left-1);if(v===null)unknown=true;else if(v===own){cache.set(id,own);return own;}}
  const result=unknown?null:!own;if(result!==null)cache.set(id,result);return result;
 }const result=solve(s,horizon);return {result,nodes,stop,elapsedMs:now()-start,horizon};
}
export function diagnose(game){
 let s=game.initial,quiet=0,longestQuiet=0,repeats=0,opportunities=0,declined=0,missedWins=0,close=false,leadChanges=0,lastLead=0;
 const seen=new Map(),behind=[false,false],sampleAt=new Set([Math.max(0,game.history.length-32),game.history.length]),samples=[];
 function sample(){const cs=referenceChildren(s),p=s.turn;
  const captures=cs.filter(c=>c.n.scores[p]>s.scores[p]),safe=cs.filter(c=>c.n.winner===p||!referenceChildren(c.n).some(r=>r.n.winner===1-p));
  const forced=forceCapture(s,p,protocol().diagnostic),other=forceCapture(s,1-p,protocol().diagnostic);
  const snapshot={ply:s.ply,state:s,legal:cs.length,captureActions:captures.length,safeActions:safe.length,forcedCapture:forced,opponentForcedCapture:other};
  samples.push(snapshot);
 }
 for(let i=0;i<=game.history.length;i++){
  const k=key(s),n=seen.get(k)??0;repeats+=Number(n>0);seen.set(k,n+1);
  if(sampleAt.has(i))sample();if(i===game.history.length)break;
  const h=game.history[i],cs=referenceChildren(s),c=cs.find(c=>actionID(c.a)===actionID(h.a));assert.ok(c);
  opportunities+=Number(cs.some(c=>c.n.scores[s.turn]>s.scores[s.turn]));declined+=Number(cs.some(c=>c.n.scores[s.turn]>s.scores[s.turn])&&!h.gain);missedWins+=Number(cs.some(c=>c.n.winner===s.turn)&&c.n.winner!==s.turn);
  quiet=h.gain?0:quiet+1;longestQuiet=Math.max(longestQuiet,quiet);s=c.n;
  const lead=Math.sign(s.scores[0]-s.scores[1]);if(lastLead&&lead&&lastLead!==lead)leadChanges++;if(lead)lastLead=lead;
  for(let p=0;p<2;p++)behind[p]||=s.scores[p]<s.scores[1-p];close||=s.scores.every(x=>x===(s.target??3)-1);
 }
 assert.deepEqual(s,game.state);
 return {id:game.id,plies:game.history.length,quiet,longestQuiet,repeatedStates:repeats,uniqueStates:seen.size,captureOpportunities:opportunities,declinedCapture:declined,immediateWinsMissed:missedWins,close,leadChanges,comebackWin:s.winner!==null&&behind[s.winner],samples};
}
export function diagnostics(){
 const rows=oldUnresolved().map((r,i)=>({index:i,source:diagnose(r.game),extensions:load(`extension-${i}`).map(e=>({stage:e.stage,diagnosis:diagnose(e.game)}))}));save('diagnosis',rows);return rows;
}
// Cheap independent legal replay also recomputes operational metrics from raw moves.
export function measure(game,stats=[]){
 let s=game.initial,quiet=0,longestQuiet=0,repeats=0,opportunities=0,declined=0,missed=0,close=false,lastLead=0,leadChanges=0;
 const states=new Set(),behind=[false,false];
 for(const h of game.history){const k=key(s);repeats+=Number(states.has(k));states.add(k);
  const cs=referenceChildren(s),c=cs.find(c=>actionID(c.a)===actionID(h.a));assert.ok(c);assert.equal(h.legal,cs.length);assert.equal(h.from,s.players[s.turn]);assert.equal(h.wallFrom,h.a.wall?s.walls[h.a.wall.wall]:null);
  const gain=c.n.scores[s.turn]>s.scores[s.turn],can=cs.some(c=>c.n.scores[s.turn]>s.scores[s.turn]),win=cs.some(c=>c.n.winner===s.turn);
  assert.equal(h.gain,gain);assert.equal(h.canScore,can);assert.equal(h.canWin,win);
  quiet=gain?0:quiet+1;longestQuiet=Math.max(quiet,longestQuiet);opportunities+=Number(can);declined+=Number(can&&!gain);missed+=Number(win&&c.n.winner!==s.turn);s=c.n;
  const lead=Math.sign(s.scores[0]-s.scores[1]);if(lastLead&&lead&&lead!==lastLead)leadChanges++;if(lead)lastLead=lead;
  for(let p=0;p<2;p++)behind[p]||=s.scores[p]<s.scores[1-p];close||=s.scores.every(x=>x===(s.target??3)-1);
 }
 repeats+=Number(states.has(key(s)));states.add(key(s));assert.deepEqual(s,game.state);assert.equal(game.reason==='win',s.winner!==null);
 const q=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*p)]:null;};
 return {id:game.id,plies:game.history.length,quiet,longestQuiet,repeatedStates:repeats,uniqueStates:states.size,captureOpportunities:opportunities,declinedCapture:declined,immediateWinsMissed:missed,close,leadChanges,comebackWin:s.winner!==null&&behind[s.winner],choiceProxyCount:stats.filter(r=>r.choiceProxy).length,moveMedianMs:q(stats.map(r=>r.elapsedMs),.5),moveP90Ms:q(stats.map(r=>r.elapsedMs),.9),incomplete:stats.filter(r=>!r.complete).length,statsCount:stats.length};
}
export function replayOne(g,stats,start=null){
 const checkpoint=start??makeInitial(g.seed,g.research.labels,g.experiment.positionSwap,g.starter);
 const actual=play(checkpoint,{ms:3600000,plies:g.state.ply-checkpoint.state.ply,replayStats:stats});
 for(const k of ['state','history','rngStates','visits','metrics','repetitionCount','lastLead'])assert.deepEqual(actual[k],g[k],k);return {id:g.id,gameSHA256:sha(g),statsSHA256:sha(stats),startSHA256:checkpointFingerprint(checkpoint),plies:g.state.ply-checkpoint.state.ply,matched:true};
}
export function replayIndex(index){
 const rows=load(`fresh-${index}`),name=`replay-fresh-${index}`,done=existsSync(`${directory}/${name}.json.gz`)?load(name):[];
 for(const r of rows){const old=done.find(d=>d.id===r.game.id);if(old){assert.equal(old.gameSHA256,sha(r.game));assert.equal(old.statsSHA256,sha(r.stats));continue;}done.push(replayOne(r.game,r.stats));save(name,done);}console.log('fresh replay',index,done.length);return done;
}
export function replayExtension(index){
 let start=oldUnresolved()[index].game;const out=[];
 for(const r of load(`extension-${index}`)){out.push(replayOne(r.game,r.stats,start));start=r.game;}save(`replay-extension-${index}`,out);console.log('extension replay',index,out.length);return out;
}
const q=(xs,p)=>{const a=[...xs].sort((a,b)=>a-b);return a.length?a[Math.floor((a.length-1)*p)]:null;};
export function summarize(rows){
 const gs=rows.map(r=>r.game),measured=rows.map(r=>measure(r.game,r.stats)),stats=rows.flatMap(r=>r.stats),n=gs.length,decided=gs.filter(g=>g.state.winner!==null);
 return {n,settled:decided.length,unresolved:n-decided.length,firstWins:decided.filter(g=>g.state.winner===g.starter).length,secondWins:decided.filter(g=>g.state.winner!==g.starter).length,slotWins:[0,1].map(slot=>decided.filter(g=>g.experiment.physicalSlots.indexOf(g.initial.players[g.state.winner])===slot).length),Dwin:decided.filter(g=>g.research.labels[g.state.winner]==='D').length,Awin:decided.filter(g=>g.research.labels[g.state.winner]==='A').length,
  plies:{median:q(measured.map(m=>m.plies),.5),p90:q(measured.map(m=>m.plies),.9),completedMedian:q(decided.map(g=>g.history.length),.5),completedP90:q(decided.map(g=>g.history.length),.9)},
  quiet:{median:q(measured.map(m=>m.longestQuiet),.5),p90:q(measured.map(m=>m.longestQuiet),.9)},repeatingGames:measured.filter(m=>m.repeatedStates>0).length,repeatEvents:measured.reduce((v,m)=>v+m.repeatedStates,0),comebacks:measured.filter(m=>m.comebackWin).length,close:measured.filter(m=>m.close).length,leadChanges:measured.reduce((v,m)=>v+m.leadChanges,0),proxyChoices:measured.reduce((v,m)=>v+m.choiceProxyCount,0),decisionCount:stats.length,
  declinedCapture:measured.reduce((v,m)=>v+m.declinedCapture,0),missedWins:measured.reduce((v,m)=>v+m.immediateWinsMissed,0),computeMs:gs.reduce((v,g)=>v+g.elapsedMs,0),moveMedianMs:q(stats.map(s=>s.elapsedMs),.5),moveP90Ms:q(stats.map(s=>s.elapsedMs),.9),maxSampledHeapBytes:Math.max(0,...stats.map(s=>s.sampledHeapPeak)),cumulativePeakRssKB:Math.max(0,...stats.map(s=>s.processPeakRssKB)),incompleteMoves:stats.filter(s=>!s.complete).length,diversity:audit(gs)};
}
export function blockEstimate(rows,value,seeds=protocol().seeds){
 const blocks=seeds.map(seed=>{const rs=rows.filter(r=>r.game.seed===seed);assert.ok(rs.length);return rs.reduce((n,r)=>n+value(r),0)/rs.length;}),mean=xs=>xs.reduce((a,b)=>a+b,0)/xs.length,rng=randomStream(protocol().statistics.bootstrapSeed),boots=[];
 for(let i=0;i<protocol().statistics.samples;i++)boots.push(mean(blocks.map(()=>blocks[Math.floor(rng()*blocks.length)])));
 let extreme=0;for(let mask=0;mask<2**blocks.length;mask++)extreme+=Number(Math.abs(mean(blocks.map((v,i)=>v*((mask>>i&1)?1:-1))))>=Math.abs(mean(blocks))-1e-12);
 return {mean:mean(blocks),bootstrap95:[q(boots,.025),q(boots,.975)],signFlipP:extreme/2**blocks.length,blocks};
}
export function verify({requireReplays=true}={}){
 persistLock();const rows=protocol().seeds.flatMap((_,i)=>load(`fresh-${i}`)),expected=plans();assert.equal(rows.length,192);assert.deepEqual(rows.map(r=>r.game.id).sort(),expected.map(g=>g.id).sort());
 for(const r of rows){const g=expected.find(g=>g.id===r.game.id);for(const k of ['initial','research','experiment','seed','starter','policies'])assert.deepEqual(r.game[k],g[k]);assert.equal(r.stats.length,r.game.history.length);assert.equal(r.stages.length,r.game.stages.length);for(let i=0;i<r.stages.length;i++){assert.equal(r.game.stages[i].timeBudgetMs,protocol().freshStagesMs[i]);assert.equal(r.stages[i].endingPly,r.game.stages[i].plies);if(i)assert.equal(r.game.stages[i-1].reason==='win',false);}measure(r.game,r.stats);}
 const extensionRows=[];
 for(let i=0;i<8;i++){let old=oldUnresolved()[i].game;const es=load(`extension-${i}`);for(const [stage,e] of es.entries()){
  assert.equal(e.stage,stage);assert.equal(e.sourceSHA256,checkpointFingerprint(old));assert.equal(e.id,old.id);assert.deepEqual(e.game.history.slice(0,old.history.length),old.history);for(const k of ['initial','research','experiment','seed','starter','policies','factorArm'])assert.deepEqual(e.game[k],old[k]);assert.equal(e.stats.length,e.game.history.length-old.history.length);assert.equal(e.game.stages.at(-1).timeBudgetMs,protocol().extension.stagesMs[stage]);measure(e.game,e.stats);old=e.game;extensionRows.push(e);
 }assert.ok(old.state.winner!==null||es.length===protocol().extension.stagesMs.length);}
 let replayCount=0;if(requireReplays){
  for(let i=0;i<protocol().seeds.length;i++){const rs=load(`fresh-${i}`),vs=load(`replay-fresh-${i}`);assert.equal(vs.length,rs.length);for(const r of rs){const v=vs.find(v=>v.id===r.game.id);assert.ok(v?.matched);assert.equal(v.gameSHA256,sha(r.game));assert.equal(v.statsSHA256,sha(r.stats));replayCount++;}}
  for(let i=0;i<8;i++){const rs=load(`extension-${i}`),vs=load(`replay-extension-${i}`);assert.equal(rs.length,vs.length);for(let j=0;j<rs.length;j++){assert.ok(vs[j].matched);assert.equal(vs[j].gameSHA256,sha(rs[j].game));assert.equal(vs[j].statsSHA256,sha(rs[j].stats));replayCount++;}}
 }
 const grouped=Object.fromEntries(protocol().pairs.map(pair=>[pair.join('/'),summarize(rows.filter(r=>actionID(r.game.research.labels)===actionID(pair)))]));
 const mixed=rows.filter(r=>r.game.research.labels[0]!==r.game.research.labels[1]),mixedDifference=blockEstimate(mixed,r=>r.game.state.winner===null?0:r.game.research.labels[r.game.state.winner]==='D'?1:-1);
 const settlement=blockEstimate(rows.filter(r=>r.game.research.labels[0]===r.game.research.labels[1]),r=>(r.game.state.winner===null?0:1)*(r.game.research.labels[0]==='D'?2:-2));
 const byFirstAI=Object.fromEntries(['A','D'].map(arm=>[arm,summarize(mixed.filter(r=>r.game.research.labels[r.game.starter]===arm))]));
 const extensions=oldUnresolved().map((r,i)=>({id:r.game.id,seed:r.game.seed,starter:r.game.starter,swap:r.game.experiment.positionSwap,sourcePly:r.game.state.ply,sourceScores:r.game.state.scores,sourceMetrics:measure(r.game),stages:load(`extension-${i}`).map(e=>({stage:e.stage,addedPlies:e.game.state.ply-(e.stage===0?r.game.state.ply:load(`extension-${i}`)[e.stage-1].game.state.ply),totalPlies:e.game.state.ply,addedMs:e.game.elapsedMs-(e.stage===0?r.game.elapsedMs:load(`extension-${i}`)[e.stage-1].game.elapsedMs),winner:e.game.state.winner,scores:e.game.state.scores,reason:e.game.reason,metrics:measure(e.game,e.stats)}))}));
 const resources=Object.fromEntries(['A','D'].map(arm=>{const ss=rows.flatMap(r=>r.stats).filter(s=>s.arm===arm);return [arm,{moves:ss.length,medianMs:q(ss.map(s=>s.elapsedMs),.5),p90Ms:q(ss.map(s=>s.elapsedMs),.9),featureMedianMs:q(ss.map(s=>s.featureMs),.5),medianSearchPositions:q(ss.map(s=>s.searchPositions),.5),maxSampledHeapBytes:ss.reduce((n,s)=>Math.max(n,s.sampledHeapPeak),0),cumulativePeakRssKB:ss.reduce((n,s)=>Math.max(n,s.processPeakRssKB),0),incomplete:ss.filter(s=>!s.complete).length}];}));
 const summary={planSHA256:sha(protocol()),ledger:{newInitialGames:192,freshInitialStages:192,freshContinuationStages:rows.reduce((n,r)=>n+r.stages.length-1,0),oldUnresolvedSources:8,oldExtensionStages:extensionRows.length,newInitialPlies:rows.reduce((n,r)=>n+r.game.history.length,0),oldAddedPlies:extensions.reduce((n,r)=>n+r.stages.at(-1).totalPlies-r.sourcePly,0),AIReplayTasks:replayCount},grouped,byFirstAI,mixedPool:summarize(mixed),resources,mixedDifference,settlementDifference: settlement,extensions};
 save('summary',summary);console.log(JSON.stringify({ledger:summary.ledger,grouped:Object.fromEntries(Object.entries(grouped).map(([k,r])=>[k,{settled:r.settled,u:r.unresolved,D:r.Dwin,A:r.Awin,first:r.firstWins,second:r.secondWins}])),mixedDifference,settlement}));return summary;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [flag,v]=process.argv.slice(2);if(flag==='--setup')persistLock();else if(flag==='--extend')extend(Number(v));else if(flag==='--fresh')fresh(Number(v));else if(flag==='--source-diagnose'){const rows=oldUnresolved().map(r=>diagnose(r.game));save('source-diagnosis',rows);console.log(rows.map(r=>({id:r.id,quiet:r.quiet,repeats:r.repeatedStates,samples:r.samples.map(s=>({ply:s.ply,safe:s.safeActions,legal:s.legal,forced:s.forcedCapture.result,other:s.opponentForcedCapture.result}))})));}else if(flag==='--diagnose')diagnostics();else if(flag==='--replay-fresh')replayIndex(Number(v));else if(flag==='--replay-extension')replayExtension(Number(v));else if(flag==='--verify')verify();else if(flag==='--summarize')verify({requireReplays:false});else throw Error('Specify study stage');}

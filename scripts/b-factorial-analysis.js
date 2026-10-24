import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {gunzipSync,gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {referenceChildren,sha} from './stall-research.js';
import {captureRoutes} from '../src/route-ai.js';
import {evaluate} from '../src/ai.js';
import {key,apply} from '../src/engine.js';
import {independentRoots,judgeChoice,seenAt,play,replayCheckpoint,plan} from './b-factorial-study.js';
import {factorValue} from './guard-ai.js';
import {checkpointFingerprint} from './trajectory-followup.js';
const dir='reports/b-factorial-2026-10-24',aid=a=>JSON.stringify(a),read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`)));
function save(n,x){const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);}
export function evaluateTerm(s,p,term){
 if(term==='both')return factorValue(s,p,true);
 const base=evaluate(s,p);if(term==='distance'||s.winner!==null)return base;
 const own=captureRoutes(s,p).size,opp=captureRoutes(s,1-p).size;
 if(term==='counts')return base+180*(own-opp);
 if(term==='threat')return base+(s.turn===p&&s.scores[p]===(s.target??3)-1&&own?20000:0)-(s.turn!==p&&s.scores[1-p]===(s.target??3)-1&&opp?20000:0);
 throw Error('Unknown term');
}
export function termChoice(s,actions,seen,term){
 const p=s.turn,cs=referenceChildren(s),scores=actions.map(a=>{
  const c=cs.find(c=>aid(c.a)===aid(a));assert.ok(c);const rs=referenceChildren(c.n),worst=rs.length?Math.min(...rs.map(r=>evaluateTerm(r.n,p,term))):evaluateTerm(c.n,p,term),repeat=(seen.get(key(c.n))??0)*130;
  return {action:a,root:evaluateTerm(c.n,p,term)-repeat,worst,value:.88*worst+.12*(evaluateTerm(c.n,p,term)-repeat)-repeat};});
 const win=actions.map(a=>cs.find(c=>aid(c.a)===aid(a))).find(c=>c.n.winner===p);
 return {action:win?.a??scores.reduce((a,b)=>b.value>a.value?b:a).action,scores};
}
export function ablations(){
 const rows=[];for(const kind of ['development','holdout'])for(const r of read(kind+'-forks').filter(r=>['A','B'].includes(r.arm))){
  const terms={};for(const term of ['distance','counts','threat','both']){
   const c=termChoice(r.checkpoint.state,r.probe.retainedActions,seenAt(r.checkpoint),term);
   terms[term]={...c,judgement:judgeChoice(r.truth,{...r.probe,action:c.action})};}
  rows.push({caseID:r.caseID,kind,keeper:r.arm==='B',completeStatic:true,terms});}
 save('term-ablations',rows);console.log('static component ablations',rows.length*4,'(not games)');return rows;
}
function compareReplay(actual,saved){for(const k of ['state','history','rngStates','visits','metrics','repetitionCount','lastLead'])assert.deepEqual(actual[k],saved[k],k);}
export function replayTasks(){
 const tasks=[];
 for(const kind of ['source-games','self-games'])for(const r of read(kind))tasks.push({id:kind+'/'+r.game.id,r,kind});
 for(const r of read('self-extensions'))tasks.push({id:'self-extension/'+r.game.id,r,kind:'self-extension'});
 for(const kind of ['development','holdout'])for(const r of read(kind+'-forks'))tasks.push({id:kind+'/'+r.id,r,kind});
 if(existsSync(`${dir}/fork-extensions.json.gz`))for(const e of read('fork-extensions')){const parent=read(e.kind+'-forks').find(r=>r.id===e.id);assert.ok(parent);tasks.push({id:'fork-extension/'+e.id,r:{...parent,checkpoint:parent.game,game:e.game,stats:e.stats},kind:'fork-extension'});}
 return tasks;
}
export function replayAI({shard=0,shards=1}={}){
 assert.ok(Number.isInteger(shards)&&shards>=1&&shards<=16&&Number.isInteger(shard)&&shard>=0&&shard<shards);
 const tasks=replayTasks().filter((_,i)=>i%shards===shard),ids=new Set(tasks.map(t=>t.id)),name=shards===1?'ai-replay':`ai-replay-part-${shard}-of-${shards}`;
 const prior=existsSync(`${dir}/${name}.json.gz`)?read(name):existsSync(`${dir}/ai-replay.json.gz`)?read('ai-replay'):[],old=prior.filter(r=>ids.has(r.id)),done=new Map(old.map(r=>[r.id,r])),rows=[...old];
 for(const t of tasks){const {r,kind}=t,content=sha(r);if(done.has(t.id)){assert.equal(done.get(t.id).contentSHA256,content);continue;}
  let actual;
  if(kind==='source-games'||kind==='self-games')actual=replayCheckpoint(r.game,r.game.state.ply,r.stats);
  else if(kind==='self-extension'){
   const start=read('self-games').find(x=>x.game.id===r.game.id).game;
   actual=play(start,{ms:3600000,plies:r.game.state.ply-start.state.ply,replayStats:r.stats});
  }else actual=play(r.checkpoint,{arm:r.arm,actor:r.actor,ms:3600000,plies:r.game.state.ply-r.checkpoint.state.ply,replayStats:r.stats});
  compareReplay(actual,r.game);
  if(kind==='source-games'&&r.extension){const before=replayCheckpoint(r.game,r.game.state.ply-r.extension.addedPlies,r.stats);assert.equal(checkpointFingerprint(before),r.extension.source);}
  rows.push({id:t.id,contentSHA256:content,plies:r.game.state.ply-(r.checkpoint?.state.ply??(kind==='self-extension'?read('self-games').find(x=>x.game.id===r.game.id).game.state.ply:r.game.initial.ply)),matched:true});
  done.set(t.id,rows.at(-1));save(name,rows);if(rows.length%8===0)console.log('AI replay shard',shard,rows.length,'/',tasks.length);
 }
 assert.equal(rows.length,tasks.length);console.log('all AI choices and RNG replayed',tasks.length);return rows;
}
export function mergeReplays(shards){
 const tasks=replayTasks(),parts=shards===1?[read('ai-replay')]:Array.from({length:shards},(_,i)=>read(`ai-replay-part-${i}-of-${shards}`)),all=parts.flat(),byID=new Map(all.map(r=>[r.id,r]));
 assert.equal(byID.size,all.length);assert.equal(all.length,tasks.length);
 for(const t of tasks){const r=byID.get(t.id);assert.ok(r&&r.matched);assert.equal(r.contentSHA256,sha(t.r));}
 const rows=tasks.map(t=>byID.get(t.id));save('ai-replay-verified',rows);console.log('Merged complete AI replays',rows.length);return rows;
}
export function verifyReplays(){
 const tasks=replayTasks(),rows=read('ai-replay-verified'),byID=new Map(rows.map(r=>[r.id,r]));
 assert.equal(byID.size,rows.length);assert.equal(rows.length,tasks.length);
 for(const t of tasks){const r=byID.get(t.id);assert.ok(r?.matched);assert.equal(r.contentSHA256,sha(t.r));}
 console.log('Verified replay manifest',rows.length);return rows;
}
export function safetyTrajectories(){
 const rows=[];
 for(const kind of ['development','holdout'])for(const r of read(kind+'-forks')){
  let s=r.checkpoint.state,checked=0,dangerous=0,avoidable=0,immediateWins=0,missedImmediateWins=0;
  for(const h of r.game.history.slice(r.checkpoint.history.length)){
   if(s.turn===r.actor){const cs=referenceChildren(s),c=cs.find(c=>aid(c.a)===aid(h.a));assert.ok(c);checked++;
    const wins=cs.some(c=>c.n.winner===s.turn);immediateWins+=Number(wins);missedImmediateWins+=Number(wins&&c.n.winner!==s.turn);
    if(c.n.winner===null&&s.scores[1-s.turn]===(s.target??3)-1&&referenceChildren(c.n).some(x=>x.n.winner===1-s.turn)){
     dangerous++;if(cs.some(c=>c.n.winner===s.turn||!referenceChildren(c.n).some(x=>x.n.winner===1-s.turn)))avoidable++;
    }
   }s=apply(s,h.a);
  }
  rows.push({id:r.id,kind,arm:r.arm,checked,dangerous,avoidable,immediateWins,missedImmediateWins});
 }save('trajectory-safety',rows);console.log('full fork safety censuses',rows.length);return rows;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const value=(flag,defaultValue)=>{const i=process.argv.indexOf(flag);return i<0?defaultValue:Number(process.argv[i+1]);};if(process.argv.includes('--ablate'))ablations();else if(process.argv.includes('--replay'))replayAI({shard:value('--shard',0),shards:value('--shards',1)});else if(process.argv.includes('--merge-replays'))mergeReplays(value('--shards',8));else if(process.argv.includes('--verify-replays'))verifyReplays();else if(process.argv.includes('--safety'))safetyTrajectories();else throw Error('Specify analysis stage');}

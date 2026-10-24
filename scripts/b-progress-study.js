import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {bFactorMove} from './b-factorial-ai.js';
import {progressMove} from './b-progress-ai.js';
import {advanceGame} from './tactics-completion.js';
import {oldUnresolved,readGzip,save,load,protocol,directory,measure} from './b-performance-study.js';
import {checkpointFingerprint} from './trajectory-followup.js';
import {sha,referenceChildren} from './stall-research.js';
const candidatePlan=()=>JSON.parse(readFileSync('reports/b-performance-2026-10-24-progress-plan.json','utf8'));
export function cases(kind){return kind==='development'?oldUnresolved().map(r=>({caseID:r.game.id,seed:r.game.seed,checkpoint:r.game,actor:null})):readGzip('reports/b-factorial-2026-10-24/holdout-cases.json.gz').rows.map(r=>({...r,actor:r.checkpoint.state.turn}));}
export function candidatePlay(cp,variant,actor,{ms,plies,stats=[],replayStats=null}){
 return advanceGame(cp,{timeBudgetMs:ms,maxPlies:cp.state.ply+plies,memoryBudgetMb:768,select:(s,_p,rng,seen)=>{
  const use=actor===null||s.turn===actor?variant:'A',saved=replayStats?.find(r=>r.ply===s.ply),opts={...protocol().moveBudget,trace:true,...(replayStats?{maxMs:3600000,maxRoots:saved?.complete===false?saved.rootEvaluated:Infinity}:{})};
  const r=use==='D-walk'?progressMove(s,rng,seen,opts):bFactorMove(s,use,rng,seen,opts),{retainedActions,rankedActions,scores,certificate,...sample}=r;
  stats.push({...sample,ply:s.ply,actor:s.turn,action:undefined});return r.action;
 }});
}
export function run(kind,part,parts=4){
 const cp=candidatePlan(),name=`progress-${kind}-${part}`,rows=existsSync(`${directory}/${name}.json.gz`)?load(name):[],done=new Set(rows.map(r=>r.id));
 for(const [i,c] of cases(kind).entries()){if(i%parts!==part)continue;for(let j=0;j<2;j++){
  const variant=['D','D-walk'][(i+j)%2],id=sha([cp,kind,c.caseID,variant]);if(done.has(id))continue;
  const stats=[],game=candidatePlay(c.checkpoint,variant,c.actor,{ms:cp[kind].ms,plies:cp[kind].plies,stats});
  rows.push({...c,id,kind,variant,sourceSHA256:checkpointFingerprint(c.checkpoint),game,stats});save(name,rows);done.add(id);console.log('progress',kind,part,rows.length,variant,game.state.ply,game.reason);
 }}return rows;
}
export function verifyCandidateRow(r){
 const original=cases(r.kind).find(c=>c.caseID===r.caseID);assert.ok(original);assert.equal(r.id,sha([candidatePlan(),r.kind,r.caseID,r.variant]));assert.equal(r.actor,original.actor);assert.equal(r.seed,original.seed);assert.equal(checkpointFingerprint(r.checkpoint),checkpointFingerprint(original.checkpoint));
 assert.equal(r.sourceSHA256,checkpointFingerprint(r.checkpoint));assert.deepEqual(r.game.history.slice(0,r.checkpoint.history.length),r.checkpoint.history);for(const k of ['initial','research','experiment','seed','starter','policies','factorArm'])assert.deepEqual(r.game[k],r.checkpoint[k]);assert.equal(r.stats.length,r.game.history.length-r.checkpoint.history.length);assert.equal(r.game.stages.at(-1).timeBudgetMs,candidatePlan()[r.kind].ms);measure(r.game,r.stats);
 let s=r.checkpoint.state,avoidable=0,missed=0,checked=0;for(const h of r.game.history.slice(r.checkpoint.history.length)){
  const cs=referenceChildren(s),c=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(h.a));assert.ok(c);
  if(r.actor===null||s.turn===r.actor){checked++;missed+=Number(cs.some(x=>x.n.winner===s.turn)&&c.n.winner!==s.turn);if(s.scores[1-s.turn]===(s.target??3)-1&&c.n.winner===null&&referenceChildren(c.n).some(x=>x.n.winner===1-s.turn))avoidable+=Number(cs.some(x=>x.n.winner===s.turn||!referenceChildren(x.n).some(y=>y.n.winner===1-s.turn)));}s=c.n;
 }return {checked,avoidable,missed};
}
export function verify(){const all=['development','holdout'].flatMap(kind=>Array.from({length:4},(_,i)=>load(`progress-${kind}-${i}`)).flat());
 assert.equal(all.length,80);assert.equal(new Set(all.map(r=>r.id)).size,80);
 for(const kind of ['development','holdout'])for(const c of cases(kind))for(const variant of ['D','D-walk'])assert.ok(all.some(r=>r.kind===kind&&r.caseID===c.caseID&&r.variant===variant));
 const result={planSHA256:sha(candidatePlan()),rows:all.map(r=>({id:r.id,kind:r.kind,variant:r.variant,caseID:r.caseID,seed:r.seed,winner:r.game.state.winner,actor:r.actor,sourceSHA256:r.sourceSHA256,addedPlies:r.game.state.ply-r.checkpoint.state.ply,elapsedMs:r.game.elapsedMs-r.checkpoint.elapsedMs,tieChanges:r.stats.filter(s=>s.tieChanged).length,safety:verifyCandidateRow(r)}))};save('progress-verification',result);console.log('candidate verified',all.length);return result;
}
export function verifyReplays(){let count=0;for(const kind of ['development','holdout'])for(let part=0;part<4;part++){const rs=load(`progress-${kind}-${part}`),vs=load(`progress-replay-${kind}-${part}`);assert.equal(rs.length,vs.length);assert.equal(new Set(vs.map(v=>v.id)).size,vs.length);for(const r of rs){const v=vs.find(v=>v.id===r.id);assert.ok(v?.matched);assert.equal(v.contentSHA256,sha(r));count++;}}assert.equal(count,80);console.log('Candidate AI replay manifest',count);return count;}
export function replay(kind,part){const rows=load(`progress-${kind}-${part}`),out=[];for(const r of rows){const game=candidatePlay(r.checkpoint,r.variant,r.actor,{ms:3600000,plies:r.game.state.ply-r.checkpoint.state.ply,replayStats:r.stats});for(const k of ['state','history','rngStates','visits','metrics','repetitionCount','lastLead'])assert.deepEqual(game[k],r.game[k]);out.push({id:r.id,contentSHA256:sha(r),matched:true});save(`progress-replay-${kind}-${part}`,out);}console.log('candidate replay',kind,part,out.length);return out;}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [flag,kind,p]=process.argv.slice(2);if(flag==='--run')run(kind,Number(p));else if(flag==='--verify')verify();else if(flag==='--verify-replays')verifyReplays();else if(flag==='--replay')replay(kind,Number(p));else throw Error('Specify candidate stage');}

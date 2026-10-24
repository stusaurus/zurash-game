import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {key} from '../src/engine.js';
import {randomStream} from './tactics-completion.js';
import {seenAt} from './b-factorial-study.js';
import {tieMove} from './d-walk-ties.js';
import {tieCases,protocol,load,save,oldSources} from './d-walk-study.js';
import {checkpointFingerprint} from './trajectory-followup.js';
import {sha,referenceChildren} from './stall-research.js';
import {tactical} from './b-performance-analysis.js';
import {measure} from './b-performance-study.js';
export function tieProbes(){const rows=[];for(const kind of ['development','holdout'])for(const c of tieCases(kind)){
 const cp=c.checkpoint,p=cp.state.turn,seen=seenAt(cp),probes=protocol().tieVariants.map(variant=>tieMove(cp.state,variant,randomStream(cp.rngStates[p]),seen,{...protocol().moveBudget,maxMs:3600000,trace:true})),base=probes[0];
 for(const r of probes){assert.deepEqual(r.retainedActions,base.retainedActions);assert.deepEqual(r.scores,base.scores);assert.equal(r.rngAfter,base.rngAfter);if(!r.immediateWin&&r.scores.length)assert.equal(r.scores.find(c=>JSON.stringify(c.action)===JSON.stringify(r.action)).value,Math.max(...base.scores.map(c=>c.value)));assert.ok(referenceChildren(cp.state).some(c=>JSON.stringify(c.a)===JSON.stringify(r.action)));}
 rows.push({kind,caseID:c.caseID,seed:c.seed,checkpointSHA256:checkpointFingerprint(cp),probes:probes.map((r,i)=>({variant:protocol().tieVariants[i],action:r.action,rngAfter:r.rngAfter,complete:r.complete,retainedActions:r.retainedActions,scores:r.scores,changedFromD:JSON.stringify(r.action)!==JSON.stringify(base.action)}))});
 }save('tie-probes',rows);console.log('Same candidate sets, values and RNG',rows.length*4);return rows;}
export function continuations(part){const originals=new Map(oldSources().map(r=>[r.game.id,r.game])),rows=load(`extension-${part}`).map(r=>{const m=measure(r.game,r.stats),t=tactical(r.game),source=originals.get(r.id),recent=t.rows.filter(t=>t.ply>=source.state.ply);return {id:r.id,stage:r.stage,contentSHA256:sha(r),metrics:m,tactics:recent,additionalMoves:r.game.history.length-source.history.length,additionalScores:r.game.history.slice(source.history.length).filter(h=>h.gain).length};});save(`analysis-extension-${part}`,rows);console.log('Continuation census',part,rows.length);return rows;}
export function forks(kind,part){const rows=load(`ties-${kind}-${part}`).map(r=>{const t=tactical(r.game).rows.filter(t=>t.ply>=r.checkpoint.state.ply).map(t=>({...t,AI:r.variant}));return {id:r.id,contentSHA256:sha(r),addedPlies:r.game.state.ply-r.checkpoint.state.ply,addedMs:r.game.elapsedMs-r.checkpoint.elapsedMs,tactics:t,changed:r.stats.filter(s=>s.tieChanged).length};});save(`analysis-ties-${kind}-${part}`,rows);console.log('Fork census',kind,part,rows.length);return rows;}
export function verify(){let n=0;const manifest=[];
 for(const kind of ['self','panel','extension','ties-development','ties-holdout']){const count=kind==='self'?12:kind==='panel'?8:kind==='extension'?6:4;for(let i=0;i<count;i++){const raw=load(`${kind}-${i}`),out=load(`analysis-${kind}-${i}`);assert.equal(raw.length,out.length);for(let j=0;j<raw.length;j++){assert.equal(out[j].contentSHA256,sha(raw[j]));assert.equal(out[j].id,kind==='self'||kind==='panel'?raw[j].game.id:raw[j].id);if(kind==='extension')assert.equal(out[j].stage,raw[j].stage);n++;}manifest.push({kind,index:i,archiveSHA256:sha(raw),analysisSHA256:sha(out),records:raw.length});}}
 const probes=load('tie-probes'),cases=['development','holdout'].flatMap(kind=>tieCases(kind).map(c=>({kind,...c})));assert.equal(probes.length,cases.length);for(const c of cases){const p=probes.find(p=>p.kind===c.kind&&p.caseID===c.caseID);assert.ok(p);assert.equal(p.checkpointSHA256,checkpointFingerprint(c.checkpoint));for(const r of p.probes){assert.deepEqual(r.scores,p.probes[0].scores);assert.deepEqual(r.retainedActions,p.probes[0].retainedActions);assert.equal(r.rngAfter,p.probes[0].rngAfter);}}
 const result={planSHA256:sha(protocol()),records:n,manifest,probesSHA256:sha(probes)};save('analysis-manifest',result);console.log('Analysis manifest verified',n);return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const [flag,a,b]=process.argv.slice(2);if(flag==='--probes')tieProbes();else if(flag==='--extension')continuations(Number(a));else if(flag==='--forks')forks(a,Number(b));else if(flag==='--verify')verify();else throw Error('Specify analysis');}

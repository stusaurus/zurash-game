import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {bFactorMove} from '../scripts/b-factorial-ai.js';
import {independentRoots,judgeChoice,verifyResearchGame} from '../scripts/b-factorial-study.js';
import {randomStream} from '../scripts/tactics-completion.js';
import {referenceChildren} from '../scripts/stall-research.js';
import {factorValue} from '../scripts/guard-ai.js';
import {evaluateTerm} from '../scripts/b-factorial-analysis.js';
const cases=JSON.parse(gunzipSync(Buffer.from(readFileSync(new URL('../reports/trajectory-followup-2026-10-23/B-cases.json.gz.b64',import.meta.url),'utf8'),'base64')));
test('unshielded baseline reproduces the three excluded safety beams; keeper restores them independently',()=>{
 const ranks=[];
 for(const c of cases.filter(c=>c.probes.find(p=>p.variant==='archived').loss.avoidableImmediateLoss)){
  const cp=c.checkpoint,seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),truth=independentRoots(cp.state),rs={};
  for(const arm of ['A','B','C','D'])rs[arm]=bFactorMove(cp.state,arm,randomStream(cp.rngStates[cp.state.turn]),seen,{trace:true,maxMs:3600000});
  const rank=rs.A.rankedActions.findIndex(a=>truth.safe.some(b=>JSON.stringify(a)===JSON.stringify(b)))+1;ranks.push(rank);
  assert.equal(judgeChoice(truth,rs.A).anySafeRetained,false);assert.equal(judgeChoice(truth,rs.C).anySafeRetained,false);
  for(const arm of ['B','D']){assert.equal(judgeChoice(truth,rs[arm]).anySafeRetained,true);assert.equal(judgeChoice(truth,rs[arm]).avoidableDanger,false);}
  for(const [a,b] of [['A','C'],['B','D']]){assert.deepEqual(rs[a].retainedActions,rs[b].retainedActions);assert.equal(rs[a].rngAfter,rs[b].rngAfter);}
 }
 assert.deepEqual(ranks.sort((a,b)=>a-b),[17,23,24]);
});
test('four-arm complete search agrees with independent full-reply minimization',()=>{
 const s={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],walls:[4],stars:[0,3,8],scores:[0,0],target:2,turn:0,ply:0,winner:null},before=structuredClone(s);
 for(const arm of ['A','B','C','D']){
  const r=bFactorMove(s,arm,randomStream(71),new Map(),{trace:true}),cs=referenceChildren(s),routes=['C','D'].includes(arm);
  const values=r.retainedActions.map(a=>{const c=cs.find(c=>JSON.stringify(c.a)===JSON.stringify(a)),replies=referenceChildren(c.n),worst=replies.length?Math.min(...replies.map(x=>factorValue(x.n,0,routes))):factorValue(c.n,0,routes);return {a,v:.88*worst+.12*factorValue(c.n,0,routes)};});
  assert.deepEqual(r.action,values.reduce((a,b)=>b.v>a.v?b:a).a);assert.equal(r.complete,true);assert.ok(r.searchPositions>=r.rootEvaluated);
 }
 assert.deepEqual(s,before);
});
test('budget exhaustion is explicit and never promotes a partial root value to an exact score',()=>{
 const s={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],walls:[4],stars:[0,3,8],scores:[0,0],target:2,turn:0,ply:0,winner:null};
 const r=bFactorMove(s,'D',randomStream(1),new Map(),{trace:true,maxLeaves:1});
 assert.equal(r.complete,false);assert.ok(r.leafEvaluations<=1);assert.equal(r.scores.length,r.rootEvaluated);assert.ok(referenceChildren(s).some(c=>JSON.stringify(c.a)===JSON.stringify(r.action)));
 assert.throws(()=>bFactorMove(s,'D',randomStream(1),new Map(),{maxLeaves:0}),/Invalid/);
});
test('time-limited evaluated-root checkpoint replays the same partial search without repeating wall-clock timing',()=>{
 const s={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],walls:[4],stars:[0,3,8],scores:[0,0],target:2,turn:0,ply:0,winner:null};let tick=0;
 const original=bFactorMove(s,'D',randomStream(17),new Map(),{trace:true,maxMs:3,now:()=>tick++});
 assert.equal(original.complete,false);assert.ok(original.rootEvaluated>0);
 const replay=bFactorMove(s,'D',randomStream(17),new Map(),{trace:true,maxRoots:original.rootEvaluated,maxMs:3600000});
 for(const k of ['action','scores','rngAfter','complete','searchPositions'])assert.deepEqual(replay[k],original[k]);
});
test('static component ablation preserves the complete route evaluator and terminal priority',()=>{
 const cp=cases[0].checkpoint,s=cp.state;
 for(const n of [s,...referenceChildren(s).slice(0,8).map(c=>c.n)])for(const p of [0,1]){
  assert.equal(evaluateTerm(n,p,'both'),factorValue(n,p,true));
  assert.equal(evaluateTerm(n,p,'counts')+evaluateTerm(n,p,'threat')-evaluateTerm(n,p,'distance'),evaluateTerm(n,p,'both'));
 }
 const win={...s,winner:s.turn};assert.equal(evaluateTerm(win,s.turn,'counts'),100000);assert.equal(evaluateTerm(win,1-s.turn,'threat'),-100000);
});
test('research metadata adapter validates actual identities and never conceals a changed rule or carrier',()=>{
 const rows=JSON.parse(gunzipSync(readFileSync(new URL('../reports/b-factorial-2026-10-24/source-games.json.gz',import.meta.url)))),g=rows[0].game,before=structuredClone(g);
 verifyResearchGame(g);assert.deepEqual(g,before);
 const wrongIdentity=structuredClone(g);wrongIdentity.factorArm='D';assert.throws(()=>verifyResearchGame(wrongIdentity));
 const wrongRule=structuredClone(g);wrongRule.experiment.regime='control-no-wall';assert.throws(()=>verifyResearchGame(wrongRule));
 const wrongCarrier=structuredClone(g);wrongCarrier.policies[0]='star';assert.throws(()=>verifyResearchGame(wrongCarrier));
});

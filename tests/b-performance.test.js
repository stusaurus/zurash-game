import test from 'node:test';
import assert from 'node:assert/strict';
import {forceCapture,makeInitial,plans,measure,readGzip} from '../scripts/b-performance-study.js';
import {walkingDistance,progressMove} from '../scripts/b-progress-ai.js';
import {bFactorMove} from '../scripts/b-factorial-ai.js';
import {independentRoots,judgeChoice} from '../scripts/b-factorial-study.js';
import {randomStream} from '../scripts/tactics-completion.js';
import {referenceChildren} from '../scripts/stall-research.js';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
const tiny={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],walls:[4],stars:[0,8],scores:[0,0],target:1,turn:0,ply:0,winner:null};
test('scoring oracle distinguishes a point, a horizon cutoff, a terminal loss and a resource cutoff',()=>{
 assert.equal(forceCapture(tiny,0,{horizon:1}).result,true);
 assert.equal(forceCapture(tiny,0,{horizon:0}).result,false);
 assert.equal(forceCapture({...tiny,winner:1},0).result,false);
 assert.equal(forceCapture(tiny,0,{maxNodes:0}).result,null);
 assert.equal(forceCapture(tiny,0,{maxNodes:0}).stop,'nodes');
});
test('walking progress distance respects masks and blockers and does not move or collect stars',()=>{
 const s={...tiny,players:[6,2],stars:[0]},before=structuredClone(s);assert.equal(walkingDistance(s,0),2);assert.deepEqual(s,before);
 assert.equal(walkingDistance({...s,playableCells:[0,1,2,4,6,7,8],walls:[4,7]},0),10);
});
test('a cooperative scoring branch is not a forced scoring preparation',()=>{
 const node=(id,turn,score=0)=>({...tiny,players:[id,8],turn,scores:[score,0],stars:[7],width:9,height:1,playableCells:[0,1,2,3,4,5,6,7,8]});
 const root=node(0,0),reply=node(1,1),good=node(2,0),bad=node(3,0),point=node(4,1,1),tree=new Map([[0,[reply]],[1,[good,bad]],[2,[point]],[3,[]]]),children=s=>(tree.get(s.players[0])??[]).map(n=>({n}));
 assert.equal(forceCapture(root,0,{horizon:3,children}).result,false);
 tree.set(1,[good]);assert.equal(forceCapture(root,0,{horizon:3,children}).result,true);
});
test('tie-only progress preserves the three ranked safety regressions, RNG and D minimax maximum',()=>{
 const cs=JSON.parse(gunzipSync(Buffer.from(readFileSync(new URL('../reports/trajectory-followup-2026-10-23/B-cases.json.gz.b64',import.meta.url),'utf8'),'base64')));
 let checked=0;for(const c of cs.filter(c=>c.probes.find(p=>p.variant==='archived').loss.avoidableImmediateLoss)){
  const cp=c.checkpoint,seen=new Map(cp.visits.map(([k,v])=>[k,v.count])),before=structuredClone(cp.state),opts={maxMs:3600000,trace:true};
  const d=bFactorMove(cp.state,'D',randomStream(cp.rngStates[cp.state.turn]),seen,opts),r=progressMove(cp.state,randomStream(cp.rngStates[cp.state.turn]),seen,opts);
  assert.deepEqual(r.retainedActions,d.retainedActions);assert.equal(r.rngAfter,d.rngAfter);assert.equal(judgeChoice(independentRoots(cp.state),r).avoidableDanger,false);
  if(d.scores.length)assert.equal(r.scores.find(x=>JSON.stringify(x.action)===JSON.stringify(r.action)).value,Math.max(...d.scores.map(x=>x.value)));
  assert.deepEqual(cp.state,before);checked++;
 }assert.equal(checked,3);
});
test('tie-only progress keeps immediate wins and explicit incomplete-root fallbacks',()=>{
 const d=bFactorMove(tiny,'D',randomStream(71),new Map(),{trace:true}),r=progressMove(tiny,randomStream(71),new Map());assert.deepEqual(r.action,d.action);assert.equal(r.immediateWin,true);
 const n={...tiny,stars:[0,3,8],target:2},a=bFactorMove(n,'D',randomStream(5),new Map(),{trace:true,maxLeaves:1}),b=progressMove(n,randomStream(5),new Map(),{maxLeaves:1});assert.equal(b.complete,false);assert.deepEqual(a.action,b.action);
});
test('crossed matchup plans preserve actual first-player AI and do not duplicate initial IDs',()=>{
 const gs=plans();assert.equal(gs.length,192);assert.equal(new Set(gs.map(g=>g.id)).size,192);
 const g=makeInitial(2412001,['D','A'],true,1);assert.equal(g.research.policyByActor[g.starter],'A');assert.deepEqual(g.experiment.physicalSlots,[72,8]);
});
test('raw legal replay rejects corrupt records and includes trailing quiet turns',()=>{
 const row=readGzip(new URL('../reports/b-factorial-2026-10-24/source-games.json.gz',import.meta.url))[0],g=structuredClone(row.game),m=measure(g);assert.ok(m.longestQuiet>=m.quiet);
 g.history[0].legal++;assert.throws(()=>measure(g));assert.ok(referenceChildren(tiny).length>0);
});

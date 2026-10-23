import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceGames,checkpointAt,immediateLossCensus,forcedThreeAction,diagnosticMove,positionPairs,makePlan} from '../scripts/trajectory-followup.js';
import {referenceChildren} from '../scripts/stall-research.js';
import {randomStream} from '../scripts/tactics-completion.js';
import {auditFixedFirst} from '../scripts/b-followup.js';
const late={width:9,height:9,playableCells:Array.from({length:81},(_,i)=>i),players:[53,10],walls:[41,40,62,55,74,67,43,1,61,20],stars:[12],target:3,scores:[2,2],turn:1,ply:101,winner:null};
test('research tactical selector finds the independently verified double-stopper preparation',()=>{
 const a=forcedThreeAction(late);assert.equal(a.plies,3);assert.equal(auditFixedFirst(late,a.action).forcedWithinThreeAfterThisAction,true);
 const r=diagnosticMove(late,'tactical3',randomStream(99));assert.equal(r.forced,3);assert.equal(auditFixedFirst(late,r.action).forcedWithinThreeAfterThisAction,true);
});
test('loss census quantifiers agree with all independent replies and preserve safe alternatives',()=>{
 const cs=referenceChildren(late);let checked=0;
 for(const c of cs.slice(0,8)){const r=immediateLossCensus(late,c.a);assert.equal(r.legal,cs.length);const expected=cs.filter(n=>n.n.winner!==null||!referenceChildren(n.n).some(x=>x.n.winner===0));assert.equal(r.safe,expected.length);assert.equal(r.selectedAllowsImmediateLoss,c.n.winner===null&&referenceChildren(c.n).some(x=>x.n.winner===0));checked++;}assert.equal(checked,8);
});
test('checkpoint replay restores recorded prefix and actor RNG, without mutating the source',()=>{
 const g=sourceGames().find(g=>g.experiment.boardId==='B'&&g.state.winner===g.starter&&g.experiment.pair.join('/')==='search/search'),before=structuredClone(g);
 const checkpoint=checkpointAt(g,Math.min(3,g.history.length));assert.deepEqual(checkpoint.history,g.history.slice(0,3));assert.deepEqual(g,before);assert.equal(checkpoint.state.ply,3);
});
test('D paired census has both swapped positions and rejects missing counterparts',()=>{
 const gs=sourceGames().filter(g=>g.experiment.boardId==='D'),pairs=positionPairs(gs);assert.equal(pairs.length,40);assert.ok(pairs.every(p=>p.outcomes.length===2));assert.throws(()=>positionPairs(gs.slice(1)),/both swaps/);
});
test('plan separates all original IDs, 48 new D starts and B counterfactuals',()=>{
 const source=sourceGames(),plan=makePlan(source);assert.equal(plan.sourceGames,400);assert.equal(plan.B.ids.length,9);assert.equal(plan.continuation.ids.length,122);assert.equal(new Set(plan.continuation.ids).size,122);assert.ok(plan.continuation.ids.every(id=>source.find(g=>g.id===id).state.winner===null));
});
test('saved B defense regression: route evaluation prevents the archived avoidable immediate loss',()=>{
 const g=sourceGames().find(g=>g.id.startsWith('s-2af739293421')),cp=checkpointAt(g,35),seen=new Map(cp.visits.map(([k,v])=>[k,v.count]));
 const a=diagnosticMove(cp.state,'archived',randomStream(cp.rngStates[cp.state.turn]),seen),b=diagnosticMove(cp.state,'routes2',randomStream(cp.rngStates[cp.state.turn]),seen);
 assert.equal(immediateLossCensus(cp.state,a.action).avoidableImmediateLoss,true);assert.equal(immediateLossCensus(cp.state,b.action).selectedAllowsImmediateLoss,false);
});
test('node exhaustion is explicitly incomplete rather than an exact search result',()=>{
 const g=sourceGames().find(g=>g.experiment.boardId==='B'),r=diagnosticMove(g.initial,'wide2',randomStream(19),new Map(),{nodeBudget:1});assert.equal(r.complete,false);assert.ok(r.action);assert.ok(r.nodes>1);
});
test('checkpoint identity excludes elapsed runtime and includes random state',async()=>{
 const {checkpointFingerprint}=await import('../scripts/trajectory-followup.js');const g=checkpointAt(sourceGames().find(g=>g.experiment.boardId==='B'),1);
 assert.equal(checkpointFingerprint(g),checkpointFingerprint({...g,elapsedMs:g.elapsedMs+999,stages:[]}));assert.notEqual(checkpointFingerprint(g),checkpointFingerprint({...g,rngStates:[1,2]}));
});

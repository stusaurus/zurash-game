import test from 'node:test';
import assert from 'node:assert/strict';
import {continuationPlan,verifyExtension,modeResults} from '../scripts/mode-continuation.js';
import {researchPlans,newResearchGame,advanceResearch} from '../scripts/stall-research.js';
const board={width:4,height:4,playableCells:[0,3,4,7,8,11,12,13,14,15],target:3,walls:[14,8],stars:[12,11,3,4,13],players:[0,15],scores:[0,0],turn:0,ply:0,winner:null};
function fixture(id='mode-E'){
 const plan=researchPlans({id,board},{stage:'stall-holdout',seeds:[id==='mode-E'?2381:id==='mode-A'?2383:id==='mode-B'?2387:2399],pairs:[['repeat','score']]}).at(0);
 return advanceResearch(newResearchGame(plan),{maxPlies:4,timeBudgetMs:10000});
}
test('continuation freezes only unfinished mode IDs and prioritizes E without creating games',()=>{
 const a=fixture(),b=fixture('mode-A'),done=fixture('mode-B'),other=fixture('other');done.state.winner=0;
 const p=continuationPlan([b,done,other,a]);assert.deepEqual(p.selectedIDs,[a.id,b.id]);assert.equal(p.newGames,0);assert.throws(()=>continuationPlan([a,a]),/Duplicate/);assert.deepEqual(continuationPlan([b,done,other,a]),p);
});
test('continuation verifies added reference moves, source prefix, RNG and policy identity',()=>{
 const a=fixture(),b=advanceResearch(a,{maxPlies:16,timeBudgetMs:10000});const audit=verifyExtension(a,b);assert.equal(audit.addedPlies,12);assert.deepEqual(audit.beforeRNG,a.rngStates);assert.equal(audit.settled,false);
 const altered=structuredClone(b);altered.research.policyByActor.reverse();assert.throws(()=>verifyExtension(a,altered),/policy/);
 const corrupted=structuredClone(b);corrupted.history[5].gain=true;assert.throws(()=>verifyExtension(a,corrupted));
});
test('same IDs remain one game after repeated inspection; unresolved stays unresolved',()=>{
 const a=fixture(),b=advanceResearch(a,{maxPlies:12,timeBudgetMs:10000});const first=modeResults([a],[b]),again=modeResults([a],[b]);assert.equal(first.uniqueGamesAfter,1);assert.equal(first.newGames,0);assert.equal(first.continued,1);assert.equal(first.newlySettled,0);assert.equal(first.rows.find(r=>r.id==='mode-E').after.unresolved,1);assert.deepEqual(first,again);assert.throws(()=>modeResults([a],[b,b]),/Duplicate/);
});

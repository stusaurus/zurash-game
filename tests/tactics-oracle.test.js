import test from 'node:test';
import assert from 'node:assert/strict';
import {successors,apply,initial} from '../src/engine.js';
import {prove,canonical} from '../scripts/tactics-proof.js';
import {oracleChildren,oracleValue} from './tactics-oracle.js';
import {CANDIDATES,makeCandidate} from '../scripts/tactics-candidates.js';
function small(seed){
  const cells=Array.from({length:9},(_,i)=>i);
  let r=seed;for(let i=8;i>0;i--){r=(Math.imul(r,1664525)+1013904223)>>>0;const j=r%(i+1);[cells[i],cells[j]]=[cells[j],cells[i]];}
  return {size:3,target:2,players:cells.slice(0,2),walls:cells.slice(2,4),stars:cells.slice(4,7),scores:[seed%2,(seed>>1)%2],turn:seed%2,ply:0,winner:null};
}
test('independent legal turns and transitions match engine on 3x3, Sprint and candidates',()=>{
  const fixtures=[...Array.from({length:80},(_,i)=>small(i+1)),initial(),...CANDIDATES.map(c=>makeCandidate(c,42))];
  for(const s of fixtures){assert.deepEqual(successors(s),oracleChildren(s));for(const {a,n} of successors(s))assert.deepEqual(apply(s,a),n);}
});
test('alpha beta, horizon bound and transpositions match exhaustive independent minimax',()=>{
  for(let seed=1;seed<=32;seed++)for(const horizon of [0,1,2,3,4]){
    const s=small(seed),expected=oracleValue(s,horizon);
    for(const alphaBeta of [false,true])for(const horizonPruning of [false,true]){
      const r=prove(s,{horizon,alphaBeta,horizonPruning,nodeBudget:100000,timeBudgetMs:10000});
      assert.equal(r.result,expected,JSON.stringify({seed,horizon,alphaBeta,horizonPruning}));
    }
  }
});
test('canonicalization ignores wall identities, preserves player, score, target and turn',()=>{
  const s=initial();assert.equal(canonical(s,3,0),canonical({...s,walls:[...s.walls].reverse()},3,0));
  for(const patch of [{turn:1},{scores:[1,0]},{target:4},{players:[...s.players].reverse()},{size:8}])assert.notEqual(canonical(s,3,0),canonical({...s,...patch},3,0));
});
test('star-count bound proves only finite-horizon nondecision',()=>{
  for(const c of CANDIDATES){const r=prove(makeCandidate(c,42),{horizon:2*c.target-2,nodeBudget:1});assert.equal(r.result,0);assert.equal(r.status,'finite-horizon-only');assert.equal(r.nodes,0);}
});
test('bounded cache and node exhaustion never promote unknown to a draw',()=>{
  const s=initial();const r=prove(s,{horizon:120,nodeBudget:1,maxTableEntries:1,horizonPruning:false});
  assert.equal(r.result,null);assert.equal(r.stopReason,'nodes');assert.ok(r.statesCached<=1);
});
test('reachable child positions agree with independent depth-three search',()=>{
  let checked=0;
  for(let seed=1;seed<=16;seed++)for(const {n} of oracleChildren({...small(seed),scores:[0,0]}).slice(0,5)){
    const expected=oracleValue(n,3);
    assert.equal(prove(n,{horizon:3,nodeBudget:100000}).result,expected);
    assert.equal(prove({...n,walls:[...n.walls].reverse()},{horizon:3,nodeBudget:100000}).result,expected);
    checked++;
  }
  assert.ok(checked>20);
});
test('time limit produces unknown and table size is bounded without changing results',()=>{
  const r=prove(initial(),{horizon:120,timeBudgetMs:1,nodeBudget:1000000});
  assert.equal(r.result,null);assert.equal(r.stopReason,'time');
  const tiny=prove(initial(),{horizon:3,horizonPruning:false,maxTableEntries:1});
  assert.equal(tiny.result,oracleValue(initial(),3));assert.ok(tiny.statesCached<=1);
});
test('rejects invalid proof budgets',()=>{
  for(const limits of [{horizon:121},{horizon:-1},{nodeBudget:0},{timeBudgetMs:0},{maxTableEntries:0},{memoryBudgetMb:0}])assert.throws(()=>prove(initial(),limits),/Invalid proof limits/);
});
test('narrowed alpha-beta windows do not turn child bounds into exact values',()=>{
 for(let seed=1;seed<=128;seed++){
  const s={...small(seed),scores:[0,0]};
  const expected=oracleValue(s,6);
  assert.equal(prove(s,{horizon:6,nodeBudget:1000000,timeBudgetMs:10000}).result,expected,`seed ${seed}`);
 }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {makeOracle,auditPosition,transformState,domainStates,CONTRACT_SPEC} from '../scripts/guard-contract.js';
import {inventory} from '../scripts/guard-ai.js';
import {referenceChildren} from '../scripts/stall-research.js';

test('bounded oracle requires all opponent replies, not a cooperative win path',()=>{
 const state=(id,turn,winner=null)=>({id,turn,winner,players:[id,0],walls:[],stars:[],scores:[0,0],width:1,height:1,target:1});
 const root=state(0,0),after=state(1,1),good=state(2,0),bad=state(3,0),win=state(4,0,0);
 const tree=new Map([[0,[after]],[1,[good,bad]],[2,[win]],[3,[]]]);
 const oracle=makeOracle(s=>(tree.get(s.id)??[]).map(n=>({a:null,n})));
 assert.equal(oracle.wins(root,0,3),false);
 tree.set(1,[good]);assert.equal(makeOracle(s=>(tree.get(s.id)??[]).map(n=>({n}))).wins(root,0,3),true);
});
test('bounded oracle distinguishes horizon exhaustion, terminal victory, and nonterminal dead ends',()=>{
 const s={width:1,height:1,players:[0,1],walls:[],stars:[],scores:[0,0],target:1,turn:0,winner:null};
 const oracle=makeOracle(()=>[]);
 assert.equal(oracle.wins(s,0,3),false);
 assert.equal(oracle.wins({...s,winner:0},0,0),true);
 assert.equal(oracle.wins({...s,winner:1},0,3),false);
 assert.equal(oracle.wins(s,0,0),false);
});
test('oracle cache separates legacy size-only boards with different one-ply results',()=>{
 const small={size:3,players:[6,2],walls:[4],stars:[0,8],scores:[0,0],target:1,turn:0,ply:0,winner:null},large={...small,size:4},oracle=makeOracle();
 assert.equal(oracle.wins(small,0,1),true);
 assert.equal(oracle.wins(large,0,1),false);
 assert.equal(makeOracle().wins(large,0,1),false);
});
test('masked multiple-wall tactical checks survive reflection and player relabelling',()=>{
 const s={width:3,height:3,playableCells:[0,1,2,3,5,6,7,8],players:[6,2],walls:[1,7],stars:[0,8],scores:[1,1],target:2,turn:0,ply:0,winner:null};
 const original=auditPosition(s);
 assert.ok(original.legal>0);
 for(const kind of ['reflect-x','rotate-180','swap-actors']){
  const transformed=transformState(s,kind),r=auditPosition(transformed);
  for(const k of ['legal','safe','captures','canForce','hasSafetyChoice'])assert.equal(r[k],original[k]);
  assert.equal(referenceChildren(transformed).length,original.legal);
 }
});
test('audit rejects missed captures and false forced-win certificates',()=>{
 const s={width:3,height:3,playableCells:[0,1,2,3,4,5,6,7,8],players:[6,2],walls:[4],stars:[0,8],scores:[0,0],target:3,turn:0,ply:0,winner:null};
 assert.equal(auditPosition(s).canForce,false);
 assert.throws(()=>auditPosition(s,makeOracle(),{routeFinder:()=>new Map()}),/capture-route set mismatch/);
 assert.throws(()=>auditPosition(s,makeOracle(),{forceFinder:n=>({action:referenceChildren(n)[0].a,plies:3})}),/three-ply verdict mismatch/);
});
test('audit rejects a beam that reintroduces an unsafe root despite a safe alternative',()=>{
 for(const s of domainStates(CONTRACT_SPEC.domains[0])){
  if(!auditPosition(s).hasSafetyChoice)continue;
  const unsafeKeeper=(...args)=>{const inv=inventory(...args);return {...inv,retained:inv.rows};};
  assert.throws(()=>auditPosition(s,makeOracle(),{keeper:unsafeKeeper}),/unsafe root survived/);return;
 }
 assert.fail('No safety-choice fixture found');
});

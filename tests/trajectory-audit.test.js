import test from 'node:test';
import assert from 'node:assert/strict';
import {audit,diversity,traceKey} from '../scripts/trajectory-audit.js';
import {initial} from '../src/engine.js';
const game=(actions,winner=0)=>({initial:initial(),history:actions.map(a=>({a})),starter:0,state:{winner}});
test('duplicate completed trajectories are counted once; censored prefixes never count as losses',()=>{
 const a={dir:1,wall:null},b={dir:2,wall:null};
 const r=audit([game([a,b]),game([a,b]),game([a],null)]);
 assert.equal(r.completed.unique,1);assert.equal(r.completed.repeatedRecords,1);assert.deepEqual(r.uniqueCompletedOutcomes,{first:1,second:0});assert.equal(r.censored,1);
 assert.deepEqual(diversity([game([a])],5),{eligible:0,tooShort:1,unique:0,repeatedRecords:0,maxMultiplicity:0});
});
test('initial turn and physical player assignment are part of trace identity',()=>{
 const a=game([{dir:1,wall:null}]);
 assert.notEqual(traceKey(a),traceKey({...a,initial:{...a.initial,turn:1}}));
 assert.notEqual(traceKey(a),traceKey({...a,initial:{...a.initial,players:[...a.initial.players].reverse()}}));
});

test('actor relabeling does not manufacture physical trajectory diversity',()=>{
 const a=game([{dir:1,wall:null}]);
 const b={...a,initial:{...a.initial,players:[...a.initial.players].reverse(),scores:[...a.initial.scores].reverse(),turn:1-a.initial.turn}};
 assert.notEqual(traceKey(a),traceKey(b));assert.equal(traceKey(a,Infinity,true),traceKey(b,Infinity,true));
});

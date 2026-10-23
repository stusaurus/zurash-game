import test from "node:test";
import assert from "node:assert/strict";
import { initial, successors } from "../src/engine.js";
import { examine } from "../scripts/tactics-search.js";

test("enumerates every legal opening without sampling", () => {
  const state = initial(0);
  const result = examine(state, 1, 100000);
  assert.equal(result.legalMoves, successors(state).length);
  assert.equal(result.moves.length, result.legalMoves);
  assert.equal(result.complete, true);
  assert.ok(result.moves.every(x => Number.isFinite(x.score)));
});

test("marks a budget-limited search as incomplete", () => {
  const result = examine(initial(0), 2, 1);
  assert.equal(result.complete, false);
  assert.ok(result.legalMoves > 0);
});

test("prefers an immediately winning legal action", () => {
  const s = initial(0);
  const win = successors(s).find(x => x.n.scores[0] > s.scores[0]);
  if (!win) return;
  const near = {...s, scores: [s.target - 1, 0]};
  const result = examine(near, 1, 100000);
  assert.equal(result.complete, true);
  assert.ok(result.moves.some(x => x.score === 100000));
  assert.equal(result.moves[0].score, 100000);
});

test('transposition bounds preserve every root score against independent exhaustive minimax',async()=>{
 const {oracleChildren}=await import('./tactics-oracle.js');
 const {evaluate}=await import('../src/ai.js');
 function brute(s,d,root){
  if(!d||s.winner!==null)return evaluate(s,root);
  const ns=oracleChildren(s);if(!ns.length)return evaluate(s,root);
  const scores=ns.map(({n})=>brute(n,d-1,root));
  return s.turn===root?Math.max(...scores):Math.min(...scores);
 }
 for(const s of [
  {size:3,target:2,players:[6,2],walls:[4],stars:[0,3,8],scores:[0,0],turn:0,ply:0,winner:null},
  {size:3,target:2,players:[7,1],walls:[3,5],stars:[0,4,8],scores:[0,0],turn:1,ply:0,winner:null},
 ]){
  const r=examine(s,4,1000000);assert.equal(r.complete,true);
  const expected=new Map(oracleChildren(s).map(({a,n})=>[JSON.stringify(a),brute(n,3,s.turn)]));
  for(const move of r.moves)assert.equal(move.score,expected.get(JSON.stringify(move.action)));
 }
});

test('regression: fail-low transposition is a bound, not the exact root-action score',async()=>{
 const {oracleChildren}=await import('./tactics-oracle.js');
 const {evaluate}=await import('../src/ai.js');
 const s={size:3,target:2,players:[1,7],walls:[0],stars:[5,2,4],scores:[0,0],turn:0,ply:0,winner:null};
 function brute(n,d){if(!d||n.winner!==null)return evaluate(n,0);const ns=oracleChildren(n);if(!ns.length)return evaluate(n,0);const values=ns.map(({n:c})=>brute(c,d-1));return n.turn===0?Math.max(...values):Math.min(...values);}
 const action={wall:{wall:0,to:3},dir:1};
 const n=oracleChildren(s).find(x=>JSON.stringify(x.a)===JSON.stringify(action)).n;
 const expected=brute(n,5);
 assert.equal(expected,601); // archived solver returned 483 for this exact fixture
 const r=examine(s,6,1000000);assert.equal(r.complete,true);
 assert.equal(r.moves.find(m=>JSON.stringify(m.action)===JSON.stringify(action)).score,expected);
});

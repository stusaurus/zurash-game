import test from 'node:test';
import assert from 'node:assert/strict';
import {initial, actions, apply, successors, key} from '../src/engine.js';
import {chooseRoute, captureRoutes} from '../src/route-ai.js';
import {chooseRoute as previous} from './reference/route-ai-before-five-mode.js';
import {seeded} from '../src/ai.js';

function midgame(layout) {
  let state=initial(layout), rng=seeded(91+layout), history=new Map();
  for(let i=0;i<6 && state.winner===null;i++) {
    history.set(key(state),(history.get(key(state))||0)+1);
    const options=actions(state), nonwinning=options.filter(a=>apply(state,a).winner===null);
    assert.ok(nonwinning.length); state=apply(state,nonwinning[Math.floor(rng()*nonwinning.length)]);
  }
  return {state,history};
}

test('A–E initial and reachable midgame routes match exhaustive scoring actions',()=>{
  for(let layout=4;layout<=8;layout++) for(const state of [initial(layout),midgame(layout).state]) for(const p of [0,1]){
    const expected=successors({...state,turn:p}).filter(c=>c.n.scores[p]>state.scores[p]).map(c=>c.n.players[p]);
    assert.deepEqual([...captureRoutes(state,p).keys()].sort((a,b)=>a-b),[...new Set(expected)].sort((a,b)=>a-b));
  }
});
test('A–E strong CPU chooses legal moves in initial and midgame positions',()=>{
  for(let layout=4;layout<=8;layout++) for(const {state,history} of [{state:initial(layout),history:new Map()},midgame(layout)]){
    const before=structuredClone(state), legal=actions(state);
    const action=chooseRoute(state,{rng:seeded(42),seen:history,progress:true});
    assert.ok(legal.some(a=>JSON.stringify(a)===JSON.stringify(action)));
    assert.deepEqual(state,before);
  }
});
test('7×7 seeded choices and RNG remain identical to the PR39 implementation',()=>{
  for(let layout=0;layout<4;layout++) for(const {state,history} of [{state:initial(layout),history:new Map()},midgame(layout)]) for(const seed of [1,73]) for(const progress of [false,true]){
    const a=seeded(seed),b=seeded(seed);
    assert.deepEqual(chooseRoute(state,{rng:a,seen:history,progress}),previous(state,{rng:b,seen:history,progress}));
    assert.equal(a(),b());
  }
});

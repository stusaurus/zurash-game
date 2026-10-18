import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {apply,successors} from '../src/engine.js';
import {choose,seeded} from '../src/ai.js';
const fixtures=JSON.parse(fs.readFileSync(new URL('../reports/tactical-study.json',import.meta.url))).fixtures;
test('recorded wall-skip win is legal and recognized by both CPU levels',()=>{
 const {state,action}=fixtures.skipWins;
 assert.equal(action.wall,null);assert.equal(apply(state,action).winner,state.turn);
 for(const level of ['search','strong'])assert.equal(apply(state,choose(state,{level,rng:seeded(1)})).winner,state.turn);
});
test('recorded defensive branch prevents a next-turn loss; strong CPU selects safety',()=>{
 const {state,safeAction,unsafeAction}=fixtures.blocksWin;
 const loses=a=>successors(apply(state,a)).some(c=>c.n.winner===1-state.turn);
 assert.equal(loses(safeAction),false);assert.equal(loses(unsafeAction),true);
 for(let seed=1;seed<=5;seed++)assert.equal(loses(choose(state,{level:'strong',rng:seeded(seed)})),false);
});

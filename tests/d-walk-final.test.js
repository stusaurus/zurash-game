import test from 'node:test';
import assert from 'node:assert/strict';
import {starts,plan,get,cumulativeAt} from '../scripts/d-walk-final.js';
test('final independent design crosses both starts, seats and actor assignments without duplicate IDs',()=>{
 const all=plan().seeds.flatMap(starts);assert.equal(all.length,128);assert.equal(new Set(all.map(g=>g.id)).size,128);
 for(const seed of plan().seeds)for(const pair of plan().pairs){const gs=all.filter(g=>g.seed===seed&&JSON.stringify(g.research.labels)===JSON.stringify(pair));assert.equal(gs.length,4);assert.equal(new Set(gs.map(g=>[g.starter,g.experiment.positionSwap].join('/'))).size,4);}
});
test('horizon settlement excludes later victories and retains unresolved games in denominator',()=>{
 const gs=[{state:{winner:0,ply:64}},{state:{winner:1,ply:513}},{state:{winner:null,ply:700}}];assert.deepEqual(cumulativeAt(gs,64),{n:3,settled:1});assert.deepEqual(cumulativeAt(gs,512),{n:3,settled:1});assert.deepEqual(cumulativeAt(gs,513),{n:3,settled:2});
});
test('fifteen continuation sources are exact512, unresolved, unique and split10/5',()=>{
 const rs=get('sources');assert.equal(rs.length,15);assert.equal(new Set(rs.map(r=>r.id)).size,15);assert.equal(rs.filter(r=>r.game.research.labels[0]==='D').length,10);for(const r of rs){assert.equal(r.game.state.ply,512);assert.equal(r.game.state.winner,null);assert.equal(r.game.history.length,512);}
});

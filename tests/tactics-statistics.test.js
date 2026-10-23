import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../scripts/tactics-statistics.js';
test('fairness denominator excludes caps, preserves layout clusters and exact cap wins',()=>{
 const rows=[{pair:0,starter:0,winner:0,plies:10},{pair:0,starter:1,winner:0,plies:20},{pair:1,starter:0,winner:null,plies:120},{pair:1,starter:1,winner:1,plies:120}];
 const r=summarize(rows);
 assert.equal(r.games,4);assert.equal(r.clusters,2);assert.equal(r.decided,3);assert.equal(r.firstSeatDecidedRate,2/3);assert.equal(r.undecidedRate,.25);assert.equal(r.reach120Rate,.5);assert.equal(r.medianDecidedPlies,20);assert.equal(r.meanAllPlies,67.5);assert.ok(r.pairedLayoutBootstrap95[0]<=2/3&&r.pairedLayoutBootstrap95[1]>=2/3);
});
test('no decisions has no win rate or confidence interval',()=>{
 const r=summarize([{pair:0,winner:null,starter:0,plies:120}]);
 assert.equal(r.firstSeatDecidedRate,null);assert.equal(r.pairedLayoutBootstrap95,null);assert.equal(r.wilson95IndependentGames,null);assert.equal(r.meanDecidedPlies,null);
});

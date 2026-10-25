// Full successor ordering/values on every archived readiness prefix and added turn.
import assert from 'node:assert/strict';import {readFileSync,writeFileSync} from 'node:fs';
import {readPacked} from './stage2-source.js';import {referenceChildren} from './stall-research.js';import {successors} from '../src/engine.js';
const source=readPacked('reports/stall-2026-10-23/games.json.gz'),delta=new Map(readPacked('reports/mode-continuation-2026-10-23/delta.json.gz').map(g=>[g.id,g])),games=source.map(g=>delta.get(g.id)??g).filter(g=>/^mode-[ABCDE]$/.test(g.experiment.boardId));
assert.equal(games.length,320);let positions=0,transitions=0;
function replay(initial,history,final){let s=initial;for(const h of history){const cs=successors(s),ref=referenceChildren(s);assert.deepEqual(cs,ref);positions++;transitions+=cs.length;const c=ref.find(c=>JSON.stringify(c.a)===JSON.stringify(h.a));assert.ok(c);s=c.n;}assert.deepEqual(s,final);}
for(const g of games)replay(g.initial,g.history,g.state);
const dir='reports/stage2-2026-10-25/',extensions=readPacked(dir+'extensions.json.gz');
// Locate the saved extension prefix directly: only additional turns are new replay work.
for(const r of extensions){let s=r.game.initial;const cut=r.extension.beforePlies;for(const h of r.game.history.slice(0,cut))s=referenceChildren(s).find(c=>JSON.stringify(c.a)===JSON.stringify(h.a)).n;replay(s,r.game.history.slice(cut),r.game.state);}
const result={newGames:0,reusedReadinessGames:games.length,readinessPlies:8746,extendedGames:extensions.length,positions,transitions,independentOrderedSuccessors:true};
const path=dir+'regression.json';if(process.argv.includes('--verify'))assert.deepEqual(JSON.parse(readFileSync(path)),result);else writeFileSync(path,JSON.stringify(result,null,2)+'\n');console.log(result);

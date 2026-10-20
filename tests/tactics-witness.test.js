import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {apply} from '../src/engine.js';
import {CANDIDATES,makeCandidate} from '../scripts/tactics-candidates.js';
import {oracleChildren} from './tactics-oracle.js';
const report=JSON.parse(fs.readFileSync(new URL('../reports/tactics-strategy-witnesses.json',import.meta.url)));
for(const e of report.examples)test(`replay and independently verify ${e.size}x${e.size} defensive fork`,()=>{
 let s=makeCandidate(CANDIDATES.find(c=>c.size===e.size),e.seed);
 for(const a of e.history)s=apply(s,a);assert.deepEqual(s,e.state);
 const options=oracleChildren(s),id=a=>JSON.stringify(a);
 assert.equal(options.length,e.legalMoves);
 const bad=options.find(c=>id(c.a)===id(e.bad.action)),safe=options.find(c=>id(c.a)===id(e.safe.action));
 assert.ok(bad&&safe);
 assert.ok(oracleChildren(bad.n).some(c=>id(c.a)===id(e.bad.opponentWinningReply)&&c.n.winner===1-s.turn));
 assert.ok(oracleChildren(safe.n).every(c=>c.n.winner!==1-s.turn));
 assert.equal(safe.n.winner,null);
});

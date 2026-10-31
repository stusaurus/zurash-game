import fs from 'node:fs';import zlib from 'node:zlib';import assert from 'node:assert/strict';import {initial,actions,apply,key} from '../src/engine.js';import {CANDIDATES} from './standard-candidate-layouts.js';
const dir='reports/standard-strategy-2026-10-31';let total=0;
for(const tag of ['screen','selection','cross','final']){
 const rows=zlib.gunzipSync(fs.readFileSync(`${dir}/${tag}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);let summary=JSON.parse(fs.readFileSync(`${dir}/${tag}.json`,'utf8'));assert.equal(rows.length,summary.rows.reduce((a,b)=>a+b.games,0));
 for(const g of rows){const b=CANDIDATES.find(x=>x.id===g.id);assert.ok(b);let s=initial({...b,players:g.swap?[...b.players].reverse():b.players},g.starter);for(const a of g.moves){assert.ok(actions(s).some(x=>JSON.stringify(x)===JSON.stringify(a)));s=apply(s,a);}assert.equal(key(s),g.finalKey);assert.deepEqual(s.scores,g.scores);assert.equal(s.winner,g.winner);assert.equal(s.ply,g.plies);}
 total+=rows.length;console.log(`${tag}: ${rows.length} legal games verified`);
}console.log(`Total: ${total}`);

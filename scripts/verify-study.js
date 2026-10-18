import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {initial,apply,key,mobility} from '../src/engine.js';
let games=0,plies=0;
for(const path of process.argv.slice(2)){
 const report=JSON.parse(fs.readFileSync(path)),raw=gunzipSync(fs.readFileSync(path.replace('.json','.jsonl.gz'))).toString('utf8').trim().split('\n').map(JSON.parse);
 assert.equal(raw.length,report.totalGames);
 for(const g of raw){
  let s=initial(g.layout,g.starter),first=null;
  for(const a of g.actions){const n=apply(s,a);if(n.stars.length<s.stars.length)first??=n.ply;s=n;assert.ok(mobility(s,0).length&&mobility(s,1).length);}
  assert.deepEqual(s,g.final);assert.equal(s.ply,g.plies);assert.equal(first,g.firstStar);assert.equal(s.winner,g.winner);assert.equal(g.capped,s.winner===null);
  games++;plies+=s.ply;
 }
 for(const r of report.rows){
  const g=raw.filter(g=>g.layout===r.layout&&g.policies.join('/')===r.policies);
  assert.equal(g.length,r.games);assert.equal(g.filter(x=>x.winner===x.starter).length,r.firstWins);assert.equal(g.filter(x=>x.winner===null).length,r.capped);
 }
}
console.log(JSON.stringify({games,plies,allReplayed:true}));

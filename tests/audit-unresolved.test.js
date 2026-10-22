import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {gzipSync} from 'node:zlib';
import {spawnSync} from 'node:child_process';

test('unresolved audit counts IDs once and uses gain records for score stalls',()=>{
 const dir=mkdtempSync(join(tmpdir(),'zurash-audit-'));
 try{
  const game=(id,winner,reason,gains,boardId='candidate')=>({id,state:{winner,ply:gains.length},reason,history:gains.map(gain=>({gain})),experiment:{boardId,stage:'holdout'},policies:['mixed','search'],repetitionCount:1});
  const first=[game('a',null,'budget-time',Array(31).fill(false)),game('b',0,'win',[true])];
  const second=[game('a',null,'budget-time',Array(31).fill(false)),game('c',null,'budget-plies',[true,false,false])];
  for(const [name,rows] of [['games',first],['position-games',second]])writeFileSync(join(dir,name+'.json.gz'),gzipSync(JSON.stringify(rows)));
  const output=join(dir,'audit.json');
  const run=spawnSync(process.execPath,['scripts/audit-unresolved.js'],{cwd:process.cwd(),env:{...process.env,DISCOVERY_REPORT:dir,AUDIT_OUTPUT:output},encoding:'utf8'});
  assert.equal(run.status,0,run.stderr);
  const report=JSON.parse(readFileSync(output,'utf8'));
  assert.deepEqual({...report.counts},{total:3,settled:1,unresolved:2,duplicateIds:1,withRepetition:2,withNoScoreProgress:1,missingReason:0});
  assert.equal(report.reasonCounts['budget-time'],1);
  assert.equal(report.boardPriority[0].boardId,'candidate');
  assert.equal(report.boardPriority[0].unresolved,2);
  assert.equal(report.boardPriority[0].totalGames,3);
  assert.equal(report.boardPriority[0].unresolvedRate,2/3);
  assert.match(run.stdout,/topBoards/);
  assert.equal(report.boardPriority[0].withRepetition,2);
  assert.equal(report.boardPriority[0].withNoScoreProgress,1);
  assert.equal(report.reasonCounts['budget-plies'],1);
  assert.equal(report.unresolved.find(g=>g.id==='a').scoreStallPlies,31);
  assert.equal(report.unresolved.find(g=>g.id==='c').scoreStallPlies,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});

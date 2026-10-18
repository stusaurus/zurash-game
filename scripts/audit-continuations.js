import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import * as current from '../src/engine.js';import * as baseline from './reference/engine-v1.js';
import assert from 'node:assert/strict';
const raw=gunzipSync(fs.readFileSync('reports/strategy-fast.jsonl.gz')).toString().trim().split('\n').map(JSON.parse);
let positions=0,offered={baseline:0,candidate:0},deadEnds={baseline:0,candidate:0},first=null;
outer:for(const g of raw){let s=current.initial(g.layout,g.starter);for(const a of g.actions){
 assert.deepEqual(current.actions(s),baseline.actions(s));
 for(const [name,engine] of [['baseline',baseline],['candidate',current]])for(const w of engine.movableWalls(s)){
  offered[name]++;
  if(!engine.slideOptions(engine.moveWall(s,w)).length){deadEnds[name]++;first??={state:s,wall:w,seed:g.seed,layout:g.layout,starter:g.starter};}
 }
 positions++;s=current.apply(s,a);if(positions>=2000)break outer;
}}
const result={positions,offered,deadEnds,allCompleteActionListsIdentical:true,first,notes:'First 2000 reachable positions in recorded fast batch, not an exhaustive state-space proof. Removes only wall-phase offers that could never finish a legal turn.'};
fs.writeFileSync('reports/wall-continuation-regression.json',JSON.stringify(result,null,2)+'\n');console.log(result);

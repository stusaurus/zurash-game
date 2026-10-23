import fs from 'node:fs';
import {newGame,advanceGame,verifyGame} from './tactics-completion.js';
const candidates=JSON.parse(fs.readFileSync('reports/five-board/selected.json'));
const fd=fs.openSync('reports/five-board/route-holdout.jsonl','w');
for(const c of candidates){for(const seed of [80001,80002])for(const policies of [['route','route'],['route','search'],['search','route']])for(const starter of [0,1]){
 let g=newGame(c.state,{starter,seed,policies,id:`${c.id}-${c.seed}-route-holdout-${policies.join('-')}-${seed}-${starter}`});g=advanceGame(g,{maxPlies:4096,timeBudgetMs:2000,memoryBudgetMb:512});verifyGame(g);fs.writeSync(fd,JSON.stringify(g)+'\n');
 }console.log(c.id,'route holdout complete');}
fs.closeSync(fd);

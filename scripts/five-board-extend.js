import fs from 'node:fs';
import {advanceGame,verifyGame} from './tactics-completion.js';
const dir='reports/five-board';const input=fs.readFileSync(dir+'/games.jsonl','utf8').trim().split('\n').map(JSON.parse).filter(g=>!g.id.includes('-screen-'));
const fd=fs.openSync(dir+'/extended.jsonl','w');
for(let i=0;i<input.length;i++){
 let g=input[i];if(g.state.winner===null)g=advanceGame(g,{maxPlies:4096,timeBudgetMs:3000,memoryBudgetMb:512});verifyGame(g);fs.writeSync(fd,JSON.stringify(g)+'\n');
 if((i+1)%20===0)console.log(i+1,'/',input.length);
}fs.closeSync(fd);

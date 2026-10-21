import fs from 'node:fs';
import {apply,successors} from '../src/engine.js';
import {prove} from './tactics-proof.js';
import {examine} from './tactics-search.js';
const games=fs.readFileSync('reports/five-board/games.jsonl','utf8').trim().split('\n').map(JSON.parse),results=[];
for(const size of [8,9,10,6,11]){
 const wins=games.filter(g=>g.initial.size===size&&g.reason==='win');let witnesses=[];
 for(const g of wins.slice(0,6)){
  let s=g.initial;for(let i=0;i<g.history.length;i++){
   const h=g.history[i];if(i===g.history.length-1){const children=successors(s);witnesses.push({game:g.id,ply:s.ply,state:s,action:h.a,winningActions:children.filter(c=>c.n.winner===s.turn).length,otherActions:children.filter(c=>c.n.winner!==s.turn).length,proof:prove(s,{horizon:2,nodeBudget:10000,timeBudgetMs:300}),classification:'terminal tactical choice; not evidence for initial fairness'});}
   s=apply(s,h.a);
  }
 }
 const g=wins[0];let deeper=null;if(g){const i=Math.max(0,g.history.length-5);let s=g.initial;for(const h of g.history.slice(0,i))s=apply(s,h.a);deeper={game:g.id,ply:s.ply,depth3:examine(s,3,2000),proof:prove(s,{horizon:4,nodeBudget:10000,timeBudgetMs:500})};}
 results.push({size,witnesses,deeper});
}
fs.writeFileSync('reports/five-board/witnesses.json',JSON.stringify(results,null,2));console.log(results.map(r=>({size:r.size,witnesses:r.witnesses.length,proof:r.deeper?.proof.status})));

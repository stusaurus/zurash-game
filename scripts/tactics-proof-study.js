// Reproducible, bounded study. No heuristic substitutes for unknown results.
import fs from 'node:fs';
import {makeCandidate,CANDIDATES} from './tactics-candidates.js';
import {prove} from './tactics-proof.js';
const budget=Number(process.env.PROOF_BUDGET??1000000),maxDepth=Number(process.env.PROOF_DEPTH??16);
const perSearchMs=Number(process.env.PROOF_TIME_MS??10000),totalBudgetMs=Number(process.env.PROOF_TOTAL_MS??180000);
if(!Number.isInteger(maxDepth)||maxDepth<4||maxDepth>120||!Number.isInteger(totalBudgetMs)||totalBudgetMs<1||totalBudgetMs>1800000)throw Error('Invalid study limits');
const rows=[],positions=[],started=Date.now();
fs.mkdirSync('reports',{recursive:true});
function save(){fs.writeFileSync('reports/tactics-proof-depth.json',JSON.stringify({budget,maxDepth,perSearchMs,totalBudgetMs,totalElapsedMs:Date.now()-started,positions,rows},null,2)+'\n');}
process.on('SIGTERM',()=>{save();process.exit(143);});
for(const c of CANDIDATES){
  let s,seed;
  for(let attempt=0;attempt<100;attempt++){try{seed=20261020+c.size+attempt;s=makeCandidate(c,seed);break;}catch(e){if(e.message!=='No legal opening')throw e;}}
  if(!s)throw Error(`No playable opening for size ${c.size}`);
  positions.push({seed,state:s});
  for(const starter of [0,1]){
    let failed=false;
    for(let depth=4;depth<=maxDepth;depth++){
      if(Date.now()-started>=totalBudgetMs)break;
      const r=prove({...s,turn:starter},{horizon:depth,nodeBudget:budget,timeBudgetMs:Math.max(1,Math.min(perSearchMs,totalBudgetMs-(Date.now()-started))),memoryBudgetMb:512});
      rows.push({size:c.size,starter,depth,...r});console.log(JSON.stringify(rows.at(-1)));save();
      if(!r.proven){failed=true;break;}
      if(r.result!==0)break;
    }
    // Explicit 120-ply attempt is separate from contiguous completed depths.
    if(failed&&Date.now()-started<totalBudgetMs){
      const r=prove({...s,turn:starter},{horizon:120,nodeBudget:budget,timeBudgetMs:Math.max(1,Math.min(perSearchMs,totalBudgetMs-(Date.now()-started))),memoryBudgetMb:512});
      rows.push({size:c.size,starter,depth:120,...r});console.log(JSON.stringify(rows.at(-1)));save();
    }
  }
}
save();

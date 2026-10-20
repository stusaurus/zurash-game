// Probe the maximum fully provable depth on candidate opening positions.
// Incomplete searches are reported UNKNOWN; no heuristic is substituted.
import fs from "node:fs";
import {makeCandidate,CANDIDATES} from "./tactics-candidates.js";
import {prove} from "./tactics-proof.js";
const budget=Number(process.env.PROOF_BUDGET??20000);
const maxDepth=Number(process.env.PROOF_DEPTH??4);
const rows=[];
for(const c of CANDIDATES){
  let s;
  for(let attempt=0;attempt<100;attempt++){
    try{s=makeCandidate(c,20261020+c.size+attempt);break;}
    catch(e){if(e.message!=="No legal opening")throw e;}
  }
  if(!s)throw Error(`No playable opening for size ${c.size}`);
  for(const starter of [0,1]){
    const state={...s,turn:starter};
    for(let depth=1;depth<=maxDepth;depth++){
      const r=prove(state,{horizon:depth,nodeBudget:budget});
      rows.push({size:c.size,starter,depth,...r});
      console.log(JSON.stringify(rows[rows.length-1]));
      if(!r.proven)break;
    }
  }
}
fs.mkdirSync("reports",{recursive:true});
fs.writeFileSync("reports/tactics-proof-depth.json",JSON.stringify({budget,maxDepth,rows},null,2)+"\n");

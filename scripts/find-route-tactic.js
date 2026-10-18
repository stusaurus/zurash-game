import fs from 'node:fs';import {gunzipSync} from 'node:zlib';
import {initial,apply,successors,key} from '../src/engine.js';import {captureRoutes,chooseRoute} from '../src/route-ai.js';import {seeded} from '../src/ai.js';import {choose as baseline} from './reference/ai-pre-route.js';
let checked=0,found=null;
outer:for(let l=0;l<3;l++){
 const games=gunzipSync(fs.readFileSync(`reports/route-holdout-${l}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse).filter(g=>g.policies.join('/')==='route/strong');
 for(const g of games){let s=initial(l,g.starter),seen=new Map();
  for(const recorded of g.actions){seen.set(key(s),(seen.get(key(s))||0)+1);
   if(s.turn===0&&s.scores[0]===2&&apply(s,recorded).winner===null){
    checked++;const seed=823,old=baseline(s,{level:'strong',rng:seeded(seed),seen}),next=chooseRoute(s,{rng:seeded(seed),seen});
    const certificate=a=>{const n=apply(s,a);if(n.winner!==null)return null;const replies=successors(n),lines=[];
     for(const r of replies){if(r.n.winner!==null)return null;const response=captureRoutes(r.n,s.turn).values().next().value;if(!response)return null;lines.push({reply:r.a,response});}
     return lines.length?lines:null;
    };
    const lines=certificate(next);if(lines&&!certificate(old)){found={state:s,seen:[...seen],rngSeed:seed,oldAction:old,newAction:next,winningResponses:lines,source:{layout:l,seed:g.seed,starter:g.starter,ply:s.ply},checked,notes:'New action forces a win on our next turn against every legal opponent reply. Old action does not. This is a three-ply tactical certificate, not a proof of overall optimal play.'};break outer;}
   }
   s=apply(s,recorded);
  }
 }
}
fs.writeFileSync('reports/route-tactic.json',JSON.stringify({found:!!found,checked,fixture:found},null,2)+'\n');console.log({found:!!found,checked,replies:found?.winningResponses.length});

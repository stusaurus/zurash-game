// Controlled research only; never imported by the app, worker, or official AI.
import {successors,key} from '../src/engine.js';
import {inventory,factorValue} from './guard-ai.js';
export const B_FACTOR_ARMS={A:{keeper:false,routes:false},B:{keeper:true,routes:false},C:{keeper:false,routes:true},D:{keeper:true,routes:true}};
const id=a=>JSON.stringify(a);
export function bFactorMove(s,arm,rng,seen=new Map(),{trace=false,maxLeaves=8192,maxMs=1500,maxRoots=Infinity,now=()=>performance.now()}={}){
 const config=B_FACTOR_ARMS[arm];if(!config)throw Error('Unknown factorial arm');
 if(!Number.isInteger(maxLeaves)||maxLeaves<1||!Number.isFinite(maxMs)||maxMs<=0)throw Error('Invalid factorial budget');
 const start=now(),heapBefore=process.memoryUsage().heapUsed,rngBefore=rng.state(),p=s.turn;
 // Identical feature work and RNG consumption in all arms. Only the keeper
 // factor may use safety/category/certificate information to alter the beam.
 const inv=inventory(s,'retain',rngBefore,seen);for(const _ of inv.rows)rng();
 const roots=[...(config.keeper?inv.retained:inv.rows.slice(0,8))],wins=inv.rows.filter(c=>c.n.winner===p);
 for(const c of wins)if(!roots.some(r=>id(r.a)===id(c.a)))roots.push(c);
 const featureMs=now()-start;let action=wins[0]?.a??roots[0]?.a??null,best=-Infinity,leaves=0,done=0,complete=true,peak=heapBefore;
 const scores=[];
 if(!wins.length)for(const c of roots){
  if(done>=maxRoots||now()-start>=maxMs){complete=false;break;}
  const replies=successors(c.n);if(leaves+replies.length>maxLeaves){complete=false;break;}
  let worst=Infinity;for(const r of replies){leaves++;worst=Math.min(worst,factorValue(r.n,p,config.routes));}
  if(!replies.length)worst=factorValue(c.n,p,config.routes);
  const repeat=(seen.get(key(c.n))??0)*130,root=factorValue(c.n,p,config.routes)-repeat,value=.88*worst+.12*root-repeat;
  done++;if(value>best){best=value;action=c.a;}
  if(trace)scores.push({action:c.a,root,worst,value});peak=Math.max(peak,process.memoryUsage().heapUsed);
 }
 const mem=process.memoryUsage();
 return {arm,action,rngBefore,rngAfter:rng.state(),depth:2,replyBeam:'all',legalRoots:inv.rows.length,retainedCount:roots.length,rootEvaluated:done,
  searchPositions:done+leaves,leafEvaluations:leaves,complete,immediateWin:!!wins.length,maxLeaves,maxMs,elapsedMs:now()-start,featureMs,
  heapBefore,heapAfter:mem.heapUsed,sampledHeapPeak:Math.max(peak,mem.heapUsed),rssAfter:mem.rss,processPeakRssKB:process.resourceUsage().maxRSS,
  ...(trace?{retainedActions:roots.map(c=>c.a),scores,certificate:inv.forced,rankedActions:inv.rows.map(c=>c.a)}:{}),
  accounting:'Search positions count evaluated roots and reply leaves only. Shared route/certificate feature prepass is timed, not counted as minimax nodes. Heap is sampled; RSS high-water is cumulative.'};
}

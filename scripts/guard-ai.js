// Experimental research selectors only; no application or production CPU imports this file.
import {successors,key} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
import {captureRoutes} from '../src/route-ai.js';
import {diagnosticMove,forcedThreeAction} from './trajectory-followup.js';
import {randomStream} from './tactics-completion.js';
export const MODELS=['archived','depth3','wide2','retain','routes2'];
const id=a=>JSON.stringify(a);
export function inventory(s,model,rngState,seen=new Map()){
 const p=s.turn,rng=randomStream(rngState),own=captureRoutes(s,p).size,opp=captureRoutes(s,1-p).size;
 const rows=successors(s).map(c=>{const a=captureRoutes(c.n,p).size,b=captureRoutes(c.n,1-p).size;let score=evaluate(c.n,p);
  if(model==='routes2'&&c.n.winner===null){score+=180*(a-b);if(c.n.turn===p&&c.n.scores[p]===(s.target??3)-1&&a)score+=20000;if(c.n.turn===1-p&&c.n.scores[1-p]===(s.target??3)-1&&b)score-=20000;}
  return {...c,score:score-(seen.get(key(c.n))??0)*130,tie:rng(),safe:c.n.winner===p||s.scores[1-p]<(s.target??3)-1||!b,deny:b<opp,prepare:a>own,capture:c.n.scores[p]>s.scores[p],ownRoutes:a,opponentRoutes:b};
 }).sort((a,b)=>b.score-a.score||a.tie-b.tie);
 let pool=rows;
 if(['retain','routes2'].includes(model)){const safe=rows.filter(c=>c.safe);if(safe.length)pool=safe;}
 let retained=model==='wide2'?pool:model==='routes2'?pool.slice(0,12):pool.slice(0,8);
 let forced=null;
 if(model==='retain'){
  const map=new Map(retained.map(c=>[id(c.a),c]));
  // Keep representatives of distinct tactical categories before distance-only beam pruning.
  for(const category of ['deny','prepare','capture'])for(const c of pool.filter(c=>c[category]).slice(0,4))map.set(id(c.a),c);
  forced=forcedThreeAction(s,pool);if(forced){const c=pool.find(c=>id(c.a)===id(forced.action));map.set(id(c.a),c);}
  retained=[...map.values()];
 }
 const wins=rows.filter(c=>c.n.winner===p);if(wins.length)retained=[...new Map([...wins,...retained].map(c=>[id(c.a),c])).values()];
 return {rows,pool,retained,forced};
}
export function modelMove(s,model,rng,seen=new Map(),{trace=false,nodeBudget=2048}={}){
 if(!MODELS.includes(model))throw Error('Unknown research model');
 const rngBefore=rng.state(),start=performance.now(),heapBefore=process.memoryUsage().heapUsed;let r;
 if(model==='depth3'){
  const p=s.turn,ranked=successors(s).map(c=>({...c,score:evaluate(c.n,p)-(seen.get(key(c.n))??0)*130,tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie),win=ranked.find(c=>c.n.winner===p);
  let best=-Infinity,action=win?.a??ranked[0]?.a??null,nodes=0,leaves=0,done=0,complete=true;
  if(!win)outer:for(const c of ranked.slice(0,8)){
   let worst=Infinity;const replies=successors(c.n);
   for(const reply of replies){if(++nodes>nodeBudget){complete=false;break outer;}let value;
    if(reply.n.winner!==null)value=evaluate(reply.n,p);else {const thirds=successors(reply.n);value=thirds.length?-Infinity:evaluate(reply.n,p);for(const t of thirds){leaves++;value=Math.max(value,evaluate(t.n,p));}}
    worst=Math.min(worst,value);if(worst<best-150)break;
   }
   if(!replies.length)worst=evaluate(c.n,p);const score=.88*worst+.12*c.score-(seen.get(key(c.n))??0)*130;done++;if(score>best){best=score;action=c.a;}
  }
  r={action,definitionVersion:'depth-only-root8-all-replies-v2',depth:3,beam:8,replyBeam:'all',thirdPlyBeam:'all',nodes,leafEvaluations:leaves,rootEvaluated:done,complete};
 }else if(model!=='retain')r=diagnosticMove(s,model,rng,seen,{nodeBudget});
 else {
  const inv=inventory(s,model,rngBefore,seen),p=s.turn;
  // inventory uses a copy; advance the actual stream exactly once per root candidate.
  for(const _ of inv.rows)rng();
  const win=inv.rows.find(c=>c.n.winner===p);
  if(win||inv.forced)r={action:win?.a??inv.forced.action,forced:win?1:inv.forced.plies,nodes:0,complete:true,rootEvaluated:0};
  else {
   let best=-Infinity,action=inv.retained[0]?.a??null,nodes=0,leaves=0,complete=true,done=0,peak=process.memoryUsage().heapUsed;
   for(const c of inv.retained){if(++nodes>nodeBudget){complete=false;break;}const replies=successors(c.n);let worst=Infinity;
    for(const reply of replies){leaves++;worst=Math.min(worst,evaluate(reply.n,p));}
    if(!replies.length)worst=evaluate(c.n,p);const score=.88*worst+.12*c.score-(seen.get(key(c.n))??0)*130;done++;
    if(score>best){best=score;action=c.a;}peak=Math.max(peak,process.memoryUsage().heapUsed);
   }
   r={action,nodes,leafEvaluations:leaves,complete,rootEvaluated:done,sampledHeapPeak:peak};
  }
  r.depth=2;r.beam='8 plus tactical category representatives';r.retainedCount=inv.retained.length;r.legalRoots=inv.rows.length;r.safeRoots=inv.pool.length;
 }
 const end=performance.now(),mem=process.memoryUsage();
 r={...r,model,elapsedMs:end-start,heapBefore,heapAfter:mem.heapUsed,rssAfter:mem.rss,processPeakRssKB:process.resourceUsage().maxRSS,memoryNote:'Heap sampled before/after; retain also samples root iterations. Process RSS high-water is cumulative, not an isolated per-model allocation peak.'};
 if(trace){const inv=inventory(s,model,rngBefore,seen);r.retainedActions=inv.retained.map(c=>c.a);r.legalRoots=inv.rows.length;r.safeRootCount=inv.rows.filter(c=>c.safe).length;r.important={deny:inv.rows.filter(c=>c.deny).length,prepare:inv.rows.filter(c=>c.prepare).length,capture:inv.rows.filter(c=>c.capture).length,retainedDeny:inv.retained.filter(c=>c.deny).length,retainedPrepare:inv.retained.filter(c=>c.prepare).length};r.selectedRetained=inv.retained.some(c=>id(c.a)===id(r.action));}
 return r;
}

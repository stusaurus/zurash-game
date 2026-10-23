// Research only. No turn cap or repetition rule is added to the game engine.
import {successors,key,apply} from '../src/engine.js';
import {choose,evaluate} from '../src/ai.js';
export const POLICY_SPEC={
 route:{depth:2,beam:8,description:'Production strong CPU with size-aware exhaustive immediate capture routes'},
 star:{depth:1,description:'Immediate star gain, then prefer no wall; seeded ties'},
 positional:{depth:1,description:'Existing distance-based evaluate(); seeded ties'},
 defensive:{depth:2,description:'Distance evaluation minus 180 if opponent can capture next turn; exhaustive immediate-defeat shield'},
 search:{depth:2,beam:8,description:'Archived choose(search), distance ordering and repetition penalty 130; seeded ties'},
 mixed:{depth:2,beam:8,description:'Beam-8 maximin evaluation + immediate capture + opponent capture denial'},
 'search-progress':{depth:2,beam:8,description:'Archived score/beam with exhaustive immediate-defeat shield; repetition penalty can weaken deeper choices, compare separately'}
};
export function randomStream(state){
 let x=state>>>0||1;
 const rng=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296;};
 rng.state=()=>x>>>0;return rng;
}
const aid=a=>JSON.stringify(a);
export function policyMove(s,policy,rng,seen=new Map(),options=successors(s)){
 if(!POLICY_SPEC[policy])throw Error('Unknown policy');
 if(!options.length)return null;
 // Archived policy is retained byte-for-byte via its existing entry point.
 if(policy==='route')return choose(s,{level:'strong',rng,seen});
 if(policy==='search')return choose(s,{level:'search',rng,seen,beam:8});
 const p=s.turn,win=options.filter(c=>c.n.winner===p);
 if(win.length)return win[Math.floor(rng()*win.length)].a;
 let pool=options;
 // Every improved policy screens ALL root actions for immediate defeat when needed.
 if(policy!=='star'&&s.scores[1-p]===(s.target??3)-1){
  const safe=pool.filter(c=>!successors(c.n).some(r=>r.n.winner===1-p));
  if(safe.length)pool=safe;
 }
 if(policy==='search-progress'){
  // Existing search's ordering + beam is reused. Restriction does not assert deeper safety.
  const ranked=pool.map(c=>({...c,v:evaluate(c.n,p)-(seen.get(key(c.n))||0)*130,tie:rng()})).sort((a,b)=>b.v-a.v||a.tie-b.tie);
  let best=-Infinity,selected;
  for(const c of ranked.slice(0,8)){
   const replies=successors(c.n);const worst=replies.length?Math.min(...replies.map(r=>evaluate(r.n,p))):evaluate(c.n,p);
   const v=worst*.88+c.v*.12-(seen.get(key(c.n))||0)*130;
   if(v>best){best=v;selected=c.a;}
  }
  return selected;
 }
 let ranked=pool.map(c=>({...c,tie:rng(),value:policy==='star'?(c.n.scores[p]-s.scores[p])*100+(c.a.wall?0:1):evaluate(c.n,p)}));
 if(policy==='defensive'||policy==='mixed'){
  for(const c of ranked){
   const replies=successors(c.n),capture=replies.some(r=>r.n.scores[1-p]>c.n.scores[1-p]);
   c.denied=!capture;c.value+=capture?-180:0;
  }
 }
 ranked.sort((a,b)=>b.value-a.value||a.tie-b.tie);
 if(policy==='mixed'){
  for(const c of ranked.slice(0,8)){
   const replies=successors(c.n);
   c.searchValue=(replies.length?Math.min(...replies.map(r=>evaluate(r.n,p))):evaluate(c.n,p))+.2*c.value;
  }
  ranked=ranked.slice(0,8).sort((a,b)=>b.searchValue-a.searchValue||a.tie-b.tie);
 }
 return ranked[0].a;
}
export function newGame(base,{starter=0,policies=['star','star'],seed=1,id='fixture'}={}){
 if(![0,1].includes(starter)||policies.length!==2||policies.some(p=>!POLICY_SPEC[p]))throw Error('Invalid game setup');
 return {version:1,id,starter,policies:[...policies],seed,initial:structuredClone({...base,turn:starter}),state:structuredClone({...base,turn:starter}),rngStates:[seed>>>0||1,(seed^0x9e3779b9)>>>0||1],history:[],visits:[],repetitionEvents:[],repetitionCount:0,reason:null,lastLead:0,elapsedMs:0,stages:[],metrics:{captureOpportunities:0,declinedCapture:0,immediateWinsOffered:0,immediateWinsMissed:0,wallMoves:0,wallBacktracks:0,pawnBacktracks:0,scorePlies:[],leadChanges:0,nearVictoryReversal:false,legalCounts:[0,0,0],quiet:0,longestQuiet:0}};
}
export function advanceGame(checkpoint,{maxPlies=1024,timeBudgetMs=1500,memoryBudgetMb=384,now=()=>performance.now(),onCheckpoint=()=>{},heapBytes=()=>process.memoryUsage().heapUsed,select=policyMove}={}){
 if(!Number.isInteger(maxPlies)||maxPlies<0||maxPlies>100000||!Number.isInteger(timeBudgetMs)||timeBudgetMs<1||timeBudgetMs>3600000||memoryBudgetMb<16||memoryBudgetMb>4096)throw Error('Invalid completion budget');
 const g=structuredClone(checkpoint),start=now(),visits=new Map(g.visits),rngs=g.rngStates.map(randomStream);
 g.reason=null;let priorLead=g.lastLead;
 function finish(reason){g.reason=reason;g.lastLead=priorLead;g.visits=[...visits];g.rngStates=rngs.map(r=>r.state());g.elapsedMs+=now()-start;g.stages.push({maxPlies,timeBudgetMs,reason,plies:g.state.ply});return g;}
 while(g.state.winner===null){
  if(g.state.ply>=maxPlies)return finish('budget-plies');
  if(now()-start>=timeBudgetMs)return finish('budget-time');
  if(g.state.ply%32===0&&heapBytes()>memoryBudgetMb*1024**2)return finish('budget-memory');
  const s=g.state,options=successors(s);
  if(!options.length)return finish('no-legal-action');
  // Full game-state equality. Policy memory and RNG are separate, so repetition != deterministic AI loop.
  const k=key(s),visit=visits.get(k),count=visit?.count??0;
  if(visit){
   g.repetitionCount++;
   if(g.repetitionEvents.length<8)g.repetitionEvents.push({ply:s.ply,previousPly:visit.last,period:s.ply-visit.last,state:structuredClone(s),actions:g.history.slice(visit.last-g.initial.ply).map(h=>h.a)});
  }
  visits.set(k,{count:count+1,last:s.ply});
  const seen=new Map([...visits].map(([id,v])=>[id,v.count]));
  const a=select(s,g.policies[s.turn],rngs[s.turn],seen,options),chosen=options.find(c=>aid(c.a)===aid(a));
  if(!chosen)return finish('invalid-policy-action');
  const n=chosen.n,gain=n.scores[s.turn]>s.scores[s.turn],canScore=options.some(c=>c.n.scores[s.turn]>s.scores[s.turn]),canWin=options.some(c=>c.n.winner===s.turn);
  const m=g.metrics; m.captureOpportunities+=Number(canScore);m.declinedCapture+=Number(canScore&&!gain);m.immediateWinsOffered+=Number(canWin);m.immediateWinsMissed+=Number(canWin&&n.winner!==s.turn);
  if(a.wall){m.wallMoves++;const last=g.history.at(-2);if(last?.a.wall&&last.a.wall.wall===a.wall.wall&&last.wallFrom===a.wall.to)m.wallBacktracks++;}
  const previous=g.history.at(-2);if(previous?.from===n.players[s.turn])m.pawnBacktracks++;
  const band=s.ply<40?0:s.ply<120?1:2;m.legalCounts[band]+=options.length;
  if(gain){m.scorePlies.push(n.ply);m.longestQuiet=Math.max(m.longestQuiet,m.quiet);m.quiet=0;}else m.quiet++;
  const lead=Math.sign(n.scores[0]-n.scores[1]);if(priorLead&&lead&&lead!==priorLead)m.leadChanges++;if(lead)priorLead=lead;
  g.history.push({a,from:s.players[s.turn],wallFrom:a.wall?s.walls[a.wall.wall]:null,legal:options.length,canScore,gain,canWin});
  g.state=n;
  if(n.ply%128===0){g.visits=[...visits];g.rngStates=rngs.map(r=>r.state());g.lastLead=priorLead;onCheckpoint(g);}
 }
 for(let p=0;p<2;p++)if(g.state.winner!==p&&g.history.length){
  // Reconstructed below by replay, rather than guessing from the terminal score.
  let s=g.initial;for(const h of g.history){if(s.scores[p]===(s.target??3)-1&&s.scores[p]>s.scores[1-p])g.metrics.nearVictoryReversal=true;s=apply(s,h.a);}
 }
 return finish('win');
}
export function verifyGame(g){
 let s=structuredClone(g.initial);
 for(const h of g.history)s=apply(s,h.a);
 if(JSON.stringify(s)!==JSON.stringify(g.state))throw Error('Replay mismatch '+g.id);
 if((g.reason==='win')!==(s.winner!==null))throw Error('Wrong result reason');
 return true;
}

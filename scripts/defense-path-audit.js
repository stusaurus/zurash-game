import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {key} from '../src/engine.js';
import {choose,seeded,evaluate} from '../src/ai.js';
import {captureRoutes} from '../src/route-ai.js';
import {referenceChildren} from './stall-research.js';
import {researchDecision,actionID} from './defense-path-ai.js';
export const DIR='reports/defense-path-2026-10-26';
const read=p=>JSON.parse(gunzipSync(readFileSync(p)));
export function auditPosition(s,{seed=610001,seen=new Map()}={}) {
 const p=s.turn,cs=referenceChildren(s),rng=seeded(seed);
 const ranked=cs.map(c=>({...c,score:evaluate(c.n,p)-(seen.get(key(c.n))||0)*130,tie:rng()})).sort((a,b)=>b.score-a.score||a.tie-b.tie);
 const choices=Object.fromEntries(['control','defense','path','combined'].map(variant=>[variant,researchDecision(s,{variant,rng:seeded(seed),seen})]));
 assert.deepEqual(choices.control.action,choose(s,{rng:seeded(seed),seen}));
 choices.strong={action:choose(s,{level:'strong',rng:seeded(seed),seen})};
 let replies=0;
 const moves=ranked.map((c,i)=>{
  const rs=referenceChildren(c.n);replies+=rs.length;
  const scoreReplies=rs.filter(r=>r.n.scores[1-p]>c.n.scores[1-p]);
  const winReplies=rs.filter(r=>r.n.winner===1-p);
  const routes=c.n.winner===null?captureRoutes(c.n,1-p):new Map();
  assert.deepEqual([...routes.keys()].sort((a,b)=>a-b),[...new Set(scoreReplies.map(r=>r.n.players[1-p]))].sort((a,b)=>a-b));
  const worst=rs.length?Math.min(...rs.map(r=>evaluate(r.n,p))):null;
  return {action:c.a,rank:i+1,rootScore:c.score,inBaselineBeam:i<8,ownWin:c.n.winner===p,ownScore:c.n.scores[p]>s.scores[p],allowsWin:winReplies.length>0,allowsScore:scoreReplies.length>0,opponentScoreTargets:routes.size,replyCount:rs.length,fullReplyMin:worst,winningReply:winReplies[0]?.a??null,scoringReply:scoreReplies[0]?.a??null};
 });
 const safeWin=moves.filter(m=>!m.allowsWin),safeScore=moves.filter(m=>!m.allowsScore),hasWinRisk=moves.some(m=>m.allowsWin),hasScoreRisk=moves.some(m=>m.allowsScore);
 const selected=Object.fromEntries(Object.entries(choices).map(([v,r])=>[v,{...r,classification:moves.find(m=>actionID(m.action)===actionID(r.action))}]));
 return {state:s,seed,seen:[...seen],legal:moves.length,replies,moves,selected,hasWinRisk,hasScoreRisk,safeWin:safeWin.length,safeScore:safeScore.length,uniqueWinDefense:hasWinRisk&&safeWin.length===1&&!safeWin[0].ownWin,allWinDefenseOutsideBeam:hasWinRisk&&safeWin.length>0&&safeWin.every(m=>!m.inBaselineBeam),allScoreDefenseOutsideBeam:hasScoreRisk&&safeScore.length>0&&safeScore.every(m=>!m.inBaselineBeam),wallOnlyScoreDefense:hasScoreRisk&&safeScore.length>0&&safeScore.every(m=>m.action.wall!==null)};
}
export function archiveCases(){
 const games=read('reports/stage8-2026-10-25/games.json.gz'),out=[];
 for(const mode of 'ABCDE'){
  const pool=[],ks=new Set();
  for(const g of games.filter(g=>g.mode===mode&&g.policies[0]==='search'&&g.candidate==='control').slice(0,16)){
   let s=g.initial;const seen=new Map();
   for(let i=0;i<g.trace.length;i++){
    if(!ks.has(key(s))){ks.add(key(s));pool.push({state:s,seen:[...seen],source:{seed:g.seed,starter:g.starter,swap:g.swap,ply:i,winner:g.state.winner,archivedAction:g.trace[i]}});}
    s=referenceChildren(s).find(c=>actionID(c.a)===actionID(g.trace[i])).n;seen.set(key(s),(seen.get(key(s))||0)+1);
   }
  }
  // Frozen deterministic strata: early, immediate-threat, losing side, late.
  const strata=[pool.filter(x=>x.source.ply<4),pool.filter(x=>captureRoutes({...x.state,turn:1-x.state.turn},1-x.state.turn).size),pool.filter(x=>x.source.winner!==null&&x.source.winner!==x.state.turn),[...pool].sort((a,b)=>b.source.ply-a.source.ply)];
  const used=new Set();let count=0;
  for(let k=0;k<strata.length;k++)for(const x of strata[k]){
   if(used.has(key(x.state)))continue;used.add(key(x.state));out.push({mode,source:x.source,split:k<2?'adjustment':'validation',...auditPosition(x.state,{seed:610001+count,seen:new Map(x.seen)})});if(++count%8===0)break;
  }
  console.log('audited',mode,count);
 }
 return out;
}
export function forcedScoreWithinThree(s,{budget=20000}={}){
 const p=s.turn,initial=s.scores[p];let generated=0,complete=true;
 const children=n=>{const cs=referenceChildren(n);generated+=cs.length;if(generated>budget){complete=false;return null;}return cs;};
 const roots=children(s),witnesses=[];
 if(roots)for(const c of roots){
  if(c.n.scores[p]>initial){witnesses.push({action:c.a,plies:1});continue;}
  const replies=children(c.n);if(!replies)break;if(!replies.length)continue;
  let forced=true;
  for(const r of replies){if(r.n.winner===1-p){forced=false;break;}const next=children(r.n);if(!next){forced=false;break;}if(!next.some(n=>n.n.scores[p]>initial)){forced=false;break;}}
  if(forced)witnesses.push({action:c.a,plies:3});if(!complete)break;
 }
 return {complete,generated,witnesses,verdict:witnesses.length?'forced-score-witness':complete?'no-force-within-three':'unknown'};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 mkdirSync(DIR,{recursive:true});
 const cases=archiveCases();
 // Independent three-ply quantifiers, bounded. Include late A/E, not only easy tactics.
 const deeper=['A','E'].flatMap(mode=>cases.filter(c=>c.mode===mode&&c.source.ply>=4).slice(-8)).map(c=>({mode:c.mode,source:c.source,state:c.state,result:forcedScoreWithinThree(c.state)}));
 writeFileSync(DIR+'/positions.json.gz',gzipSync(JSON.stringify({cases,deeper})),{flush:true});
 const summary=[...'ABCDE'].map(mode=>{const cs=cases.filter(c=>c.mode===mode);return {mode,positions:cs.length,legal:cs.reduce((n,c)=>n+c.legal,0),replies:cs.reduce((n,c)=>n+c.replies,0),uniqueWinDefense:cs.filter(c=>c.uniqueWinDefense).length,allWinDefenseOutsideBeam:cs.filter(c=>c.allWinDefenseOutsideBeam).length,allScoreDefenseOutsideBeam:cs.filter(c=>c.allScoreDefenseOutsideBeam).length,wallOnlyScoreDefense:cs.filter(c=>c.wallOnlyScoreDefense).length,choices:Object.fromEntries(['control','defense','path','combined','strong'].map(v=>[v,{avoidableLoss:cs.filter(c=>c.hasWinRisk&&c.safeWin&&c.selected[v].classification.allowsWin).length,avoidableScore:cs.filter(c=>c.hasScoreRisk&&c.safeScore&&c.selected[v].classification.allowsScore).length}]))};});
 writeFileSync(DIR+'/position-summary.json',JSON.stringify({summary,deeper:deeper.map(x=>({mode:x.mode,ply:x.source.ply,...x.result}))},null,2));console.log(summary);
}

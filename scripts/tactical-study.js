import fs from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {initial,apply,successors,key,LAYOUTS,distances} from '../src/engine.js';
import {evaluate} from '../src/ai.js';
const raw=gunzipSync(fs.readFileSync('reports/strategy-search.jsonl.gz')).toString('utf8').trim().split('\n').map(JSON.parse);
const openings=[];
for(let layout=0;layout<3;layout++){
 const s=initial(layout),ranked=successors(s).map(c=>{
  const replies=successors(c.n);
  return {action:c.a,landing:c.n.players[0],scored:c.n.scores[0],worst:Math.min(...replies.map(r=>evaluate(r.n,0))),opponentCanScore:replies.some(r=>r.n.scores[1]>0)};
 });
 const best=Math.max(...ranked.map(c=>c.worst)),near=ranked.filter(c=>c.worst>=best-50);
 openings.push({layout,name:LAYOUTS[layout].name,metric:'All legal actions and all opponent replies, two-ply static evaluation; within 50 units is a heuristic band, NOT proof of equal strategy or best play.',best,nearCount:near.length,nearLandingSquares:[...new Set(near.map(c=>c.landing))],nearSkip:near.filter(c=>c.action.wall===null).length,nearWallTargets:[...new Set(near.flatMap(c=>c.action.wall?[c.action.wall.to]:[]))],ranked});
}
const fixtures={},capped=[];
for(const game of raw){
 let s=initial(game.layout,game.starter);
 for(const a of game.actions){
  const n=apply(s,a);
  if(a.wall===null&&n.winner===s.turn&&!fixtures.skipWins)fixtures.skipWins={state:s,action:a,result:n,source:{layout:game.layout,seed:game.seed,starter:game.starter}};
  if(s.scores[1-s.turn]===2&&!fixtures.blocksWin){
   const all=successors(s);const unsafe=all.filter(c=>successors(c.n).some(r=>r.n.winner===1-s.turn));
   const safe=all.filter(c=>c.n.winner===s.turn||!successors(c.n).some(r=>r.n.winner===1-s.turn));
   if(unsafe.length&&safe.some(c=>c.n.winner===null))fixtures.blocksWin={state:s,unsafeAction:unsafe[0].a,safeAction:safe.find(c=>c.n.winner===null).a,safeCount:safe.length,unsafeCount:unsafe.length};
  }
  s=n;
 }
 if(game.capped){
  const threats=[0,1].map(p=>successors({...s,turn:p}).filter(c=>c.n.scores[p]>s.scores[p]).length);
  capped.push({layout:game.layout,policies:game.policies,seed:game.seed,starter:game.starter,scores:s.scores,starvationPlies:game.maxQuiet,threefold:game.repeated,scoringActionsNow:threats,staticUnreachable:[0,1].map(p=>s.stars.filter(x=>!Number.isFinite(distances(s,p)[x])).length),final:s});
 }
}
fs.writeFileSync('reports/tactical-study.json',JSON.stringify({openings,fixtures,capped,warning:'No repeat is not evidence of progress: changing irrelevant wall positions can avoid identical-position repetition. Static unreachable is NOT permanent unreachable with movable walls.'},null,2)+'\n');
console.log({openings:openings.map(x=>({layout:x.layout,near:x.nearCount,landing:x.nearLandingSquares,skip:x.nearSkip})),fixtures:Object.keys(fixtures),capped:capped.length});

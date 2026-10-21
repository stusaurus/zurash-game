import fs from 'node:fs';
import {seeded} from '../src/ai.js';
import {apply, successors} from '../src/engine.js';
import {verifyGame} from './tactics-completion.js';
const dir='reports/five-board',chosen=JSON.parse(fs.readFileSync(dir+'/selected.json'));
const read=p=>fs.readFileSync(dir+'/'+p,'utf8').trim().split('\n').map(JSON.parse);
const games=[...read('extended.jsonl'),...read('route-holdout.jsonl')];const base=read('games.jsonl');for(const g of [...games,...base])verifyGame(g);
for(const g of read('extended.jsonl')){const old=base.find(b=>b.id===g.id);if(!old||JSON.stringify(old.history)!==JSON.stringify(g.history.slice(0,old.history.length)))throw Error('Changed continuation prefix');}
function summary(gs){const n=gs.length,first=gs.filter(g=>g.state.winner===g.starter).length,second=gs.filter(g=>g.state.winner===1-g.starter).length,u=n-first-second;
 const groups=new Map();for(const g of gs){const k=g.policies.join('/')+':'+g.seed;groups.set(k,[...(groups.get(k)||[]),g]);}
 const clusters=[...groups.values()],rng=seeded(7654),lo=[],hi=[];
 for(let b=0;b<2000;b++){const sample=clusters.flatMap(()=>clusters[Math.floor(rng()*clusters.length)]);lo.push(sample.filter(g=>g.state.winner===g.starter).length/sample.length);hi.push(sample.filter(g=>g.state.winner===g.starter||g.state.winner===null).length/sample.length);}
 const q=(xs,p)=>xs.sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)],plies=gs.filter(g=>g.reason==='win').map(g=>g.state.ply),tot=gs.reduce((a,g)=>a+g.state.ply,0);
 return {n,first,second,unresolved:u,firstAmongDecided:first/(first+second)||null,completion:(first+second)/n,firstFinalBounds:[first/n,(first+u)/n],clusterBootstrap95Envelope:[q(lo,.025),q(hi,.975)],pairedClusters:clusters.length,formalDraw:0,anomalies:gs.filter(g=>!['win','budget-time','budget-plies','budget-memory'].includes(g.reason)).length,repetition:gs.filter(g=>g.repetitionCount>0).length,plies:plies.length?{median:q(plies,.5),p90:q(plies,.9),min:Math.min(...plies),max:Math.max(...plies)}:null,wallMoveFraction:gs.reduce((a,g)=>a+g.metrics.wallMoves,0)/tot,leadChanges:gs.reduce((a,g)=>a+g.metrics.leadChanges,0),nearVictoryReversals:gs.filter(g=>g.metrics.nearVictoryReversal).length};}
const strategic={};
for(const g of games){const m=strategic[g.initial.size]??={captures:0,wallEssentialCaptures:0,wallEnablesWin:0};let s=g.initial;
 for(const h of g.history){
  if(h.gain){m.captures++;if(h.a.wall){const noWall=successors(s).filter(c=>!c.a.wall);if(!noWall.some(c=>c.n.scores[s.turn]>s.scores[s.turn]))m.wallEssentialCaptures++;if(h.canWin&&!noWall.some(c=>c.n.winner===s.turn))m.wallEnablesWin++;}}
  s=apply(s,h.a);
 }
}
const results=chosen.map(c=>({id:c.id,seed:c.seed,family:c.family,strategy:strategic[c.state.size],spec:{size:c.state.size,stars:c.state.stars.length,walls:c.state.walls.length,target:c.state.target},all:summary(games.filter(g=>g.initial.size===c.state.size)),stages:Object.fromEntries(['precision','holdout','route-holdout'].map(stage=>[stage,summary(games.filter(g=>g.initial.size===c.state.size&&g.id.startsWith(`${c.id}-${c.seed}-${stage}-`)))])),strata:Object.fromEntries([...new Set(games.filter(g=>g.initial.size===c.state.size).map(g=>g.policies.join('/')))].map(pair=>[pair,summary(games.filter(g=>g.initial.size===c.state.size&&g.policies.join('/')===pair))]))}));
fs.writeFileSync(dir+'/summary.json',JSON.stringify({results,verifiedGames:games.length+base.filter(g=>g.id.includes("-screen-")).length,verifiedPlies:games.reduce((s,g)=>s+g.history.length,0)},null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,...r.spec,...r.all})),null,2));

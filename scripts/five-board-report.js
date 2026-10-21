import fs from 'node:fs';
import {seeded} from '../src/ai.js';
import {verifyGame} from './tactics-completion.js';
const dir='reports/five-board',chosen=JSON.parse(fs.readFileSync(dir+'/selected.json'));
const games=fs.readFileSync(dir+'/extended.jsonl','utf8').trim().split('\n').map(JSON.parse);for(const g of games)verifyGame(g);
function summary(gs){const n=gs.length,first=gs.filter(g=>g.state.winner===g.starter).length,second=gs.filter(g=>g.state.winner===1-g.starter).length,u=n-first-second;
 const groups=new Map();for(const g of gs){const k=g.policies.join('/')+':'+g.seed;groups.set(k,[...(groups.get(k)||[]),g]);}
 const clusters=[...groups.values()],rng=seeded(7654),lo=[],hi=[];
 for(let b=0;b<2000;b++){const sample=clusters.flatMap(()=>clusters[Math.floor(rng()*clusters.length)]);lo.push(sample.filter(g=>g.state.winner===g.starter).length/sample.length);hi.push(sample.filter(g=>g.state.winner===g.starter||g.state.winner===null).length/sample.length);}
 const q=(xs,p)=>xs.sort((a,b)=>a-b)[Math.floor((xs.length-1)*p)],plies=gs.filter(g=>g.reason==='win').map(g=>g.state.ply),tot=gs.reduce((a,g)=>a+g.state.ply,0);
 return {n,first,second,unresolved:u,firstAmongDecided:first/(first+second)||null,completion:(first+second)/n,firstFinalBounds:[first/n,(first+u)/n],clusterBootstrap95Envelope:[q(lo,.025),q(hi,.975)],pairedClusters:clusters.length,formalDraw:0,anomalies:gs.filter(g=>!['win','budget-time','budget-plies','budget-memory'].includes(g.reason)).length,repetition:gs.filter(g=>g.repetitionCount>0).length,plies:plies.length?{median:q(plies,.5),p90:q(plies,.9),min:Math.min(...plies),max:Math.max(...plies)}:null,wallMoveFraction:gs.reduce((a,g)=>a+g.metrics.wallMoves,0)/tot,leadChanges:gs.reduce((a,g)=>a+g.metrics.leadChanges,0),nearVictoryReversals:gs.filter(g=>g.metrics.nearVictoryReversal).length};}
const results=chosen.map(c=>({id:c.id,seed:c.seed,family:c.family,spec:{size:c.state.size,stars:c.state.stars.length,walls:c.state.walls.length,target:c.state.target},all:summary(games.filter(g=>g.initial.size===c.state.size)),strata:Object.fromEntries([...new Set(games.filter(g=>g.initial.size===c.state.size).map(g=>g.policies.join('/')))].map(pair=>[pair,summary(games.filter(g=>g.initial.size===c.state.size&&g.policies.join('/')===pair))]))}));
fs.writeFileSync(dir+'/summary.json',JSON.stringify({results,verifiedGames:games.length,verifiedPlies:games.reduce((s,g)=>s+g.history.length,0)},null,2));
console.log(JSON.stringify(results.map(r=>({id:r.id,...r.spec,...r.all})),null,2));

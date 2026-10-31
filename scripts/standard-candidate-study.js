import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initial,actions,apply,successors,key} from '../src/engine.js';
import {choose,seeded,evaluate} from '../src/ai.js';
import {CANDIDATES} from './standard-candidate-layouts.js';
const out=process.env.OUT??'/tmp/standard-candidates';
const seeds=(process.env.SEEDS??'148301').split(',').map(Number);
const cap=Number(process.env.CAP??64);
const matchups=(process.env.MATCHUPS??'greedy/greedy,search/search').split(',').map(x=>x.split('/'));
assert.ok(matchups.every(pair=>pair.length===2 && pair.every(x=>['greedy','search'].includes(x))));
fs.mkdirSync(out,{recursive:true});
const records=[];
for(const layout of CANDIDATES) for(const policy of matchups) for(const seed of seeds) for(const swap of [false,true]) for(const side of [0,1]){
 let init=initial({...layout,players:swap?[...layout.players].reverse():layout.players},swap?1-side:side);
 let s=init,seen=new Map(),rng=seeded(seed),moves=[],quiet=0,maxQuiet=0,first=null,lead=0,changes=0,behind=[false,false];
 while(s.winner===null && s.ply<cap){
  seen.set(key(s),(seen.get(key(s))??0)+1);
  let a=choose(s,{level:policy[s.turn],rng,seen});if(!a)break;
  const n=apply(s,a);assert.ok(actions(s).some(x=>JSON.stringify(x)===JSON.stringify(a)));
  if(n.stars.length<s.stars.length){first??=n.ply;maxQuiet=Math.max(maxQuiet,quiet);quiet=0}else quiet++;
  let l=Math.sign(n.scores[0]-n.scores[1]);if(l&&lead&&l!==lead)changes++;if(l)lead=l;
  for(let p=0;p<2;p++)if(n.scores[p]<n.scores[1-p])behind[p]=true;
  moves.push(a);s=n;
 }
 maxQuiet=Math.max(maxQuiet,quiet);
 let check=init;for(const a of moves)check=apply(check,a);assert.equal(key(check),key(s));
 records.push({id:layout.id,policy:policy.join('/'),seed,swap,side,starter:init.turn,winner:s.winner,winnerSide:s.winner===null?null:(swap?1-s.winner:s.winner),firstWin:s.winner===null?null:s.winner===init.turn,plies:s.ply,finalKey:key(s),scores:s.scores,firstStar:first,maxQuiet,changes,comeback:s.winner!==null&&behind[s.winner],onePoint:s.winner!==null&&Math.abs(s.scores[0]-s.scores[1])===1,moves});
 console.log(layout.id,policy[0],seed,swap,side,s.ply,s.winner??'unresolved');
}
const rows=[];for(const layout of CANDIDATES) for(const pol of matchups){const rs=records.filter(x=>x.id===layout.id&&x.policy===pol.join('/')),done=rs.filter(x=>x.winner!==null);const median=a=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.5)-1]:null;const p90=a=>a.length?[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.9)-1]:null;rows.push({id:layout.id,policy:pol.join('/'),games:rs.length,decided:done.length,unresolved:rs.length-done.length,firstWins:done.filter(x=>x.firstWin).length,side0:done.filter(x=>x.winnerSide===0).length,median:median(done.map(x=>x.plies)),p90:p90(done.map(x=>x.plies)),longQuiet:rs.filter(x=>x.maxQuiet>=20).length,comebacks:done.filter(x=>x.comeback).length,onePoint:done.filter(x=>x.onePoint).length,openings:new Set(rs.map(x=>JSON.stringify(x.moves[0]))).size});}
const openings=CANDIDATES.map(b=>{let s=initial(b),all=successors(s),v=all.map(x=>({...x,score:evaluate(x.n,s.turn)})),best=Math.max(...v.map(x=>x.score)),near=v.filter(x=>x.score>=best-50);return {id:b.id,legal:all.length,landings:new Set(all.map(x=>x.n.players[s.turn])).size,nearActions:near.length,nearLandings:new Set(near.map(x=>x.n.players[s.turn])).size,nearStates:new Set(near.map(x=>key(x.n))).size,top:best}});
fs.writeFileSync(`${out}/games.jsonl`,records.map(x=>JSON.stringify(x)).join('\n')+'\n');fs.writeFileSync(`${out}/summary.json`,JSON.stringify({seeds,cap,matchups,layouts:CANDIDATES,rows,openings,notes:['swap exchanges player identity, not an independent physical board on a 180-degree symmetric layout','search is beam-limited 2 ply; greedy is one-ply heuristic; not exact optimal play','cap is unresolved, not a draw','near scores are heuristic only, not evidence of strategically comparable moves']},null,2)+'\n');

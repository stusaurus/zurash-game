import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {successors,key} from '../src/engine.js';
import {seeded} from '../src/ai.js';
import {actionID} from './defense-path-ai.js';
import {stage10Decision} from './stage10-policy.js';
const dir='reports/stage10-guard-2026-10-26';mkdirSync(dir,{recursive:true});
const previous=JSON.parse(readFileSync('reports/stage8-2026-10-25/plan.json'));
const boards=previous.candidates.filter(c=>c.name==='control'||c.mode==='C'&&c.name==='star-relocate'||c.mode==='D'&&c.name==='positions-14-21'||c.mode==='B'&&c.name==='positions-central');
const variants=['control','win-guard'];
const pairs=[...variants.map(v=>[v,v]),...variants.slice(1).flatMap(v=>[[v,'control'],['control',v]])];
const plan={version:1,source:'c143c31eeffa9a08ee08b89bcc211bb9935fbc10',boards,pairs,seeds:[641003,641029,641053,641081],split:'unseen exploratory evaluation; no tuning on these seeds',maxPlies:256,softProcessCpuMs:1500,beam:8,depth:2,adoption:'No production change. Independent confirmation required after consistent strength + fairness + time benefits.',games:boards.length*pairs.length*4*4};
writeFileSync(dir+'/plan.json',JSON.stringify(plan,null,2),{flush:true});
const games=process.argv.includes('--resume')?JSON.parse(gunzipSync(readFileSync(dir+'/games.json.gz'))):[];
const id=(board,policies,seed,starter,swap)=>JSON.stringify([board.mode,board.name,policies,seed,starter,swap]);
const ids=new Set(games.map(g=>g.id));
for(const board of boards)for(const policies of pairs)for(const seed of plan.seeds)for(const starter of [0,1])for(const swap of [false,true]){
 const gid=id(board,policies,seed,starter,swap);if(ids.has(gid))continue;
 let s={...structuredClone(board.board),turn:starter};if(swap)s.players.reverse();
 const initial=structuredClone(s),rng=seeded(seed),seen=new Map(),trace=[],timings=[],stats=[];
 let quiet=0,maxQuiet=0,firstScore=null;
 const cpu=process.cpuUsage(),wall=performance.now();
 const cpuMs=()=>{const t=process.cpuUsage(cpu);return (t.user+t.system)/1000;};
 while(s.winner===null&&trace.length<plan.maxPlies&&cpuMs()<plan.softProcessCpuMs){
  const t=process.cpuUsage(),begin=performance.now(),r=stage10Decision(s,{variant:policies[s.turn],rng,seen});
  const dt=process.cpuUsage(t);timings.push({wall:performance.now()-begin,cpu:(dt.user+dt.system)/1000});stats.push(r.stats);
  const c=successors(s).find(c=>actionID(c.a)===actionID(r.action));assert.ok(c,'legal choice');
  const gain=c.n.scores[s.turn]>s.scores[s.turn];if(gain){quiet=0;firstScore??={actor:s.turn,ply:c.n.ply};}else quiet++;
  maxQuiet=Math.max(maxQuiet,quiet);trace.push(r.action);s=c.n;seen.set(key(s),(seen.get(key(s))||0)+1);
 }
 const g={id:gid,mode:board.mode,candidate:board.name,seed,starter,swap,policies,initial,state:s,trace,timings,stats,maxQuiet,firstScore,cpuMs:cpuMs(),wallMs:performance.now()-wall,reason:s.winner!==null?'winner':trace.length===plan.maxPlies?'ply-cap':'cpu-cap'};
 games.push(g);ids.add(gid);writeFileSync(dir+'/games.json.gz',gzipSync(JSON.stringify(games)),{flush:true});
 if(games.length%16===0)console.log('saved',games.length,'/',plan.games,board.mode,board.name,policies.join('/'));
}
assert.equal(games.length,plan.games);assert.equal(ids.size,plan.games);
writeFileSync(dir+'/games.json.gz',gzipSync(JSON.stringify(games)),{flush:true});
console.log('complete',games.length);

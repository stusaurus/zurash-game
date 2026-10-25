import {readFileSync,writeFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {choose,seeded,evaluate} from '../src/ai.js';
import {key,successors} from '../src/engine.js';
import {referenceChildren} from './stall-research.js';
import {actionID,researchDecision} from './defense-path-ai.js';
export function replayOriginalDefense(){
 const gs=JSON.parse(gunzipSync(readFileSync('reports/stage8-2026-10-25/games.json.gz'))),g=gs.find(g=>g.mode==='D'&&g.candidate==='control'&&g.seed===581029&&g.starter===0&&!g.swap);
 let s=g.initial,calls=0;const base=seeded(g.seed),rng=()=>{calls++;return base();},seen=new Map();
 for(let i=0;i<140;i++){const a=choose(s,{rng,seen});assert.deepEqual(a,g.trace[i]);const c=referenceChildren(s).find(c=>actionID(c.a)===actionID(a));assert.ok(c);s=c.n;seen.set(key(s),(seen.get(key(s))||0)+1);}
 const offset=calls,fresh=()=>{const r=seeded(g.seed);for(let i=0;i<offset;i++)r();return r;},p=s.turn,rankRng=fresh();
 const ranked=referenceChildren(s).map(c=>({...c,v:evaluate(c.n,p)-(seen.get(key(c.n))||0)*130,t:rankRng()})).sort((a,b)=>b.v-a.v||a.t-b.t);
 const safe=ranked.flatMap((c,i)=>referenceChildren(c.n).some(r=>r.n.winner===1-p)?[]:[{rank:i+1,action:c.a}]);
 const selected=choose(s,{rng,seen});assert.deepEqual(selected,g.trace[140]);
 const allowsLoss=a=>referenceChildren(successors(s).find(c=>actionID(c.a)===actionID(a)).n).some(r=>r.n.winner===1-p);
 const choices=Object.fromEntries(['control','defense','path','combined'].map(variant=>{const r=researchDecision(s,{variant,rng:fresh(),seen});return [variant,{action:r.action,allowsImmediateLoss:allowsLoss(r.action)}];}));
 assert.ok(safe.length&&safe.every(c=>c.rank>8));assert.ok(allowsLoss(selected));assert.equal(choices.defense.allowsImmediateLoss,false);
 return {mode:'D',seed:g.seed,starter:0,swap:false,ply:140,rngOffset:offset,replayedPrefix:140,seen:[...seen],state:s,safe,selected,selectedAllowsImmediateLoss:allowsLoss(selected),choices};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){const r=replayOriginalDefense();writeFileSync('reports/defense-path-2026-10-26/D-original-rng.json',JSON.stringify(r,null,2));console.log({offset:r.rngOffset,safe:r.safe,choices:r.choices});}

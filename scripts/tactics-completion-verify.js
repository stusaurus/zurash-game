import {loadCompletionSummary} from './tactics-completion-statistics.js';
import crypto from 'node:crypto';
import fs from 'node:fs';import zlib from 'node:zlib';import readline from 'node:readline';
import {verifyGame} from './tactics-completion.js';
const prefix=process.argv[2]??'reports/tactics-completion';
const plan=JSON.parse(fs.readFileSync(prefix+'-plan.json')),summary=loadCompletionSummary(prefix);
const expected=new Map(plan.tasks.map(t=>[t.id,t])),retained=new Map(summary.rows.map(t=>[t.id,t])),seen=new Set(),prefixes=new Map();let plies=0;
const hash=h=>crypto.createHash('sha256').update(JSON.stringify(h)).digest('hex');
for await(const line of readline.createInterface({input:fs.createReadStream(prefix+'-games.jsonl.gz').pipe(zlib.createGunzip()),crlfDelay:Infinity})){
 if(!line)continue;const g=JSON.parse(line),e=expected.get(g.id),row=retained.get(g.id);
 if(!e||!row||seen.has(g.id))throw Error('Unexpected/duplicate game '+g.id);
 for(const k of ['starter','seed','layoutSeed','size','scenario','matchup'])if(g[k]!==e[k])throw Error('Plan mismatch '+k);
 if(JSON.stringify(g.policies)!==JSON.stringify(e.policies))throw Error('AI assignment mismatch');
 if(g.reason!==row.reason||g.state.ply!==row.state.ply||g.state.winner!==row.state.winner)throw Error('Retained summary mismatch');
 verifyGame(g);seen.add(g.id);plies+=g.history.length;prefixes.set(g.id,{length:g.history.length,hash:hash(g.history),policies:g.policies});
}
if(seen.size!==plan.plannedGames||seen.size!==summary.recordedGames)throw Error('Missing persisted games');
let verifiedContinuations=0;
for(const suffix of ['-followup.jsonl.gz','-extension.jsonl.gz'])if(fs.existsSync(prefix+suffix)){
 for await(const line of readline.createInterface({input:fs.createReadStream(prefix+suffix).pipe(zlib.createGunzip()),crlfDelay:Infinity})){
  if(!line)continue;const r=JSON.parse(line),gs=suffix.includes('followup')?[r.original,...(r.intervention?[r.intervention]:[])]:[r];
  for(const g of gs){const p=prefixes.get(g.id);if(!p||g.history.length<p.length||hash(g.history.slice(0,p.length))!==p.hash)throw Error('Continuation changed its prefix');
   if((suffix.includes('extension')||g===r.original)&&JSON.stringify(g.policies)!==JSON.stringify(p.policies))throw Error('Primary continuation changed AI');
   verifyGame(g);verifiedContinuations++;
  }
 }
}
const result={verifiedContinuations,verifiedGames:seen.size,verifiedLegalPlies:plies,duplicates:0,missing:0,method:'Replay every persisted action through validated engine.apply; compare result, reason and plan assignments.'};
fs.writeFileSync(prefix+'-verification.json',JSON.stringify(result,null,2)+'\n');console.log(result);

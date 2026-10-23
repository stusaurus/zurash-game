import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {summarize} from './tactics-statistics.js';
const root=process.argv[2];if(!root)throw Error('Pass 120-ply artifact directory');
const games=[],shards=new Set();
for(const file of fs.readdirSync(root,{recursive:true}).map(String).filter(p=>p.endsWith('.json'))){
 const r=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 if(r.params?.cap!==120||shards.has(r.params.shard))throw Error('Invalid/duplicate artifact');
 shards.add(r.params.shard);games.push(...r.games.map(g=>({...g,shard:r.params.shard})));
}
if(shards.size!==50||games.length!==25000)throw Error('Expected 50 shards / 25000 outcomes');
const summary=[];
for(const size of [8,9,10])for(const policy of ['random','greedy'])summary.push({size,policy,...summarize(games.filter(g=>g.size===size&&g.policy===policy))});
fs.writeFileSync('reports/tactics-120-raw.jsonl.gz',zlib.gzipSync(games.map(g=>JSON.stringify(g)).join('\n')+'\n'));
fs.writeFileSync('reports/tactics-evidence-summary.json',JSON.stringify({sourceRun:39432318078,sourceSha:'2fa8d738dea830243743678803bd2292373628c2',games:games.length,shards:shards.size,summary},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));

// Extend every remaining primary-policy checkpoint; preserve past traces and interventions.
import fs from 'node:fs';import zlib from 'node:zlib';import readline from 'node:readline';import {fork} from 'node:child_process';import {fileURLToPath} from 'node:url';
const prefix=process.argv[2]??'reports/tactics-completion',followups=zlib.gunzipSync(fs.readFileSync(prefix+'-followup.jsonl.gz')).toString().trim().split('\n').filter(Boolean).map(JSON.parse),replacements=new Map(followups.map(r=>[r.id,r.original]));
const tasks=[];for await(const line of readline.createInterface({input:fs.createReadStream(prefix+'-games.jsonl.gz').pipe(zlib.createGunzip()),crlfDelay:Infinity})){if(!line)continue;const b=JSON.parse(line),g={...b,...(replacements.get(b.id)??{})};if(g.reason.startsWith('budget-'))tasks.push(g);}
const started=Date.now(),budgetMs=180000,workers=4,rows=[];let cursor=0,ended=0;fs.mkdirSync('/tmp/zurash-completion-checkpoints',{recursive:true});fs.writeFileSync(prefix+'-extension.jsonl.gz',Buffer.alloc(0));
function next(child){
 if(cursor>=tasks.length||Date.now()-started>=budgetMs){child.send('stop');if(++ended===workers){const r={planned:tasks.length,extended:rows.length,newDecisions:rows.filter(r=>r.reason==='win').length,budgetMs,elapsedMs:Date.now()-started,limits:{maxPlies:16384,timeBudgetMs:2000},rows};fs.writeFileSync(prefix+'-extension-summary.json',JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({planned:tasks.length,extended:rows.length,newDecisions:r.newDecisions,elapsedMs:r.elapsedMs}));}return;}
 const game=tasks[cursor++];child.send({game,meta:{},resumeLimits:{maxPlies:16384,timeBudgetMs:2000},checkpoint:`/tmp/zurash-completion-checkpoints/extension-${child.pid}.json`});
}
const children=[];for(let i=0;i<workers;i++){
 const child=fork(fileURLToPath(new URL('./tactics-completion-study.js',import.meta.url)),['--worker'],{execArgv:['--expose-gc','--max-old-space-size=384'],stdio:['ignore','inherit','inherit','ipc']});children.push(child);
 child.on('message',({game})=>{fs.appendFileSync(prefix+'-extension.jsonl.gz',zlib.gzipSync(JSON.stringify(game)+'\n'));rows.push({id:game.id,reason:game.reason,ply:game.state.ply,winner:game.state.winner});if(rows.length%50===0)console.log(`extension ${rows.length}/${tasks.length}`);next(child);});
 child.on('error',e=>{console.error(e);for(const c of children)c.kill('SIGTERM');process.exitCode=1;});next(child);
}

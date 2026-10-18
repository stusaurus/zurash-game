import fs from 'node:fs';import {gunzipSync} from 'node:zlib';import {createHash} from 'node:crypto';
const batches=['route-screen',...[0,1,2].map(l=>'route-holdout-'+l),'route-vs-normal','route-mix-screen',...[0,1,2].map(l=>'route-mix-holdout-'+l),'route-worker-protocol'];
const fields=['name','policies','games','firstWins','secondWins','agent0Wins','capped','decidedFirstRate','pairedBootstrap95','decidedPlies','observedPlies','firstStar','scoreGap','tiedAtTwo','comebacks','wallMoves','skips','stalled20','canonicalFirstChoices','canonicalSixPlyStates'];
const csv=['batch,layout,policies,games,firstWins,secondWins,agent0Wins,capped,firstRateDecided,CI95low,CI95high,meanDecided,medianDecided,p90Decided,meanObserved,firstStarMedian,meanGap,tied2to2,comebacks,wallMoves,skips,stalled20,firstChoices,sixPlyStates'];
const manifests=[];
for(const batch of batches){
 const r=JSON.parse(fs.readFileSync(`reports/${batch}.json`));
 const raw=gunzipSync(fs.readFileSync(`reports/${batch}.jsonl.gz`)).toString().trim().split('\n').map(JSON.parse);
 manifests.push({batch,conditions:r.params,games:r.totalGames,plies:raw.reduce((n,g)=>n+g.plies,0),role:batch.includes('screen')?'development':batch.includes('mix-holdout')?'second-independent-comparison':batch.includes('worker')?'runtime-protocol-check':batch.includes('vs-normal')?'difficulty-check':'first-independent-comparison'});
 for(const x of r.rows)csv.push([batch,x.name,x.policies,x.games,x.firstWins,x.secondWins,x.agent0Wins,x.capped,x.decidedFirstRate,...x.pairedBootstrap95,x.decidedPlies.mean,x.decidedPlies.median,x.decidedPlies.p90,x.observedPlies.mean,x.firstStar.median,x.scoreGap.mean,x.tiedAtTwo,x.comebacks,x.wallMoves,x.skips,x.stalled20,x.canonicalFirstChoices,x.canonicalSixPlyStates].join(','));
}
fs.writeFileSync('reports/route-summary.csv','\ufeff'+csv.join('\n')+'\n');
const codeHashes={};for(const p of ['src/route-ai.js','src/engine.js','scripts/reference/ai-pre-route.js','src/cpu-seed.js'])codeHashes[p]=createHash('sha256').update(fs.readFileSync(p)).digest('hex');
fs.writeFileSync('reports/route-study-manifest.json',JSON.stringify({batches:manifests,totalExecutions:manifests.reduce((n,m)=>n+m.games,0),totalPlies:manifests.reduce((n,m)=>n+m.plies,0),codeHashes,note:'Policy groups share seeds within each batch. Screens are excluded from confirmatory claims. First and second holdout seed offsets are disjoint. Numeric metadata sourceCommit may refer to the local development checkpoint; exact final source files are identified by SHA256 and included in this PR.'},null,2)+'\n');

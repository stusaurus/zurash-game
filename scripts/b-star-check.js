// A separately frozen follow-up hypothesis. Never choose from these holdout outcomes.
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,existsSync,renameSync} from 'node:fs';
import {gzipSync,gunzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {researchPlans,newResearchGame,advanceResearch,aggregateResearch,settlementComparison,sha} from './stall-research.js';
import {replayDiagnosis} from './b-settlement-study.js';
import {completionSummary} from './tactics-completion-statistics.js';
const dir=process.env.B_FOLLOWUP_REPORT??'reports/b-followup-2026-10-23',read=n=>JSON.parse(gunzipSync(readFileSync(`${dir}/${n}.json.gz`))),save=(n,x)=>{const p=`${dir}/${n}.json.gz`;writeFileSync(p+'.tmp',gzipSync(JSON.stringify(x)));renameSync(p+'.tmp',p);};
export function selectStarCandidate(roster,training){
 const ms=new Map(training.map(r=>[r.id,r.metrics]));return roster.filter(r=>r.change?.kind==='stars').sort((a,b)=>ms.get(a.id).unresolvedRate-ms.get(b.id).unresolvedRate||Math.max(ms.get(a.id).firstBias,ms.get(a.id).positionBias)-Math.max(ms.get(b.id).firstBias,ms.get(b.id).positionBias)||a.id.localeCompare(b.id))[0];
}
export function run(){
 const roster=read('roster'),frozen=read('frozen'),child=selectStarCandidate(roster,frozen.training);assert.ok(child);const records=[roster[0],child];
 const plan={version:1,selection:'Additional hypothesis selected only from extended training. Stars-only family; no main followup holdout used for selection.',trainingHash:sha(frozen.training),ids:records.map(r=>r.id),seeds:[2330001,2330019,2330033,2330051,2330073,2330087,2330103,2330129],pairs:[['search','route']],timeBudgetMs:900,maxPlies:4096,stage:'B-stars-independent',limits:['Separate seed and budget from main followup','Single supplementary confirmatory comparison; three comparisons across this task need multiplicity correction','No official adoption']};
 const pp=`${dir}/star-plan.json`;if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),plan);else writeFileSync(pp,JSON.stringify(plan,null,2)+'\n');
 let games=existsSync(`${dir}/star-games.json.gz`)?read('star-games'):[];const ids=new Set(games.map(g=>g.id));assert.equal(ids.size,games.length);
 for(const r of records)for(const p of researchPlans(r,{stage:plan.stage,seeds:plan.seeds,pairs:plan.pairs})){if(ids.has(p.id))continue;const g=advanceResearch(newResearchGame(p),{maxPlies:plan.maxPlies,timeBudgetMs:plan.timeBudgetMs,memoryBudgetMb:640});games.push(g);ids.add(g.id);if(games.length%8===0){save('star-games',games);console.log('star-holdout',games.length);}}save('star-games',games);
 const rows=records.map(r=>{const gs=games.filter(g=>g.experiment.boardId===r.id);return {id:r.id,name:r.name,metrics:aggregateResearch(gs),conservative:completionSummary(gs.map(g=>({...g,cluster:g.experiment.cluster})))};}),comparison=settlementComparison(games.filter(g=>g.experiment.boardId===records[0].id),games.filter(g=>g.experiment.boardId===child.id));save('star-summary',{newUniqueGames:games.length,rows,comparison,decision:'Research only, no promotion'});
 const catalogue=read('catalogue').filter(r=>![child.id,'mode-B-stars-control'].includes(r.id));for(let i=0;i<records.length;i++){const r=records[i],m=rows[i].metrics;catalogue.push({...r,id:i?r.id:'mode-B-stars-control',name:i?r.name:'B現行・星配置比較の対照',status:'AI検証中',games:m.games,unresolvedRate:m.unresolvedRate,metrics:{...m,stages:{holdout:m}},traits:[],warnings:['追加仮説：900ms/4,096手、未使用8seed。他の1,500ms比較とは混ぜない。研究用・未認定。人間の面白さは未測定。']});}save('catalogue',catalogue);
 console.log(rows.map(r=>({id:r.id,first:r.metrics.first,second:r.metrics.second,u:r.metrics.unresolved})));
}
export function verifySaved(){
 const roster=read('roster'),frozen=read('frozen'),child=selectStarCandidate(roster,frozen.training),p=JSON.parse(readFileSync(`${dir}/star-plan.json`)),games=read('star-games'),s=read('star-summary');assert.equal(p.trainingHash,sha(frozen.training));assert.deepEqual(p.ids,[roster[0].id,child.id]);assert.equal(new Set(games.map(g=>g.id)).size,games.length);
 const plans=[roster[0],child].flatMap(r=>researchPlans(r,{stage:p.stage,seeds:p.seeds,pairs:p.pairs})),byID=new Map(plans.map(p=>[p.id,p]));assert.deepEqual(games.map(g=>g.id).sort(),plans.map(p=>p.id).sort());let plies=0;
 for(const g of games){replayDiagnosis(g,{independent:true});plies+=g.history.length;const n=newResearchGame(byID.get(g.id));for(const k of ['initial','experiment','research','policies','starter','seed'])assert.deepEqual(g[k],n[k]);}
 assert.equal(s.newUniqueGames,games.length);for(const r of s.rows)assert.deepEqual(r.metrics,aggregateResearch(games.filter(g=>g.experiment.boardId===r.id)));assert.deepEqual(s.comparison,settlementComparison(games.filter(g=>g.experiment.boardId===roster[0].id),games.filter(g=>g.experiment.boardId===child.id)));
 const result={newUniqueGames:games.length,independentPlies:plies,gamesHash:sha(games),allLegal:true};writeFileSync(`${dir}/star-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}
export function runPolicies(){
 const roster=read('roster'),child=selectStarCandidate(roster,read('frozen').training),records=[roster[0],child],plan={version:1,ids:records.map(r=>r.id),seeds:[2340001,2340019,2340033,2340051],pairs:[['star','positional'],['mixed','defensive']],stage:'B-stars-policy-independent',timeBudgetMs:900,maxPlies:4096,selection:'Fixed star candidate, no reselection from policy outcomes'};
 const pp=`${dir}/star-policy-plan.json`;if(existsSync(pp))assert.deepEqual(JSON.parse(readFileSync(pp)),plan);else writeFileSync(pp,JSON.stringify(plan,null,2)+'\n');
 let games=existsSync(`${dir}/star-policy-games.json.gz`)?read('star-policy-games'):[];const ids=new Set(games.map(g=>g.id));assert.equal(ids.size,games.length);
 for(const r of records)for(const p of researchPlans(r,{stage:plan.stage,seeds:plan.seeds,pairs:plan.pairs})){if(ids.has(p.id))continue;games.push(advanceResearch(newResearchGame(p),{timeBudgetMs:plan.timeBudgetMs,maxPlies:plan.maxPlies,memoryBudgetMb:640}));ids.add(p.id);if(games.length%8===0){save('star-policy-games',games);console.log('star-policy',games.length);}}save('star-policy-games',games);
 const rows=records.map(r=>({id:r.id,name:r.name,byPair:Object.fromEntries(plan.pairs.map(pair=>[pair.join('/'),aggregateResearch(games.filter(g=>g.experiment.boardId===r.id&&g.research.labels.join('/')===pair.join('/')))]))}));save('star-policy-summary',{newUniqueGames:games.length,rows,limits:['Different AI/seed sample, not pooled with search/route holdout','No official adoption']});
 const catalogue=read('catalogue').map(r=>{const row=rows.find(x=>x.id===(r.id==='mode-B-stars-control'?'mode-B':r.id));if(!row||r.id==='mode-B')return r;return {...r,warnings:[...r.warnings.filter(w=>!w.startsWith('別方策')), ...Object.entries(row.byPair).map(([pair,m])=>`別方策${pair}・${m.games}局：先攻${m.first}／後攻${m.second}／未解決${m.unresolved}。900msの別seed結果で主成績に合算しない。`)]};});save('catalogue',catalogue);console.log(rows);
}
export function verifyPolicies(){
 const p=JSON.parse(readFileSync(`${dir}/star-policy-plan.json`)),roster=read('roster'),records=p.ids.map(id=>roster.find(r=>r.id===id)),games=read('star-policy-games'),s=read('star-policy-summary'),plans=records.flatMap(r=>researchPlans(r,{stage:p.stage,seeds:p.seeds,pairs:p.pairs})),map=new Map(plans.map(p=>[p.id,p]));assert.deepEqual(games.map(g=>g.id).sort(),plans.map(p=>p.id).sort());assert.equal(new Set(games.map(g=>g.id)).size,games.length);let plies=0;
 for(const g of games){replayDiagnosis(g,{independent:true});plies+=g.history.length;const initial=newResearchGame(map.get(g.id));for(const k of ['initial','experiment','research','starter','seed','policies'])assert.deepEqual(g[k],initial[k]);}
 for(const row of s.rows)for(const [pair,m] of Object.entries(row.byPair))assert.deepEqual(m,aggregateResearch(games.filter(g=>g.experiment.boardId===row.id&&g.research.labels.join('/')===pair)));assert.equal(s.newUniqueGames,games.length);
 const result={newUniqueGames:games.length,independentPlies:plies,gamesHash:sha(games),allLegal:true};writeFileSync(`${dir}/star-policy-verification.json`,JSON.stringify(result,null,2)+'\n');console.log(result);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){if(process.argv.includes('--verify-policies'))verifyPolicies();else if(process.argv.includes('--policies'))runPolicies();else if(process.argv.includes('--verify'))verifySaved();else run();}

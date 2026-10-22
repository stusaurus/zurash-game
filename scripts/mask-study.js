// Manual bounded research. Re-running resumes saved games, never recounts them.
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync} from 'node:fs';
import {generateBoard,mutateBoard,SHAPES,definitionKey,captureWitness} from '../src/board-lab.js';
import {MASK_LIBRARY} from '../src/mask-library.js';
import {newGame,advanceGame,verifyGame} from './tactics-completion.js';
import {prove} from './tactics-proof.js';
import {gzipSync,gunzipSync} from 'node:zlib';
const dir=process.env.MASK_REPORT??'reports/mask-lab-2026-10-22';mkdirSync(dir,{recursive:true});
const started=performance.now(),limit=Number(process.env.MASK_MS??150000),attempts=Number(process.env.MASK_ATTEMPTS??2000);
if(!Number.isInteger(attempts)||attempts<1||attempts>20000||!Number.isFinite(limit)||limit<1000||limit>1800000)throw Error('Invalid study budget');
const packed=name=>['corpus.json','games.json','exploratory-games.json'].includes(name);
const pathOf=name=>`${dir}/${name}${packed(name)?'.gz':''}`;
const load=name=>JSON.parse(packed(name)?gunzipSync(readFileSync(pathOf(name))):readFileSync(pathOf(name),'utf8'));
const save=(name,data)=>{const path=pathOf(name),text=JSON.stringify(data,null,2);writeFileSync(path+'.tmp',packed(name)?gzipSync(text):text);renameSync(path+'.tmp',path);};
let corpus;
if(existsSync(pathOf('corpus.json')))corpus=load('corpus.json');
else{
 const shapes=Object.keys(SHAPES).filter(x=>x!=='mask'),accepted=[],rejected=[],duplicates=[],seen=new Set();
 for(let i=0;i<attempts;i++){
  if(performance.now()-started>limit*.3)break;
  const shape=shapes[i%shapes.length],width=4+(Math.floor(i/11)%9),height=shape==='square'?width:4+(Math.floor(i/99)%7),target=1+(Math.floor(i/3)%4);
  const params={width,height,shape,corridor:1+(i%3),stars:2*target-1+(i%2)*2,walls:2+(Math.floor(i/9)%13),target,seed:100001+i,starBias:['random','central','dispersed'][i%3],wallBias:['random','central','outer'][Math.floor(i/3)%3],symmetry:i%13===0?'rotation':'none',holes:i%19===0?1:0};
  try{const r=generateBoard(params),k=definitionKey(r.board);if(seen.has(k))duplicates.push(params);else{seen.add(k);accepted.push(r);}}catch(e){rejected.push({params,reason:e.message});}
 }
 const mutations=[];
 for(const parent of MASK_LIBRARY)for(const kind of ['stars','walls','shape','multiple'])try{const r=mutateBoard(parent,{kind,seed:700001+mutations.length}),k=definitionKey(r.board);mutations.push({parent:parent.id,kind,seed:r.seed,accepted:true});if(!seen.has(k)){seen.add(k);accepted.push(r);}}catch(e){mutations.push({parent:parent.id,kind,accepted:false,reason:e.message});}
 corpus={version:1,generated:accepted.length+rejected.length+duplicates.length,accepted,rejected,duplicates,mutations,generationMs:performance.now()-started};save('corpus.json',corpus);
}
// Diversity stratification retains one independently generated example per shape;
// it does not pick a single fairness winner. Entire corpus remains available.
const selected=MASK_LIBRARY.map(sample=>corpus.accepted.find(r=>r.shape===sample.shape&&r.board.target>=2&&r.board.width>=6&&r.board.height>=6&&r.board.playableCells.length>=20&&r.board.walls.length<=9&&(['rectangle','square'].includes(r.shape)||r.board.playableCells.length<r.board.width*r.board.height))??sample);
const plans=[];
for(const r of selected){
 for(const policies of [['star','positional'],['positional','star']])for(const starter of [0,1])plans.push({r,policies,starter,seed:400003,stage:'screen'});
 for(const policy of ['defensive','mixed','search','route'])for(const starter of [0,1])plans.push({r,policies:[policy,policy],starter,seed:400009,stage:'search'});
 for(const policies of [['mixed','route'],['route','mixed']])for(const starter of [0,1])plans.push({r,policies,starter,seed:9000011,stage:'holdout'});
}
// Round-robin across shapes/stages avoids spending all budget on a single shape.
plans.sort((a,b)=>['screen','search','holdout'].indexOf(a.stage)-['screen','search','holdout'].indexOf(b.stage)||a.starter-b.starter);
let games=existsSync(pathOf('games.json'))?load('games.json'):[];
const byId=new Map(games.map(g=>[g.id,g]));
for(const plan of plans){
 if(performance.now()-started>=limit)break;
 const id=[plan.r.id,plan.stage,...plan.policies,plan.starter,plan.seed].join('-');let g=byId.get(id);
 if(g?.state.winner!==undefined&&g.state.winner!==null)continue;
 if(!g){g=newGame(plan.r.board,{id,policies:plan.policies,starter:plan.starter,seed:plan.seed});g.boardId=plan.r.id;g.stage=plan.stage;games.push(g);}
 const n=advanceGame(g,{maxPlies:g.state.ply+1024,timeBudgetMs:plan.stage==='screen'?500:900,memoryBudgetMb:512});
 verifyGame(n);games[games.findIndex(x=>x.id===id)]=n;byId.set(id,n);save('games.json',games);
 if(games.length%16===0)console.log('saved',games.length,'elapsed',Math.round(performance.now()-started));
}
function wilson(w,n){if(!n)return null;const z=1.959964,p=w/n,d=1+z*z/n,c=(p+z*z/2/n)/d,h=z*Math.sqrt(p*(1-p)/n+z*z/(4*n*n))/d;return [c-h,c+h];}
function summary(gs){const first=gs.filter(g=>g.state.winner===g.starter).length,second=gs.filter(g=>g.state.winner!==null&&g.state.winner!==g.starter).length,unresolved=gs.length-first-second;return {games:gs.length,first,second,unresolved,firstDecidedWilson95DescriptiveOnly:wilson(first,first+second),firstFinalPossibleRange:gs.length?[first/gs.length,(first+unresolved)/gs.length]:null,repeatedGames:gs.filter(g=>g.repetitionCount).length,leadChangeGames:gs.filter(g=>g.metrics.leadChanges).length,nearVictoryReversals:gs.filter(g=>g.metrics.nearVictoryReversal).length,wallMoves:gs.reduce((a,g)=>a+g.metrics.wallMoves,0),plies:gs.reduce((a,g)=>a+g.history.length,0),maxPlies:Math.max(0,...gs.map(g=>g.state.ply)),firstActions:new Set(gs.filter(g=>g.history.length).map(g=>JSON.stringify(g.history[0].a))).size};}
const library=[];
for(const r of selected){
 const gs=games.filter(g=>g.boardId===r.id),metrics=summary(gs),byPolicy={};
 for(const policy of ['star','positional','defensive','mixed','search','route'])byPolicy[policy]=summary(gs.filter(g=>g.policies.includes(policy)));
 const stageStats=Object.fromEntries(['screen','search','holdout'].map(stage=>[stage,summary(gs.filter(g=>g.stage===stage))]));
 const paired=[];for(const g of gs.filter(g=>g.starter===0)){const mate=gs.find(h=>h.starter===1&&h.seed===g.seed&&h.stage===g.stage&&JSON.stringify(h.policies)===JSON.stringify(g.policies));if(mate&&g.state.winner!==null&&mate.state.winner!==null)paired.push((Number(g.state.winner===g.starter)+Number(mate.state.winner===mate.starter))/2);}
 let pairedClusterBootstrap95=null;
 if(paired.length){let x=77;const rng=()=>((x=Math.imul(x,1664525)+1013904223>>>0)/4294967296);const draws=Array.from({length:2000},()=>paired.reduce(a=>a+paired[Math.floor(rng()*paired.length)],0)/paired.length).sort((a,b)=>a-b);pairedClusterBootstrap95=[draws[50],draws[1949]];}
 const witness=[0,1].map(p=>captureWitness(r.board,p,{maxNodes:24}));
 const proof=prove({...r.board},{horizon:4,nodeBudget:1000,timeBudgetMs:100,maxTableEntries:2000});
 library.push({...r,status:gs.length?'AI検証中':'合法性確認済み',metrics:{...metrics,byPolicy,stages:stageStats,pairedClusterBootstrap95,decidedPairs:paired.length,witness,finiteHorizonProof:proof},games:gs.length,unresolvedRate:gs.length?metrics.unresolved/gs.length:null,traits:[r.shape,`星${r.board.stars.length}／壁${r.board.walls.length}／先取${r.board.target}`,`観測された初手${metrics.firstActions}種類`,metrics.repeatedGames?'反復を観測':'この標本で反復未観測']});
}
save('library.json',library);
writeFileSync(new URL('../src/evaluated-mask-library.js',import.meta.url),'// Policy-dependent research results. No board is certified.\nexport const EVALUATED_MASK_LIBRARY = '+JSON.stringify(library.map(r=>({...r,name:'【AI検証】'+r.name})),null,2)+';\n');
const archived=existsSync(pathOf('exploratory-games.json'))?load('exploratory-games.json'):[];
const ledger=new Map(archived.map(g=>[g.id,g]));for(const g of games)ledger.set(g.id,g);
const uniqueGames=[...ledger.values()];
if(!uniqueGames.every(verifyGame))throw Error('Archive replay failed');

const rejectionReasons={};for(const r of corpus.rejected)rejectionReasons[r.reason]=(rejectionReasons[r.reason]??0)+1;
const report={version:1,algorithm:'mask-lab-1',generated:corpus.generated,legal:corpus.accepted.length,rejected:corpus.rejected.length,duplicates:corpus.duplicates.length,mutationAttempts:corpus.mutations.length,mutationAccepted:corpus.mutations.filter(m=>m.accepted).length,rejectionReasons,generationMs:corpus.generationMs,thisInvocationMs:performance.now()-started,summary:summary(games),boards:library.map(r=>({id:r.id,shape:r.shape,width:r.board.width,height:r.board.height,target:r.board.target,...r.metrics})),verified:games.every(verifyGame),totalUniqueNewGames:uniqueGames.length,exploratory:summary(archived),combinedUnique:summary(uniqueGames),duplicateIdsExcluded:archived.length+games.length-uniqueGames.length,plannedGames:plans.length,limitations:['No exhaustive search of design space','Unresolved games are resumable, not draws','Wilson intervals ignore pairing and policy dependence; descriptive only','Bootstrap uses decided pairs only and excludes unresolved-pair selection effects','Independent seeds/policies alone do not certify fairness','AI metrics do not prove human enjoyment','Finite-horizon neutral is not a draw proof','Exact duplicates only; rotations/reflections retained with player identities','Wall usage is not causal evidence of strategic necessity']};save('summary.json',report);console.log(JSON.stringify({...report,boards:undefined},null,2));

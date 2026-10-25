// Fixed-seed held-out audit of the shipped learning CPU. No training on evaluation games.
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {initial,successors,key} from '../src/engine.js';
import {seeded,evaluate} from '../src/ai.js';
import {freshLearning,learnMatch,learningContext,learningFeature,learnWeight} from '../src/learning.js';
const out='reports/stage5-2026-10-25';mkdirSync(out,{recursive:true});
import {chooseHistory} from './history-candidate.js';
const profiles=['star','wall','defense','switch'];
function player(s,profile,rng){const cs=successors(s),p=s.turn;return cs.map(c=>{let style=profile==='switch'?(s.ply<24?'star':'wall'):profile;let score=style==='star'?(c.n.scores[p]-s.scores[p])*10000+evaluate(c.n,p):style==='wall'?Number(c.a.wall!==null)*10000+evaluate(c.n,p):Math.min(...successors(c.n).map(r=>evaluate(r.n,p)));return {...c,score,tie:rng()};}).sort((a,b)=>b.score-a.score||a.tie-b.tie)[0];}
function game(layout,profile,seed,model,starter){let s=initial(layout,starter),rng=seeded(seed),seen=new Map(),obs=[],trace=[],cpuMs=[],predictions=[];for(let ply=0;ply<80&&s.winner===null;ply++){let c;if(s.turn===0){c=player(s,profile,rng);const cs=successors(s),weights=cs.map(r=>learnWeight(model,s,r.a,r.n)),sum=weights.reduce((a,b)=>a+b,0),feature=learningFeature(s,c.a,c.n),mass=cs.reduce((n,r,i)=>n+(learningFeature(s,r.a,r.n)===feature?weights[i]:0),0);predictions.push({probability:mass/sum,feature,context:learningContext(s)});obs.push({context:learningContext(s),feature});}else{const t=performance.now(),a=chooseHistory(s,{rng,seen,opponentModel:model});cpuMs.push(performance.now()-t);c=successors(s).find(c=>JSON.stringify(c.a)===JSON.stringify(a));}if(!c)break;trace.push(c.a);s=c.n;seen.set(key(s),(seen.get(key(s))??0)+1);}return {state:s,observations:obs,trace,cpuMs,predictions,winner:s.winner};}

const source=JSON.parse(readFileSync(out+'/learning-games.json')),rows=[];for(const r of source){rows.push({mode:r.mode,profile:r.profile,pairs:r.pairs.map(p=>({seed:p.seed,starter:p.starter,game:game(4+'ABCDE'.indexOf(r.mode),r.profile,p.seed,r.model,p.starter)}))});writeFileSync(out+'/history-candidate.json',JSON.stringify(rows));console.log(rows.length,'/20');}

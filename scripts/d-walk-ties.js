// Research-only exact-tie selectors. Leaf evaluator and D beam never change.
import {successors,key} from '../src/engine.js';
import {bFactorMove} from './b-factorial-ai.js';
import {progressMove} from './b-progress-ai.js';
export function victoryWalkDistance(s,p){
 const need=(s.target??3)-s.scores[p];if(need<=0)return 0;if(need>s.stars.length)return Infinity;
 const w=s.width??s.size??7,h=s.height??s.size??7,cells=new Set(s.playableCells??Array.from({length:w*h},(_,i)=>i)),blocked=new Set([...s.walls,s.players[1-p]]),points=[s.players[p],...s.stars];
 const distances=points.map(at=>{const q=[at],ds=new Map([[at,0]]);for(let i=0;i<q.length;i++)for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const x=q[i]%w+dx,y=Math.floor(q[i]/w)+dy,n=y*w+x;if(x<0||x>=w||y<0||y>=h||!cells.has(n)||blocked.has(n)||ds.has(n))continue;ds.set(n,ds.get(q[i])+1);q.push(n);}return points.map(x=>ds.get(x)??Infinity);});
 const cache=new Map();function cost(at,mask,left){if(!left)return 0;const id=[at,mask,left].join('/');if(cache.has(id))return cache.get(id);let best=Infinity;for(let j=1;j<points.length;j++)if(!(mask>>j&1))best=Math.min(best,distances[at][j]+cost(j,mask|(1<<j),left-1));cache.set(id,best);return best;}return cost(0,0,need);
}
export function tieMove(s,variant,rng,seen,options={}){
 if(variant==='D-walk')return progressMove(s,rng,seen,options);
 const r=bFactorMove(s,'D',rng,seen,{...options,trace:true});if(variant==='D'||r.immediateWin||!r.scores.length)return {...r,variant,tieChanged:false};
 if(!['D-repeat','D-victory'].includes(variant))throw Error('Unknown tie variant');
 const start=performance.now(),best=Math.max(...r.scores.map(c=>c.value)),ties=r.scores.filter(c=>Math.abs(c.value-best)<1e-9),cs=successors(s);let pick=ties[0],metric=Infinity;
 for(const c of ties){const n=cs.find(x=>JSON.stringify(x.a)===JSON.stringify(c.action)).n,v=variant==='D-repeat'?(seen.get(key(n))??0):victoryWalkDistance(n,s.turn);if(v<metric){metric=v;pick=c;}}
 const tieMs=performance.now()-start;return {...r,variant,action:pick.action,tieChanged:JSON.stringify(pick.action)!==JSON.stringify(r.action),tieMs,elapsedMs:r.elapsedMs+tieMs};
}

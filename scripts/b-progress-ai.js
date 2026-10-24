// Candidate only: break exact D minimax ties using adjacent-cell access distance.
// This is a heuristic, not a legal walking rule or a guaranteed sliding route.
import {bFactorMove} from './b-factorial-ai.js';
import {successors} from '../src/engine.js';
export function walkingDistance(s,p){
 const w=s.width??s.size??7,h=s.height??s.size??7,cells=new Set(s.playableCells??Array.from({length:w*h},(_,i)=>i)),blocked=new Set([...s.walls,s.players[1-p]]),q=[s.players[p]],dist=new Map([[q[0],0]]);
 for(let i=0;i<q.length;i++){const at=q[i];if(s.stars.includes(at))return dist.get(at);for(const [dx,dy] of [[0,-1],[1,0],[0,1],[-1,0]]){const x=at%w+dx,y=Math.floor(at/w)+dy,n=y*w+x;if(x<0||x>=w||y<0||y>=h||!cells.has(n)||blocked.has(n)||dist.has(n))continue;dist.set(n,dist.get(at)+1);q.push(n);}}
 return w*h+1;
}
export function progressMove(s,rng,seen,options={}){
 const r=bFactorMove(s,'D',rng,seen,{...options,trace:true}),start=performance.now();
 if(r.immediateWin||!r.scores.length)return {...r,variant:'D-walk',tieChanged:false,tieMs:performance.now()-start};
 const best=Math.max(...r.scores.map(c=>c.value)),ties=r.scores.filter(c=>Math.abs(c.value-best)<1e-9),cs=successors(s);
 let selected=ties[0],distance=Infinity;
 for(const c of ties){const n=cs.find(x=>JSON.stringify(x.a)===JSON.stringify(c.action)).n,d=walkingDistance(n,s.turn);if(d<distance){selected=c;distance=d;}}
 const tieMs=performance.now()-start;
 return {...r,variant:'D-walk',action:selected.action,tieChanged:JSON.stringify(selected.action)!==JSON.stringify(r.action),tieCount:ties.length,walkingDistance:distance,tieMs,elapsedMs:r.elapsedMs+tieMs};
}

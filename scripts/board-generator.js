// Seeded geometric proposals. Static checks are filters, never fairness proof.
import {actions, movableWalls, distances} from '../src/engine.js';
import {seeded} from '../src/ai.js';
export const MODES=[['A',8],['B',9],['C',10],['D',6],['E',11]];
export const FAMILIES=['rotation','mirror','central','dispersed','corridor','perturbed'];
export function generate({id,size,stars,target,walls,family,seed}) {
 if(!MODES.some(([a,b])=>a===id&&b===size)||!FAMILIES.includes(family)||!Number.isInteger(seed)||!Number.isInteger(stars)||!Number.isInteger(target)||stars!==2*target-1||target<2||!Number.isInteger(walls)||walls<2||walls+stars+2>size*size)throw Error('Invalid proposal');
 const rng=seeded(seed), players=[size*(size-1),size-1],used=new Set(players);
 const free=Array.from({length:size*size},(_,i)=>i).filter(i=>!used.has(i));
 const center=i=>Math.abs(i%size-(size-1)/2)+Math.abs(Math.floor(i/size)-(size-1)/2);
 const take=(count,kind)=>{
  const out=[];let candidates=free.filter(i=>!used.has(i)).map(i=>({i,v:rng()+(family==='central'?center(i)/size:0)+(family==='corridor'&&kind==='wall'?Math.abs(i%size-Math.floor(i/size))/size:0)})).sort((a,b)=>a.v-b.v);
  for(const {i} of candidates){if(out.length>=count)break;if(used.has(i))continue;
   out.push(i);used.add(i);
   if(['rotation','mirror','perturbed'].includes(family)&&out.length<count){const j=family==='mirror'?Math.floor(i/size)*size+size-1-i%size:size*size-1-i;if(!used.has(j)){out.push(j);used.add(j);}}
  }return out;
 };
 const starCells=take(stars,'star'),wallCells=take(walls,'wall');
 if(family==='perturbed'){const choices=free.filter(i=>!used.has(i));wallCells[0]=choices[Math.floor(rng()*choices.length)];}
 if(family==='dispersed') { /* randomized farthest-point star replacement */
  for(const x of starCells)used.delete(x);starCells.length=0;
  for(let k=0;k<stars;k++){const options=free.filter(i=>!used.has(i));options.sort((a,b)=>{const d=i=>starCells.length?Math.min(...starCells.map(j=>Math.abs(i%size-j%size)+Math.abs(Math.floor(i/size)-Math.floor(j/size)))):0;return d(b)-d(a);});const i=options[k===0?Math.floor(rng()*options.length):0];starCells.push(i);used.add(i);}
 }
 const s={size,target,walls:wallCells,stars:starCells,players,scores:[0,0],turn:0,ply:0,winner:null};
 const cells=[...s.players,...s.stars,...s.walls];
 if(starCells.length!==stars||wallCells.length!==walls||cells.some(i=>!Number.isInteger(i)||i<0||i>=size*size)||new Set(cells).size!==cells.length)throw Error('Invalid generated geometry');
 const a=actions(s),b=actions({...s,turn:1});
 if(!a.length||!b.length||!movableWalls(s).length)throw Error('Blocked opening');
 const d=players.map((_,p)=>distances(s,p)),reachable=d.map(ds=>starCells.filter(i=>Number.isFinite(ds[i])).length);
 if(reachable.some(x=>x===0))throw Error('No slide-reachable star');
 return {id,family,seed,state:s,diagnostics:{openingActions:[a.length,b.length],reachable,distanceGap:Math.abs(starCells.reduce((v,i)=>v+Math.min(20,d[0][i])-Math.min(20,d[1][i]),0))}};
}

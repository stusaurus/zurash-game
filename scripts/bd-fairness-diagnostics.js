// Read-only geometry baseline for B/D; Manhattan distances are proxies, not legal-path distances.
import {writeFileSync,mkdirSync} from 'node:fs';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {validateBoard} from '../src/board-lab.js';
import {topology,positionProxy} from './board-discovery.js';
const ids=['B','D'],result={version:1,method:'static topology and legal movement proxy; no games or rule changes',modes:[]};
for(const id of ids){
 const raw=RESEARCH_LAYOUTS.find(x=>x.id===id);if(!raw)throw Error('Missing mode '+id);
 const board=toBoardState(raw),v=validateBoard(board);if(!v.ok)throw Error(id+': '+v.errors.join(','));
 const state=v.state,base=positionProxy(state),shape=topology(state);
 const swapped={...state,players:[...state.players].reverse()},swappedProxy=positionProxy(swapped);
 const rotate=i=>state.width*state.height-1-i;
 const symmetric={terrain:shape.terrainRotation,stars:state.stars.every(i=>state.stars.includes(rotate(i))),walls:state.walls.every(i=>state.walls.includes(rotate(i))),players:state.players[0]===rotate(state.players[1])};
 result.modes.push({id,dimensions:[state.width,state.height],target:state.target,stars:state.stars,walls:state.walls,players:state.players,symmetric,topology:{articulationCells:shape.articulationCells,narrowCells:shape.narrowCells},base,swappedProxy,warning:'Proxy differences are not proof of first-player or starting-slot advantage; controlled games required.'});
}
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/BD-static.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result.modes.map(x=>({id:x.id,symmetric:x.symmetric,baseBias:x.base.proxyBias,swappedBias:x.swappedProxy.proxyBias})),null,2));

// Research-only one-edit candidate screen. No official board or CPU changes.
import {mkdirSync,writeFileSync} from 'node:fs';
import {RESEARCH_LAYOUTS} from '../src/research-layouts.js';
import {toBoardState} from '../src/geometry.js';
import {validateBoard} from '../src/board-lab.js';
import {positionProxy,topology} from './board-discovery.js';
const results={version:1,method:'one-star/one-wall relocation, static proxy screen only',modes:[]};
for(const id of ['B','D']){
 const raw=RESEARCH_LAYOUTS.find(x=>x.id===id),original=toBoardState(raw),base=validateBoard(original);
 if(!base.ok)throw Error(id+' invalid: '+base.errors.join(','));
 const b=base.state,baseline=positionProxy(b),occupied=new Set([...b.players,...b.stars,...b.walls]),empty=b.playableCells.filter(i=>!occupied.has(i));
 const candidates=[];
 for(const field of ['stars','walls'])for(let index=0;index<b[field].length;index++)for(const to of empty){
  const from=b[field][index],candidate={...b,[field]:b[field].map((x,i)=>i===index?to:x)},v=validateBoard(candidate);
  if(!v.ok)continue;
  const proxy=positionProxy(v.state),shape=topology(v.state);
  candidates.push({kind:field,from,to,proxyBias:proxy.proxyBias,biasChange:proxy.proxyBias-baseline.proxyBias,reachableStars:proxy.reachableStars,mobility:proxy.mobility,articulationCount:shape.articulationCells.length});
 }
 candidates.sort((a,b)=>a.proxyBias-b.proxyBias||Math.abs(a.biasChange)-Math.abs(b.biasChange)||a.kind.localeCompare(b.kind)||a.from-b.from||a.to-b.to);
 results.modes.push({id,baseline:{proxyBias:baseline.proxyBias,reachableStars:baseline.reachableStars,mobility:baseline.mobility},tested:candidates.length,topCandidates:candidates.slice(0,20),caution:'Static proxy screening is not a fairness or strategic-quality test. Compare candidates by controlled paired AI games before selection.'});
}
const dir=process.env.FAIRNESS_DIAG_REPORT??'reports/fairness-diagnostics';mkdirSync(dir,{recursive:true});writeFileSync(dir+'/BD-candidates.json',JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results.modes.map(x=>({id:x.id,tested:x.tested,baseline:x.baseline,top:x.topCandidates.slice(0,3)})),null,2));

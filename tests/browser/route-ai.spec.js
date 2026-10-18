import {test,expect} from '@playwright/test';import fs from 'node:fs';
import {apply,actions,successors} from '../../src/engine.js';
const fixture=JSON.parse(fs.readFileSync(new URL('../../reports/route-tactic.json',import.meta.url))).fixture;
test('challenge worker finds the certified win within watchdog budget',async({page},info)=>{
 await page.goto('/');
 const result=await page.evaluate(({state,history})=>new Promise((resolve,reject)=>{
  const start=performance.now(),w=new Worker('/src/cpu-worker.js',{type:'module'});
  const timer=setTimeout(()=>{w.terminate();reject(Error('CPU exceeded 6-second watchdog'));},6000);
  w.onerror=e=>{clearTimeout(timer);w.terminate();reject(Error(e.message));};
  w.onmessage=({data})=>{clearTimeout(timer);w.terminate();resolve({...data,elapsedMs:performance.now()-start});};
  w.postMessage({id:701,state,history,seed:711,level:'strong'});
 }),{state:fixture.state,history:fixture.seen});
 expect(result.id).toBe(701);expect(result.error).toBeUndefined();expect(result.elapsedMs).toBeLessThan(6000);
 expect(actions(fixture.state)).toContainEqual(result.action);
 const next=apply(fixture.state,result.action),replies=successors(next);
 expect(replies.length).toBeGreaterThan(0);
 for(const r of replies)expect(successors(r.n).some(t=>t.n.winner===fixture.state.turn)).toBe(true);
 await info.attach('challenge-worker-runtime',{body:JSON.stringify({elapsedMs:result.elapsedMs,replyBranches:replies.length}),contentType:'application/json'});
 console.log('ROUTE_WORKER',info.project.name,result.elapsedMs);
});

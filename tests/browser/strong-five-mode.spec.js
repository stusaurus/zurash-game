import {test,expect} from '@playwright/test';
import {initial,actions,apply} from '../../src/engine.js';
import {seeded} from '../../src/ai.js';

test('strong Worker returns legal actions for five research boards',async({page})=>{
  await page.goto('/');
  for(let layout=4;layout<=8;layout++){
    let state=initial(layout), rng=seeded(91+layout);
    for(let ply=0;ply<6;ply++){
      const moves=actions(state).filter(a=>apply(state,a).winner===null);
      state=apply(state,moves[Math.floor(rng()*moves.length)]);
    }
    const legal=actions(state);
    const result=await page.evaluate(s=>new Promise((resolve,reject)=>{
      const worker=new Worker('/src/cpu-worker.js',{type:'module'});
      const timeout=setTimeout(()=>{worker.terminate();reject(Error('Worker timeout'));},6000);
      worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(Error(e.message));};
      worker.onmessage=e=>{clearTimeout(timeout);worker.terminate();resolve(e.data);};
      worker.postMessage({id:1,state:s,history:[],seed:42,level:'strong'});
    }),state);
    expect(result.error).toBeUndefined();
    expect(legal).toContainEqual(result.action);
  }
});

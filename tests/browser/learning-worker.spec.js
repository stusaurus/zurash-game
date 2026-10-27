import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {choose,seeded} from '../../src/ai.js';
import {turnSeed} from '../../src/cpu-seed.js';

test('real Worker receives learned model and returns the seeded choice',async({page})=>{
  const fixture=JSON.parse(readFileSync(new URL('../fixtures/learning-adaptation-pr18.json',import.meta.url)));
  await page.goto('/');
  const state=fixture.state,seed=17;
  for (const opponentModel of [null,...fixture.profiles,{version:1,contexts:{broken:1}}]) {
    const response=await page.evaluate(({state,opponentModel,seed})=>new Promise((resolve,reject)=>{
      const worker=new Worker('/src/cpu-worker.js',{type:'module'});
      const timer=setTimeout(()=>{worker.terminate();reject(Error('worker timeout'));},6000);
      worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
      worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve(e.data);};
      worker.postMessage({id:1,level:'learning',state,history:[],seed,opponentModel});
    }),{state,opponentModel,seed});
    expect(response.error).toBeUndefined();
    expect(response.action).toEqual(choose(state,{level:'learning',opponentModel,rng:seeded(turnSeed(seed,state.ply))}));
  }
});

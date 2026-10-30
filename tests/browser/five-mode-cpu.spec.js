import { slideByBoard } from "./tap-target.js";
import {test, expect} from '@playwright/test';
import {initial, actions} from '../../src/engine.js';

test('A〜Eの実Workerは両先手で合法手を返し、UIから対戦できる', async ({page}) => {
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  for (let layout=4;layout<=8;layout++) for (const starter of [0,1]) {
    const state=initial(layout,starter), legal=actions(state);
    const response=await page.evaluate(s=>new Promise((resolve,reject)=>{
      const worker=new Worker('/src/cpu-worker.js',{type:'module'}), start=performance.now();
      const timeout=setTimeout(()=>{worker.terminate();reject(Error('Worker timeout'));},6000);
      worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(Error(e.message));};
      worker.onmessage=e=>{clearTimeout(timeout);worker.terminate();resolve({data:e.data,ms:performance.now()-start});};
      worker.postMessage({id:1,state:s,history:[],seed:42,level:'search'});
    }), state);
    expect(response.data.error).toBeUndefined();
    expect(legal).toContainEqual(response.data.action);
    expect(response.ms).toBeLessThan(6000);
    console.log('WORKER_MEASURE', JSON.stringify({mode:'ABCDE'[layout-4],starter,legal:legal.length,ms:Math.round(response.ms)}));
    await page.locator('#settings').click();
    await page.locator('#layout').selectOption(String(layout));
    await page.locator('#cpuLevel').selectOption('search');
    await page.locator('#starter').selectOption(String(starter));
    await page.locator('#start').click();
    if(starter===0){await page.locator('#skip').click();await slideByBoard(page);}
    await expect(page.locator('#turnCount')).toHaveText(starter===0?'3手目':'2手目',{timeout:15000});
    await expect(page.locator('#skip')).toBeEnabled();
  }
});

for(const failure of ['error','timeout']) test(`大盤面Worker ${failure}後も合法手で復帰し古い応答を無視`, async ({page})=>{
  test.setTimeout(45000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(failure=>{
    window.Worker=class {
      postMessage(data){const callback=this.onmessage;if(failure==='error')setTimeout(()=>callback?.({data:{id:data.id,error:'fixture'}}),20);setTimeout(()=>callback?.({data:{id:data.id,action:{wall:null,dir:0}}}),failure==='error'?1000:7000);}
      terminate(){}
    };
  },failure);
  await page.goto('/');await page.locator('#settings').click();
  await page.locator('#layout').selectOption('8');await page.locator('#starter').selectOption('1');await page.locator('#start').click();
  await expect(page.locator('#turnCount')).toHaveText('2手目',{timeout:15000});
  await expect(page.locator('#cpuRecovery')).toBeVisible();
  await page.waitForTimeout(1300);
  await expect(page.locator('#turnCount')).toHaveText('2手目');
  await expect(page.locator('#skip')).toBeEnabled();
  await page.locator('#settings').click();await page.locator('#starter').selectOption('0');await page.locator('#start').click();
  await expect(page.locator('#turnCount')).toHaveText('1手目');
});

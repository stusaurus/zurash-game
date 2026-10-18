import {test,expect} from '@playwright/test';
for (const failure of ['constructor','postMessage','error','invalid','timeout']) {
 test(`CPU safely recovers from ${failure}`, async({page})=>{
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(failure=>{
   window.Worker=class {
    constructor(){if(failure==='constructor')throw Error('fixture constructor failure');}
    postMessage(data){
     if(failure==='postMessage')throw Error('fixture send failure');
     if(failure==='error')setTimeout(()=>this.onerror?.({}),20);
     if(failure==='invalid')setTimeout(()=>this.onmessage?.({data:{id:data.id,action:{wall:{wall:99,to:-1},dir:9}}}),20);
    }
    terminate(){}
   };
  },failure);
  await page.goto('/');
  for(let turn=0;turn<3;turn++){
   await expect(page.locator('#skip')).toBeEnabled();
   await page.locator('#skip').click();
   await page.locator('#directions button:not([disabled])').first().click();
   await expect(page.locator('#turnCount')).toHaveText(`${turn*2+3}手目`,{timeout:15000});
  }
  expect(errors).toEqual([]);
 });
}
test('reset terminates thinking worker; a late reply cannot alter a new local game',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  window.terminated=0;
  window.Worker=class {
   postMessage(data){const handler=this.onmessage;setTimeout(()=>handler?.({data:{id:data.id,action:{wall:null,dir:0}}}),1200);}
   terminate(){window.terminated++;}
  };
 });
 await page.goto('/');
 await page.locator('#skip').click();await page.locator('#directions button:not([disabled])').first().click();
 await expect(page.locator('#phaseTitle')).toContainText('CPUが考えています');
 await page.locator('#localMode').click();await page.locator('#start').click();
 await expect(page.locator('#turnCount')).toHaveText('1手目');
 await page.waitForTimeout(1500);
 await expect(page.locator('#turnCount')).toHaveText('1手目');
 expect(await page.evaluate(()=>window.terminated)).toBeGreaterThan(0);
 await expect(page.locator('#phaseTitle')).toContainText('プレイヤー1');expect(errors).toEqual([]);
});
test('cancelled setup does not change active difficulty or rematch configuration',async({page})=>{
 await page.goto('/');await page.locator('#settings').click();
 await page.locator('#cpuLevel').selectOption('search');await page.locator('#layout').selectOption('1');await page.locator('#starter').selectOption('1');
 await page.locator('#setupDialog .close').click();
 await expect(page.locator('#scores')).toContainText('CPU（つよい）');
 await page.locator('#settings').click();
 await expect(page.locator('#cpuLevel')).toHaveValue('strong');await expect(page.locator('#layout')).toHaveValue('0');await expect(page.locator('#starter')).toHaveValue('0');
});

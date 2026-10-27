import {test,expect} from '@playwright/test';
import {initial,actions,apply,key} from '../../src/engine.js';
import {seeded} from '../../src/ai.js';
import {readFileSync} from 'node:fs';

test('preflight: strong Worker is legal and responsive on both seats at 0 and 6 plies',async({page})=>{
  test.setTimeout(120000);
  await page.goto('/');
  for(let layout=4;layout<=8;layout++) for(const starter of [0,1]) {
    let state=initial(layout,starter),rng=seeded(91+layout+starter),seen=new Map();
    for(const ply of [0,6]) {
      if(ply===6) for(let n=0;n<6;n++){
        seen.set(key(state),(seen.get(key(state))||0)+1);
        const moves=actions(state).filter(a=>apply(state,a).winner===null);
        expect(moves.length).toBeGreaterThan(0);
        state=apply(state,moves[Math.floor(rng()*moves.length)]);
      }
      const legal=actions(state), times=[];
      for(let run=0;run<2;run++) {
        const result=await page.evaluate(({state,history,seed})=>new Promise((resolve,reject)=>{
          const start=performance.now(),worker=new Worker('/src/cpu-worker.js',{type:'module'});
          const timer=setTimeout(()=>{worker.terminate();reject(Error('Worker timeout'));},6000);
          worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(Error(e.message));};
          worker.onmessage=e=>{clearTimeout(timer);worker.terminate();resolve({data:e.data,ms:performance.now()-start});};
          worker.postMessage({id:1,state,history,seed,level:'strong'});
        }),{state,history:[...seen],seed:42+run});
        expect(result.data.error).toBeUndefined();expect(legal).toContainEqual(result.data.action);
        expect(result.ms).toBeLessThan(6000);times.push(Math.round(result.ms));
      }
      console.log('STRONG_PREFLIGHT',JSON.stringify({mode:'ABCDE'[layout-4],starter,ply,runs:times.length,min:Math.min(...times),max:Math.max(...times),legal:legal.length}));
    }
  }
});

for(const [layout,label] of [[4,'A'],[5,'B'],[6,'C'],[7,'D'],[8,'E']]) test(`strong UI mode ${label} CPU先後と戻る・設定取消`,async({page})=>{
  test.setTimeout(60000);
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  for(const starter of [0,1]){
    await page.locator('#settings').click();await page.locator('#layout').selectOption(String(layout));
    await page.locator('#cpuLevel').selectOption('strong');await page.locator('#starter').selectOption(String(starter));await page.locator('#start').click();
    if(starter===0){await page.locator('#skip').click();await page.locator('#directions button:not([disabled])').first().click();}
    await expect(page.locator('#turnCount')).toHaveText(starter===0?'3手目':'2手目',{timeout:15000});
    await expect(page.locator('#cpuRecovery')).toBeHidden();
    await expect(page.locator('#scores')).toContainText('CPU（恐つよ）');
    await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('search');
    await page.locator('#setupDialog .close').click();
    await expect(page.locator('#scores')).toContainText('CPU（恐つよ）');
    await expect(page.locator('#turnCount')).toHaveText(starter===0?'3手目':'2手目');
    await page.locator('#undo').click();
    await expect(page.locator('#skip')).toBeEnabled({timeout:15000});
  }
});

test('strong Worker invalid action is rejected and delayed replies cannot alter reset',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{window.Worker=class{postMessage(data){const cb=this.onmessage;setTimeout(()=>cb?.({data:{id:data.id,action:{wall:{wall:999,to:-1},dir:9}}}),20);setTimeout(()=>cb?.({data:{id:data.id,action:{wall:null,dir:0}}}),1200);}terminate(){}};});
  await page.goto('/');await page.locator('#settings').click();await page.locator('#layout').selectOption('8');
  await page.locator('#cpuLevel').selectOption('strong');await page.locator('#starter').selectOption('1');await page.locator('#start').click();
  await expect(page.locator('#turnCount')).toHaveText('2手目',{timeout:15000});
  await expect(page.locator('#cpuRecovery')).toBeVisible();
  await page.locator('#localMode').click();await page.locator('#starter').selectOption('0');await page.locator('#start').click();
  await page.waitForTimeout(1500);await expect(page.locator('#turnCount')).toHaveText('1手目');
});

test('strong Worker late response cannot alter a new game while thinking',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{window.Worker=class{postMessage(data){const cb=this.onmessage;setTimeout(()=>cb?.({data:{id:data.id,action:{wall:null,dir:0}}}),1500);}terminate(){}};});
  await page.goto('/');await page.locator('#settings').click();await page.locator('#layout').selectOption('8');
  await page.locator('#cpuLevel').selectOption('strong');await page.locator('#starter').selectOption('1');await page.locator('#start').click();
  await expect(page.locator('#phaseTitle')).toContainText('CPUが考えています');
  await page.locator('#localMode').click();await page.locator('#starter').selectOption('0');await page.locator('#start').click();
  await page.waitForTimeout(1700);await expect(page.locator('#turnCount')).toHaveText('1手目');
  await expect(page.locator('#phaseTitle')).toContainText('プレイヤー1');
});

for (const level of ['random','greedy','search','strong']) test(`${level} mode B preserves setup across a completed game and rematch`,async({page})=>{
  const fixture=JSON.parse(readFileSync(new URL('./five-mode-fixtures.json',import.meta.url))).find(x=>x.mode==='B');
  let s=initial(fixture.layoutIndex,fixture.starter);const cpu=[];
  for(const action of fixture.actions){if(s.turn===1)cpu.push({state:JSON.stringify(s),action});s=apply(s,action);}
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(cpu=>{window.Worker=class{postMessage(data){const move=cpu.find(x=>x.state===JSON.stringify(data.state));setTimeout(()=>this.onmessage?.({data:{id:data.id,action:move?.action}}),10);}terminate(){}};},cpu);
  await page.goto('/');await page.locator('#settings').click();await page.locator('#layout').selectOption(String(fixture.layoutIndex));await page.locator('#cpuLevel').selectOption(level);await page.locator('#starter').selectOption('0');await page.locator('#start').click();
  s=initial(fixture.layoutIndex,fixture.starter);
  for(const action of fixture.actions){
    const next=apply(s,action);
    if(s.turn===0){if(action.wall){await page.locator(`[data-cell="${s.walls[action.wall.wall]}"]`).click();await page.locator(`[data-cell="${action.wall.to}"]`).click();}else await page.locator('#skip').click();await page.locator('#directions button').nth(action.dir).click();}
    if(next.winner===null&&next.turn===0)await expect(page.locator('#turnCount')).toHaveText(`${next.ply+1}手目`,{timeout:15000});
    s=next;
  }
  await expect(page.locator('#result')).toBeVisible();await page.locator('#rematch').click();
  await expect(page.locator('#turnCount')).toHaveText('1手目');await page.locator('#settings').click();
  await expect(page.locator('#layout')).toHaveValue(String(fixture.layoutIndex));await expect(page.locator('#cpuLevel')).toHaveValue(level);
});

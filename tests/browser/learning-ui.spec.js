import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {initial,actions,apply} from '../../src/engine.js';
import {choose,seeded} from '../../src/ai.js';
import {turnSeed} from '../../src/cpu-seed.js';

const key='zurash-learning-v1';
for (const [layout,name] of [[0,'7×7'],[4,'A'],[5,'B'],[6,'C'],[7,'D'],[8,'E']]) {
  test(`${name} 学習CPUは未学習時にふつうと同じ合法手を返す`,async({page})=>{
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(()=>{
      const Original=window.Worker;window.requests=[];
      window.Worker=class extends Original {postMessage(data){const entry={request:structuredClone(data)};window.requests.push(entry);this.addEventListener('message',e=>{if(e.data.id===data.id)entry.response=structuredClone(e.data);},{once:true});super.postMessage(data);}};
    });
    await page.goto('/');await page.locator('#settings').click();await page.locator('#layout').selectOption(String(layout));
    await page.locator('#cpuLevel').selectOption('learning');await page.locator('#starter').selectOption('1');await page.locator('#start').click();
    await expect(page.locator('#turnCount')).toHaveText('2手目',{timeout:15000});
    await expect(page.locator('#cpuRecovery')).toBeHidden();await expect(page.locator('#undo')).toBeDisabled();
    await expect(page.locator('#scores')).toContainText('CPU（学習）');
    const {request,response}=await page.evaluate(()=>window.requests[0]);
    expect(request.level).toBe('learning');expect(response.error).toBeUndefined();expect(actions(request.state)).toContainEqual(response.action);
    expect(response.action).toEqual(choose(request.state,{level:'greedy',rng:seeded(turnSeed(request.seed,request.state.ply)),seen:new Map(request.history)}));
  });
}

test('設定取消・途中破棄・未決着確認・学習リセット',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');
  await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('learning');await page.locator('#start').click();
  await expect(page.locator('#learningStats')).toContainText('0局');await expect(page.locator('#undo')).toBeDisabled();
  await page.locator('#skip').click();await page.locator('#directions button:not([disabled])').first().click();
  await expect(page.locator('#turnCount')).toHaveText('3手目',{timeout:15000});
  expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
  await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('strong');await page.locator('#setupDialog .close').click();
  await expect(page.locator('#scores')).toContainText('CPU（学習）');await expect(page.locator('#turnCount')).toHaveText('3手目');
  page.once('dialog',d=>d.dismiss());await page.locator('#recordUnresolved').click();await expect(page.locator('#turnCount')).toHaveText('3手目');
  page.once('dialog',d=>d.accept());await page.locator('#recordUnresolved').click();
  await expect(page.locator('#learningStats')).toContainText('未決着1局');await expect(page.locator('#learningStats')).toContainText('学習1手');
  let model=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);expect([model.total,model.draws,model.samples,model.matchIds.length]).toEqual([1,1,1,1]);
  await page.locator('#settings').click();await page.locator('#start').click();
  expect(await page.evaluate(k=>JSON.parse(localStorage.getItem(k)).total,key)).toBe(1);
  await page.reload();await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('learning');await page.locator('#start').click();
  await expect(page.locator('#learningStats')).toContainText('未決着1局');
  page.once('dialog',d=>d.dismiss());await page.locator('#resetLearning').click();await expect(page.locator('#learningStats')).toContainText('未決着1局');
  page.once('dialog',d=>d.accept());await page.locator('#resetLearning').click();await expect(page.locator('#learningStats')).toContainText('0局');
  expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
});

test('終局は一度だけ記録され再戦は新しい対局になる',async({page})=>{
  const fixture=JSON.parse(readFileSync(new URL('./five-mode-fixtures.json',import.meta.url))).find(x=>x.mode==='B');
  let state=initial(fixture.layoutIndex,fixture.starter);const cpu=[];
  for(const action of fixture.actions){if(state.turn===1)cpu.push({state:JSON.stringify(state),action});state=apply(state,action);}
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(cpu=>{window.Worker=class{postMessage(data){const move=cpu.find(x=>x.state===JSON.stringify(data.state));setTimeout(()=>this.onmessage?.({data:{id:data.id,action:move?.action}}),10);}terminate(){}};},cpu);
  await page.goto('/');await page.locator('#settings').click();await page.locator('#layout').selectOption(String(fixture.layoutIndex));await page.locator('#cpuLevel').selectOption('learning');await page.locator('#start').click();
  state=initial(fixture.layoutIndex,fixture.starter);let humanMoves=0;
  for(const action of fixture.actions){
    const next=apply(state,action);
    if(state.turn===0){humanMoves++;if(action.wall){await page.locator(`[data-cell="${state.walls[action.wall.wall]}"]`).click();await page.locator(`[data-cell="${action.wall.to}"]`).click();}else await page.locator('#skip').click();await page.locator('#directions button').nth(action.dir).click();}
    if(next.winner===null&&next.turn===0)await expect(page.locator('#turnCount')).toHaveText(`${next.ply+1}手目`,{timeout:15000});
    state=next;
  }
  await expect(page.locator('#result')).toBeVisible();let model=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);
  expect(model.total).toBe(1);expect(model.samples).toBe(humanMoves);expect(model.wins).toBe(Number(state.winner===0));expect(model.losses).toBe(Number(state.winner===1));
  await page.locator('#rematch').click();await expect(page.locator('#turnCount')).toHaveText('1手目');
  page.once('dialog',d=>d.accept());await page.locator('#recordUnresolved').click();
  model=await page.evaluate(k=>JSON.parse(localStorage.getItem(k)),key);expect(model.total).toBe(2);expect(model.draws).toBe(1);expect(new Set(model.matchIds).size).toBe(2);
});

test('保存障害時は警告しながら対戦を継続できる',async({page})=>{
  await page.addInitScript(()=>{Storage.prototype.setItem=function(){throw Error('quota')};});
  await page.emulateMedia({reducedMotion:'reduce'});await page.goto('/');await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('learning');await page.locator('#start').click();
  page.once('dialog',d=>d.accept());await page.locator('#recordUnresolved').click();
  await expect(page.locator('#learningWarning')).toBeVisible();await expect(page.locator('#learningStats')).toContainText('未決着1局');await expect(page.locator('#skip')).toBeEnabled();
});

test('保存済みモデルを読み込み実Workerへ渡す',async({page})=>{
  const model={version:1,wins:1,losses:0,draws:0,total:1,samples:8,contexts:{'7x7:3:0':[8,...Array(15).fill(0)]},matchIds:['saved_game']};
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(({key,model})=>{
    localStorage.setItem(key,JSON.stringify(model));const Original=window.Worker;window.learningRequest=null;
    window.Worker=class extends Original {postMessage(data){window.learningRequest=structuredClone(data);super.postMessage(data);}};
  },{key,model});
  await page.goto('/');await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('learning');await page.locator('#starter').selectOption('1');await page.locator('#start').click();
  await expect(page.locator('#turnCount')).toHaveText('2手目',{timeout:15000});await expect(page.locator('#learningStats')).toContainText('学習8手');
  expect((await page.evaluate(()=>window.learningRequest)).opponentModel).toEqual(model);
});

test('途中で2人対戦に変更すると未完了対局を破棄し古いCPU応答を無視する',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.addInitScript(()=>{window.Worker=class {postMessage(data){const reply=this.onmessage;setTimeout(()=>reply?.({data:{id:data.id,action:{wall:null,dir:0}}}),1000);}terminate(){}};});
  await page.goto('/');await page.locator('#settings').click();await page.locator('#cpuLevel').selectOption('learning');await page.locator('#starter').selectOption('1');await page.locator('#start').click();
  await expect(page.locator('#phaseTitle')).toContainText('CPUが考えています');
  await page.locator('#localMode').click();await page.locator('#starter').selectOption('0');await page.locator('#start').click();
  await page.waitForTimeout(1200);await expect(page.locator('#turnCount')).toHaveText('1手目');
  await expect(page.locator('#learningPanel')).toBeHidden();expect(await page.evaluate(k=>localStorage.getItem(k),key)).toBeNull();
});

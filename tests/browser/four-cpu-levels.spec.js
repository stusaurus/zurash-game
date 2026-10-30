import { test, expect } from '@playwright/test';
import { actions } from '../../src/engine.js';
import { choose, seeded } from '../../src/ai.js';
import { turnSeed } from '../../src/cpu-seed.js';

const levels = [['random','やさしい'],['greedy','ふつう'],['search','つよい'],['strong','恐つよ']];
// Keep CPU difficulty and seat combinations independent. Large research
// layouts C/E may require expensive Worker searches: batching eight matches
// in one 120-second WebKit test previously timed out under CI load.
for (const [layout, name] of [[0,'7×7'],[4,'A'],[5,'B'],[6,'C'],[7,'D'],[8,'E']])
for (const [level,label] of levels)
for (const starter of [0,1]) {
  test(`${name} CPU（${label}）${starter===0?'人間先手':'CPU先手'}: 実Workerと設定・取消・戻る`, async ({page}) => {
    test.setTimeout(120000);
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.cpuRequests = [];
      window.Worker = class extends NativeWorker {
        postMessage(data) {
          const record = {request: structuredClone(data)};
          window.cpuRequests.push(record);
          this.addEventListener('message', event => { if (event.data.id === data.id) record.response = structuredClone(event.data); }, {once:true});
          super.postMessage(data);
        }
      };
    });
    await page.goto('/');
    await page.locator('#settings').click();
      await page.locator('#layout').selectOption(String(layout));
      await page.locator('#cpuLevel').selectOption(level);
      await page.locator('#starter').selectOption(String(starter));
      await page.locator('#start').click();
      if (starter===0) {
        await page.locator('#skip').click();
        await page.locator('#directions button:not([disabled])').first().click();
      }
      await expect(page.locator('#turnCount')).toHaveText(starter===0?'3手目':'2手目',{timeout:15000});
      await expect(page.locator('#cpuRecovery')).toBeHidden();
      await expect(page.locator('#scores')).toContainText(`CPU（${label}）`);
      const record = await page.evaluate(() => window.cpuRequests.at(-1));
      expect(record.request.level).toBe(level);
      expect(record.response.error).toBeUndefined();
      expect(actions(record.request.state)).toContainEqual(record.response.action);
      const {state,seed,history} = record.request;
      expect(record.response.action).toEqual(choose(state,{level,rng:seeded(turnSeed(seed,state.ply)),seen:new Map(history)}));
      await page.locator('#settings').click();
      await page.locator('#cpuLevel').selectOption(level==='random'?'strong':'random');
      await page.locator('#setupDialog .close').click();
      await expect(page.locator('#scores')).toContainText(`CPU（${label}）`);
      await page.locator('#undo').click();
      await expect(page.locator('#skip')).toBeEnabled({timeout:15000});
      await page.locator('#settings').click();
      await expect(page.locator('#cpuLevel')).toHaveValue(level);
      await page.locator('#setupDialog .close').click();
  });
}

test('初期値と難易度名は指定の5段階', async ({page}) => {
  await page.goto('/');
  await expect(page.locator('#scores')).toContainText('CPU（ふつう）');
  await page.locator('#settings').click();
  await expect(page.locator('#cpuLevel')).toHaveValue('greedy');
  expect(await page.locator('#cpuLevel option').evaluateAll(options => options.map(o => [o.value,o.textContent]))).toEqual([...levels,['learning','学習']]);
});

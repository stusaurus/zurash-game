import { test, expect } from '@playwright/test';
import { initial, movableWalls, slideOptions, moveWall } from '../../src/engine.js';
import { apply } from '../../src/engine.js';
import { readFileSync } from 'node:fs';
const fixtures = JSON.parse(readFileSync(new URL('./five-mode-fixtures.json', import.meta.url)));

for (const [index, size, target] of [[4,8,4],[5,9,3],[6,10,3],[7,6,4],[8,11,3]]) {
  test(`研究盤面 ${index-3}: 選択、壁移動、滑走、戻る、再戦設定`, async ({page}) => {
    await page.emulateMedia({reducedMotion:'reduce'});
    await page.setViewportSize({width:390,height:844});
    await page.goto('/');
    await page.locator('#localMode').click();
    await page.locator('#layout').selectOption(String(index));
    await page.locator('#starter').selectOption('1');
    await page.locator('#start').click();
    await expect(page.locator('#board')).toHaveAttribute('aria-label', `${size}×${size}のゲーム盤`);
    await expect(page.locator('.cell')).toHaveCount(size*size);
    await expect(page.locator('#scores')).toContainText(`0 / ${target}`);
    await expect(page.locator('#phaseTitle')).toContainText('プレイヤー2');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const cellWidth=await page.locator('.cell').first().evaluate(el=>el.getBoundingClientRect().width);
    expect(cellWidth).toBeGreaterThanOrEqual(35);
    const state=initial(index,1), wall=movableWalls(state)[0];
    await page.locator(`[data-cell="${state.walls[wall.wall]}"]`).click();
    const delta=wall.to-state.walls[wall.wall];
    await expect(page.locator(`[data-cell="${wall.to}"]`)).toHaveText(({[-size]:'↑',[size]:'↓',[-1]:'←',[1]:'→'})[delta]);
    await page.locator(`[data-cell="${wall.to}"]`).click();
    await expect(page.locator('#phaseBadge')).toHaveText('2');
    const dir=slideOptions(moveWall(state,wall))[0].dir;
    await page.locator('#directions button').nth(dir).click();
    await expect(page.locator('#turnCount')).toHaveText('2手目');
    await page.locator('#undo').click();
    await expect(page.locator('#turnCount')).toHaveText('1手目');
    await page.locator('#skip').click();
    await page.locator('#directions button:not([disabled])').first().click();
    await expect(page.locator('#turnCount')).toHaveText('2手目');
    await page.locator('#settings').click();
    await expect(page.locator('#layout')).toHaveValue(String(index));
    await page.locator('#start').click();
    await expect(page.locator('#turnCount')).toHaveText('1手目');
    await page.locator('#cpuMode').click();
    await expect(page.locator('#layout')).toHaveValue(String(index));
    await expect(page.locator('#cpuLevel')).toHaveValue('greedy');
    await expect(page.locator('#cpuLevel option[value="strong"]')).not.toHaveAttribute('disabled', '');
    await expect(page.locator('#researchModeNotice')).toContainText('5段階');
    await page.locator('#layout').selectOption('0');
    await page.locator('#start').click();
    await expect(page.locator('.cell')).toHaveCount(49);
  });
}

test('CPU dialog rejects invalid difficulty supplied by script', async ({page}) => {
  await page.goto('/');
  await page.locator('#settings').click();
  await page.locator('#layout').selectOption('4');
  await page.locator('#cpuLevel').evaluate(el => { el.add(new Option('invalid', 'invalid')); el.value='invalid'; });
  await page.locator('#start').click();
  await expect(page.locator('#setupDialog')).toBeVisible();
  await expect(page.locator('#researchModeNotice')).toContainText('選び直してください');
  await expect(page.locator('.cell')).toHaveCount(49);
});

for (const f of fixtures) test(`研究盤面 ${f.mode}: 保存棋譜の得点、勝利、再戦`, async ({page}) => {
  test.setTimeout(120000);
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto('/');
  await page.locator('#localMode').click();
  await page.locator('#layout').selectOption(String(f.layoutIndex));
  await page.locator('#starter').selectOption(String(f.starter));
  await page.locator('#start').click();
  let state = initial(f.layoutIndex, f.starter), scores = 0;
  for (const action of f.actions) {
    if (action.wall) {
      await page.locator(`[data-cell="${state.walls[action.wall.wall]}"]`).click();
      await page.locator(`[data-cell="${action.wall.to}"]`).click();
    } else await page.locator('#skip').click();
    const next = apply(state, action);
    await page.locator('#directions button').nth(action.dir).click();
    if (next.scores[state.turn] > state.scores[state.turn]) {
      scores++;
      await expect(page.locator('#lastMove')).toContainText('ゲット');
      await expect(page.locator('#scores')).toContainText(`${next.scores[state.turn]} / ${next.target}`);
    }
    if (next.winner === null) await expect(page.locator('#turnCount')).toHaveText(`${next.ply+1}手目`);
    state = next;
  }
  expect(scores).toBeGreaterThan(0);
  expect(state.winner).toBe(f.winner);
  expect(state.scores).toEqual(f.scores);
  await expect(page.locator('#result')).toBeVisible();
  await expect(page.locator('#resultTitle')).toContainText(`プレイヤー${f.winner+1}`);
  await page.locator('#rematch').click();
  await expect(page.locator('#turnCount')).toHaveText('1手目');
  await expect(page.locator('.cell')).toHaveCount(state.size*state.size);
});

test('11×11盤面は各画面幅でスクロール可能でマスを押せる', async ({page}) => {
  await page.emulateMedia({reducedMotion:'reduce'});
  for (const width of [320,390,768,1200]) {
    await page.setViewportSize({width,height:900});
    await page.goto('/');
    await page.locator('#localMode').click();
    await page.locator('#layout').selectOption('8');
    await page.locator('#start').click();
    await expect(page.locator('.cell')).toHaveCount(121);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await page.locator('.cell').first().evaluate(el=>el.getBoundingClientRect().width)).toBeGreaterThanOrEqual(35);
    const state=initial(8), wall=movableWalls(state).at(-1);
    await page.locator(`[data-cell="${state.walls[wall.wall]}"]`).click();
    await expect(page.locator(`[data-cell="${wall.to}"]`)).toHaveClass(/target/);
  }
});

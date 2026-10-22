import {test,expect} from '@playwright/test';
import {MASK_LIBRARY} from '../../src/mask-library.js';
import {EVALUATED_MASK_LIBRARY} from '../../src/evaluated-mask-library.js';
import {initial,actions,apply} from '../../src/engine.js';
async function openLab(page){await page.locator('#settings').click();await page.locator('#boardLab > details > summary').click();}
async function importBoard(page,board){await page.locator('#boardLab details').last().locator('summary').click();await page.locator('#labJSON').fill(JSON.stringify(board));await page.locator('#labImport').click();}
async function move(page,s){const a=actions(s).find(a=>a.wall)??actions(s)[0];if(a.wall){await page.locator(`[data-cell="${s.walls[a.wall.wall]}"]`).click();await page.locator(`[data-cell="${a.wall.to}"]`).click();}else await page.locator('#skip').click();await page.locator('#directions button').nth(a.dir).click();const n=apply(s,a);await expect(page.locator('#turnCount')).toHaveText(`${n.ply+1}手目`);await expect(page.locator('#skip')).toBeEnabled();return n;}
test('all mask library shapes at 320px: moves, undo, rematch and square cells',async({page},info)=>{
 test.setTimeout(180000);const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.setViewportSize({width:320,height:860});await page.goto('/');await page.locator('#localMode').click();await page.locator('#boardLab > details > summary').click();
 for(let i=0;i<MASK_LIBRARY.length;i++){
  if(i)await page.locator('#settings').click();
  await page.locator('#labLibrary').selectOption(String(i));await page.locator('#labLoad').click();await page.locator('#labPlay').click();const r=MASK_LIBRARY[i],s=initial(r.board);
  await expect(page.locator('.cell')).toHaveCount(s.playableCells.length);await expect(page.locator('.terrain-gap')).toHaveCount(s.width*s.height-s.playableCells.length);await expect(page.locator('#boardSpec')).toContainText('未認定');
  const box=await page.locator('.cell').first().boundingBox();expect(Math.abs(box.width-box.height)).toBeLessThan(1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await move(page,s);await page.locator('#undo').click();await expect(page.locator('#turnCount')).toHaveText('1手目');
  if(Math.max(s.width,s.height)>7){await page.locator('#boardZoom').click();await expect.poll(async()=>(await page.locator('.cell').first().boundingBox()).width).toBeGreaterThanOrEqual(40);await page.locator('#boardZoom').click();}
  if([2,7].includes(i))await page.screenshot({path:info.outputPath(`mask-${r.shape}-320.png`),fullPage:true});
 }
 expect(errors).toEqual([]);
});
test('custom generation, editor validation, JSON round-trip and persistent library',async({page})=>{
 await page.goto('/');await openLab(page);
 await page.locator('#labShape').selectOption('ring');await page.locator('#labGenerate').click();await expect(page.locator('#labMessage')).toContainText('合法性確認済み');
 await page.locator('#labTool').selectOption('stars');await page.locator('#labEditor button').filter({hasText:/^$/}).first().click();await expect(page.locator('#labPlay')).toBeEnabled();
 await page.locator('#labSave').click();await expect(page.locator('#labMessage')).toContainText('保存しました');
 await page.locator('#boardLab details').last().locator('summary').click();await page.locator('#labExport').click();const json=await page.locator('#labJSON').inputValue();expect(JSON.parse(json).board.width).toBe(9);
 await page.locator('#labJSON').fill('{bad');await page.locator('#labImport').click();await expect(page.locator('#labMessage')).not.toContainText('書き出しました');
 await page.locator('#labJSON').fill(json);await page.locator('#labImport').click();await expect(page.locator('#labMessage')).toContainText('合法性確認済み');
 await page.reload();await openLab(page);await expect(page.locator('#labLibrary option')).toHaveCount(MASK_LIBRARY.length+EVALUATED_MASK_LIBRARY.length+1);
 await page.locator('#labShape').selectOption('L');await page.locator('#labSymmetry').selectOption('rotation');await page.locator('#labGenerate').click();await expect(page.locator('#labMessage')).toContainText('対称でない');
});
test('tall rectangle CPU starts, undo and random board works',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto('/');await openLab(page);
 await page.locator('#labWidth').fill('5');await page.locator('#labHeight').fill('9');await page.locator('#labCorridor').fill('2');await page.locator('#labRandom').click();await expect(page.locator('#labPlay')).toBeEnabled();
 await page.locator('#starter').selectOption('1');await page.locator('#labPlay').click();await expect(page.locator('#turnCount')).toHaveText('2手目',{timeout:20000});await expect(page.locator('#skip')).toBeEnabled();
 await expect(page.locator('#board')).toHaveAttribute('aria-label','5×9のゲーム盤');await page.locator('#undo').click();await expect(page.locator('#turnCount')).toHaveText('2手目',{timeout:20000});expect(errors).toEqual([]);
});
test('imported mask victory, winner dialog and rematch retain custom board',async({page})=>{
 await page.goto('/');await page.locator('#localMode').click();await page.locator('#boardLab > details > summary').click();
 const board={width:5,height:3,playableCells:Array.from({length:15},(_,i)=>i).filter(i=>i!==7),walls:[],stars:[4],players:[0,14],target:1};
 await importBoard(page,board);await page.locator('#labPlay').click();await page.locator('#skip').click();await page.locator('#directions button').nth(1).click();await expect(page.locator('#result')).toBeVisible();await expect(page.locator('#resultTitle')).toHaveText('プレイヤー1の勝ち！');await page.locator('#rematch').click();await expect(page.locator('.cell')).toHaveCount(14);await expect(page.locator('#turnCount')).toHaveText('1手目');
});
test('malicious JSON and huge dimensions stay recoverable; cancelled setup preserves game',async({page})=>{
 await page.goto('/');await openLab(page);await importBoard(page,{width:100000,height:100000,walls:[],stars:[],players:[]});await expect(page.locator('#labMessage')).toContainText('2〜16');
 await page.locator('#labJSON').fill('null');await page.locator('#labImport').click();await page.locator('[data-close="setupDialog"]').click();await expect(page.locator('.cell')).toHaveCount(49);await expect(page.locator('#skip')).toBeEnabled();
});

test('full generated research corpus loads on demand and is searchable',async({page})=>{
 await page.goto('/');await openLab(page);await page.locator('#labCorpus').click();await expect(page.locator('#labMessage')).toContainText('追加表示しました',{timeout:15000});expect(await page.locator('#labLibrary option').count()).toBeGreaterThan(1100);await page.locator('#labSearch').fill('くびれ');expect(await page.locator('#labLibrary option').count()).toBeGreaterThan(1);await page.locator('#labLoad').click();await expect(page.locator('#labPlay')).toBeEnabled();
});

test('discovery evidence separates turn and physical slots, remains playable and clears after editing',async({page},info)=>{
 await page.setViewportSize({width:320,height:860});await page.goto('/');await page.locator('#localMode').click();await page.locator('#boardLab > details > summary').click();await page.locator('#labDiscovery').click();await expect(page.locator('#labMessage')).toContainText('全件基礎評価1135面',{timeout:20000});
 const value=await page.locator('#labLibrary option[data-research="true"]').first().getAttribute('value');await page.locator('#labLibrary').selectOption(value);await page.locator('#labLoad').click();await expect(page.locator('#labEvidence')).toContainText('物理的な初期位置');await expect(page.locator('#labEvidence')).toContainText('独立条件');await expect(page.locator('#labEvidence')).toContainText('未認定');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.locator('#labEvidence').screenshot({path:info.outputPath('discovery-evidence-320.png')});await page.locator('#labPlay').click();await expect(page.locator('#boardSpec')).toContainText('研究用・未認定');await page.locator('#settings').click();await page.locator('#labTarget').fill('1');await page.locator('#labTarget').blur();await expect(page.locator('#labEvidence')).toContainText('編集後の盤面はAI未検証');await expect(page.locator('#labEvidence')).not.toContainText('独立条件');
});

test('stall research displays proven structural issue and retains playable research alternatives',async({page})=>{
 await page.setViewportSize({width:320,height:860});await page.goto('/');await page.locator('#localMode').click();await page.locator('#boardLab > details > summary').click();await page.locator('#labStall').click();await expect(page.locator('#labMessage')).toContainText('停滞研究',{timeout:20000});
 await page.locator('#labSearch').fill('z-55f2fedf');await page.locator('#labLoad').click();await expect(page.locator('#labEvidence')).toContainText('全到達状態の列挙で勝利不能');await expect(page.locator('#labEvidence')).toContainText('物理的な初期位置');
 await page.locator('#labSearch').fill('停滞改善');await page.locator('#labLoad').click();await expect(page.locator('#labEvidence')).not.toContainText('全到達状態の列挙で勝利不能');await expect(page.locator('#labEvidence')).toContainText('独立条件');expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#labPlay').click();await expect(page.locator('#boardSpec')).toContainText('未認定');await expect(page.locator('#skip')).toBeEnabled();
});

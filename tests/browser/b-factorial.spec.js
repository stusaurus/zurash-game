import {test,expect} from '@playwright/test';
test('factorial evidence viewer preserves all four results and has no horizontal overflow',async({page})=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 for(const width of [320,1200]){
  await page.setViewportSize({width,height:900});await page.goto('/reports/b-factorial-2026-10-24/replay.html');
  await expect(page.locator('#board .cell')).toHaveCount(81);await expect(page.locator('#board .pawn')).toHaveCount(2);
  await expect(page.locator('#status')).toContainText('実行済み35手');
  for(const index of [0,1,2,3]){
   await page.locator('#arm').selectOption({index});await page.locator('#last').click();
   await expect(page.locator('#status')).toContainText('実行済み'+[37,73,37,62][index]+'手');
   await expect(page.locator('#result')).toContainText(index===3?'対象側の勝利':'対象側の敗北');
   await page.locator('#first').click();await expect(page.locator('#status')).toContainText('実行済み35手');
  }
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator('#case').selectOption({index:1});await expect(page.locator('#board .pawn')).toHaveCount(2);
 }
 expect(errors).toEqual([]);
});

import { slideByBoard } from "./tap-target.js";
import {test,expect} from '@playwright/test';

test('narrow screens keep the first board visible and controls operable',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});await page.goto('/');
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const board=await page.locator('#board').boundingBox();expect(board.y).toBeLessThan(844);
    await expect(page.locator('#settings')).toBeVisible();await page.locator('#localMode').click();await page.locator('#layout').selectOption('8');await page.locator('#start').click();
    await expect(page.locator('.cell')).toHaveCount(121);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const cellWidth=await page.locator('.cell').first().evaluate(el=>el.getBoundingClientRect().width);expect(cellWidth).toBeGreaterThanOrEqual(35);
    await page.locator('#skip').click();await expect(page.locator('#board .cell.stop:not([disabled])').first()).toBeVisible();
    await slideByBoard(page);await expect(page.locator('#turnCount')).toHaveText('2手目');
  }
});

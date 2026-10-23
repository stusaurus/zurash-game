import {test,expect} from '@playwright/test';
import {initial,actions,apply,ALL_LAYOUTS as LAYOUTS} from '../../src/engine.js';
for(const width of [320,390,768,1200])test(`five research boards at ${width}px`,async({page},testInfo)=>{
 const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.setViewportSize({width,height:900});await page.goto('/');await page.locator('#localMode').click();
 for(let i=4;i<LAYOUTS.length;i++){
  if(i>4)await page.locator('#settings').click();
  await page.locator('#layout').selectOption(String(i));await page.locator('#starter').selectOption('1');await page.locator('#start').click();
  let s=initial(i,1);await expect(page.locator('.cell')).toHaveCount(s.size**2);await expect(page.locator('#boardSpec')).toContainText(`${s.target}個先取`);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  for(let k=0;k<3;k++){const options=actions(s);const a=options.find(a=>a.wall)??options[0];if(a.wall){await page.locator(`[data-cell="${s.walls[a.wall.wall]}"]`).click();await page.locator(`[data-cell="${a.wall.to}"]`).click();}else await page.locator('#skip').click();await page.locator('#directions button').nth(a.dir).click();s=apply(s,a);await expect(page.locator('#turnCount')).toHaveText(`${s.ply+1}手目`);await expect(page.locator('#skip')).toBeEnabled();}
  if(s.size>7&&width<=390){await page.locator('#boardZoom').click();await expect(page.locator('#boardZoom')).toHaveAttribute('aria-pressed','true');await expect.poll(async()=> (await page.locator('.cell').first().boundingBox())?.width??0).toBeGreaterThanOrEqual(40);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);await page.locator('#boardZoom').click();}
  const b=await page.locator('#board').boundingBox();expect(Math.abs(b.width-b.height)).toBeLessThan(1);
  if(width===390&&testInfo.project.name==='iphone-webkit')await page.screenshot({path:testInfo.outputPath(`board-${LAYOUTS[i].id}-mobile.png`),fullPage:true});
  await page.locator('#settings').click();await page.locator('#start').click();await expect(page.locator('#turnCount')).toHaveText('1手目');
 }
 expect(errors).toEqual([]);
});

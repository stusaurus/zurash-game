import {test,expect} from "@playwright/test";
import {initialDuration,successorsDuration} from "../../experiments/duration-engine.js";
import {chooseDuration} from "../../experiments/duration-ai.js";
import {seeded} from "../../src/ai.js";
for(const [id,size,stars,target,curries] of [
 ["quick7",7,5,3,2],["deep7",7,9,5,2],["wide9",9,9,5,2]
]){
 test("duration mode "+id+" displays "+size+"x"+size+" and accepts a real turn",async({page})=>{
  test.setTimeout(60000);
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("/experiments/duration-lab.html");
  await page.locator("#opponent").selectOption("local");
  await page.locator("#durationMode").selectOption(id);
  await expect(page.locator("#board .cell")).toHaveCount(size*size);
  await expect(page.locator("#board")).toHaveAttribute("data-size",String(size));
  await expect(page.locator(".star")).toHaveCount(stars);
  await expect(page.locator(".curry")).toHaveCount(curries);
  await expect(page.locator("#goalChip")).toHaveText("星"+target+"個先取");
  const bounds=await page.locator("#board").boundingBox();
  expect(Math.abs(bounds.width-bounds.height)).toBeLessThan(2);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.locator("#skip").click();
  await page.locator("#directions button:not([disabled])").first().click();
  await expect(page.locator("#turnCount")).toHaveText("1手");
  await expect(page.locator("#last")).toContainText("プレイヤー1");
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("0手");
  await page.locator("#curryMode").selectOption("off");
  await expect(page.locator(".curry")).toHaveCount(0);
  await expect(page.locator("#modeInfo")).toContainText("なし");
  await page.locator("#skip").click();
  await page.locator("#directions button:not([disabled])").first().click();
  await expect(page.locator("#scores")).not.toContainText("🍛");
  expect(errors).toEqual([]);
 });
}
test("7x7 and 9x9 lab CPU responds without a frozen UI",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/duration-lab.html");
 await page.locator("#durationMode").selectOption("wide9");
 await page.locator("#curryMode").selectOption("off");
 await page.locator("#skip").click();
 await page.locator("#directions button:not([disabled])").first().click();
 await expect(page.locator("#turnCount")).not.toHaveText("1手",{timeout:30000});
 await expect(page.locator("#skip")).toBeEnabled({timeout:30000});
 await expect(page.locator(".curry")).toHaveCount(0);
 await expect(page.locator("#board .cell")).toHaveCount(81);
 expect(errors).toEqual([]);
});
test("a completed 5-minute candidate records actual elapsed and never claims a guaranteed duration",async({page})=>{
 test.setTimeout(90000);
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/duration-lab.html");
 await page.locator("#opponent").selectOption("local");
 await page.locator("#curryMode").selectOption("off");
 await page.locator("#new").click();
 let s=initialDuration("quick7",false,0);
 for(let i=0;i<55&&s.winner===null;i++){
  const a=chooseDuration(s,{level:"greedy",rng:seeded(550+i)});
  const result=successorsDuration(s).find(x=>JSON.stringify(x.a)===JSON.stringify(a));
  expect(result).toBeDefined();
  if(a.wall===null)await page.locator("#skip").click();
  else{
   await page.locator('[data-cell="'+s.walls[a.wall.wall]+'"]').click();
   await page.locator('[data-cell="'+a.wall.to+'"]').click();
  }
  await page.locator("#directions button").nth(a.dir).click();
  s=result.n;
 }
 expect(s.winner).not.toBeNull();
 await expect(page.locator("#result")).toBeVisible();
 await expect(page.locator("#resultMode")).toContainText("5分候補");
 await expect(page.locator("#resultMode")).toContainText("カレーなし");
 await expect(page.locator("#resultText")).toContainText("星 "+s.scores[0]+"対"+s.scores[1]);
 await expect(page.locator("#resultText")).toContainText("手");
 await expect(page.locator("#resultStats")).not.toContainText("カレー獲得");
 await expect(page.locator("#turnCount")).toContainText(String(s.ply));
 expect(errors).toEqual([]);
});

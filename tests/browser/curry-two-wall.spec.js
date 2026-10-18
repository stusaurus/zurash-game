import {test,expect} from "@playwright/test";
import {initialCurry} from "../../experiments/curry-power.js";
import {successorsTwoWall} from "../../experiments/curry-two-wall.js";
test("iPhone-sized double-wall page opens with symmetric curry and original rule preserved",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/curry-two-wall.html");
 await expect(page.locator("#board .cell")).toHaveCount(49);
 await expect(page.locator(".curry")).toHaveCount(2);
 await expect(page.locator("#curryPair")).toHaveValue("21,27");
 await expect(page.locator('[data-cell="21"]')).toContainText("🍛");
 await expect(page.locator('[data-cell="27"]')).toContainText("🍛");
 await expect(page.locator("#status")).toContainText("壁を1個選ぼう");
 const box=await page.locator("#board").boundingBox();
 expect(Math.abs(box.width-box.height)).toBeLessThan(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 expect(errors).toEqual([]);
});
test("player picks curry and can visibly move TWO different walls before sliding once",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/curry-two-wall.html");
 await page.locator("#mode").selectOption("local");
 await page.locator("#curryPair").selectOption("13,35");
 await page.locator("#new").click();
 let s=initialCurry(2,0,[13,35]);
 async function play(first,dir,second=null){
   const candidates=successorsTwoWall(s);
   const e=candidates.find(x=>x.a.dir===dir &&
     (first===null?x.a.wall===null:x.a.wall?.wall===first.wall&&x.a.wall?.to===first.to) &&
     (second===null?x.a.secondWall===null:x.a.secondWall?.wall===second.wall&&x.a.secondWall?.to===second.to));
   expect(e).toBeDefined();
   if(first!==null){
     await page.locator('[data-cell="'+s.walls[first.wall]+'"]').click();
     await page.locator('[data-cell="'+first.to+'"]').click();
     if(second!==null){
       await expect(page.locator("#status")).toContainText("もう1個");
       await page.locator('[data-cell="'+s.walls[second.wall]+'"]').click();
       await page.locator('[data-cell="'+second.to+'"]').click();
     } else if(s.powers[s.turn]){
       await page.locator("#skip").click();
     }
   } else await page.locator("#skip").click();
   await page.locator("#directions button").nth(dir).click();
   s=e.n;
 }
 await play(null,0);
 await play({wall:s.walls.indexOf(36),to:43},2);
 await play({wall:s.walls.indexOf(43),to:42},2);
 await expect(page.locator("#scores")).toContainText("🍛 次の自分の番に壁を2個まで");
 await play(null,0);
 await expect(page.locator("#status")).toContainText("パワー発動中");
 const double=successorsTwoWall(s).find(x=>x.a.secondWall!==null);
 expect(double).toBeDefined();
 expect(double.a.wall.wall).not.toBe(double.a.secondWall.wall);
 await play(double.a.wall,double.a.dir,double.a.secondWall);
 await expect(page.locator("#last")).toContainText("壁2個！");
 await expect(page.locator("#scores")).not.toContainText("🍛 次の自分の番に壁を2個まで");
 expect(errors).toEqual([]);
});
test("experimental CPU takes its turn and new match resets",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/curry-two-wall.html");
 await page.locator("#skip").click();
 await page.locator("#directions button:not([disabled])").first().click();
 await expect(page.locator("#last")).toContainText("プレイヤー2",{timeout:30000});
 await expect(page.locator("#skip")).toBeEnabled({timeout:30000});
 await page.locator("#new").click();
 await expect(page.locator("#last")).toBeEmpty();
 await expect(page.locator(".curry")).toHaveCount(2);
 expect(errors).toEqual([]);
});

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
 const overflow=await page.evaluate(()=>({
  viewport:innerWidth,
  documentWidth:document.documentElement.scrollWidth,
  scrollBoxes:[...document.querySelectorAll("html,body,main,section,header,select,button,label,div")]
   .filter(x=>x.scrollWidth>x.clientWidth+2)
   .slice(0,15).map(x=>({tag:x.tagName,id:x.id,
     className:typeof x.className==="string"?x.className:"",
     scrollWidth:x.scrollWidth,clientWidth:x.clientWidth})),
  overflowText:(()=>{
   const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),found=[];
   let node;
   while((node=walk.nextNode())){
    if(!node.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);
    if([...range.getClientRects()].some(r=>r.right>innerWidth+1))
      found.push({text:node.textContent.trim().slice(0,36),
        right:Math.round(range.getBoundingClientRect().right)});
   }
   return found.slice(0,10);
  })(),
  outliers:[...document.querySelectorAll("body *")].filter(x=>x.getBoundingClientRect().right>innerWidth+1)
   .slice(0,10).map(x=>({tag:x.tagName,id:x.id,className:typeof x.className==="string"?x.className:"",
   right:Math.round(x.getBoundingClientRect().right),width:Math.round(x.getBoundingClientRect().width),
   text:(x.textContent||"").slice(0,38)})),
 }));
 expect(overflow.documentWidth,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
 expect(overflow.outliers).toEqual([]);
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


test("curry-on/off switch starts a clean classic game and back to curry without ghost tiles",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/curry-two-wall.html");
 await expect(page.locator("#curryMode")).toHaveValue("on");
 await expect(page.locator(".curry")).toHaveCount(2);
 await page.locator("#curryMode").selectOption("off");
 await expect(page.locator(".curry")).toHaveCount(0);
 await expect(page.locator("#modeDescription")).toContainText("カレーなし");
 await expect(page.locator("#legendCurry")).toBeHidden();
 await expect(page.locator("#curryPair")).toBeDisabled();
 await expect(page.locator("#curryPairLabel")).toBeHidden();
 await expect(page.locator("#board .cell")).toHaveCount(49);
 await expect(page.locator("#scores")).not.toContainText("🍛");
 await page.locator("#mode").selectOption("local");
 await page.locator("#new").click();
 await page.locator("#skip").click();
 await page.locator("#directions button:not([disabled])").first().click();
 await expect(page.locator("#last")).toContainText("プレイヤー1");
 await expect(page.locator(".curry")).toHaveCount(0);
 await expect(page.locator("#scores")).not.toContainText("🍛");
 await page.locator("#undo").click();
 await expect(page.locator("#last")).toBeEmpty();
 await expect(page.locator(".curry")).toHaveCount(0);
 await page.locator("#curryMode").selectOption("on");
 await expect(page.locator(".curry")).toHaveCount(2);
 await expect(page.locator("#legendCurry")).toBeVisible();
 await expect(page.locator("#curryPairLabel")).toBeVisible();
 await expect(page.locator("#curryPair")).toBeEnabled();
 await expect(page.locator("#last")).toBeEmpty();
 const overflow=await page.evaluate(()=>({
  viewport:innerWidth,
  documentWidth:document.documentElement.scrollWidth,
  scrollBoxes:[...document.querySelectorAll("html,body,main,section,header,select,button,label,div")]
   .filter(x=>x.scrollWidth>x.clientWidth+2)
   .slice(0,15).map(x=>({tag:x.tagName,id:x.id,
     className:typeof x.className==="string"?x.className:"",
     scrollWidth:x.scrollWidth,clientWidth:x.clientWidth})),
  overflowText:(()=>{
   const walk=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT),found=[];
   let node;
   while((node=walk.nextNode())){
    if(!node.textContent.trim())continue;
    const range=document.createRange();range.selectNodeContents(node);
    if([...range.getClientRects()].some(r=>r.right>innerWidth+1))
      found.push({text:node.textContent.trim().slice(0,36),
        right:Math.round(range.getBoundingClientRect().right)});
   }
   return found.slice(0,10);
  })(),
  outliers:[...document.querySelectorAll("body *")].filter(x=>x.getBoundingClientRect().right>innerWidth+1)
   .slice(0,10).map(x=>({tag:x.tagName,id:x.id,className:typeof x.className==="string"?x.className:"",
   right:Math.round(x.getBoundingClientRect().right),width:Math.round(x.getBoundingClientRect().width),
   text:(x.textContent||"").slice(0,38)})),
 }));
 expect(overflow.documentWidth,JSON.stringify(overflow)).toBeLessThanOrEqual(overflow.viewport);
 expect(overflow.outliers).toEqual([]);
 expect(errors).toEqual([]);
});

test("CPU plays a turn without curry and never produces a power bonus",async({page})=>{
 const errors=[];page.on("pageerror",e=>errors.push(String(e)));
 await page.goto("/experiments/curry-two-wall.html");
 await page.locator("#curryMode").selectOption("off");
 await page.locator("#skip").click();
 await page.locator("#directions button:not([disabled])").first().click();
 await expect(page.locator("#last")).toContainText("プレイヤー2",{timeout:30000});
 await expect(page.locator("#skip")).toBeEnabled({timeout:30000});
 await expect(page.locator(".curry")).toHaveCount(0);
 await expect(page.locator("#scores")).not.toContainText("🍛");
 expect(errors).toEqual([]);
});

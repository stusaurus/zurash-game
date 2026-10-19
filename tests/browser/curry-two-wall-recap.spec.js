import {test,expect} from "@playwright/test";
import {initialTwoWall,successorsTwoWall} from "../../experiments/curry-two-wall.js";
import {chooseTwoWall} from "../../experiments/curry-two-wall-ai.js";
import {stateKeyCurry} from "../../experiments/curry-power.js";
import {seeded} from "../../src/ai.js";
import {turnSeed} from "../../src/cpu-seed.js";

// Produce a legal complete match before touching the UI. The browser then
// performs every real selection rather than mocking the result dialog.
function finishedGreedyLine(enabled){
 for(let seed=20;seed<80;seed++){
  let s=initialTwoWall(2,0,{curryEnabled:enabled,pair:[21,27]});
  const seen=new Map(),line=[];
  for(let n=0;n<25 && s.winner===null;n++){
   const k=stateKeyCurry(s);seen.set(k,(seen.get(k)||0)+1);
   const a=chooseTwoWall(s,{level:"greedy",seen,
     rng:seeded(turnSeed(seed,s.ply))});
   const chosen=successorsTwoWall(s).find(x=>JSON.stringify(x.a)===JSON.stringify(a));
   if(!chosen)throw Error("study agent produced illegal move");
   line.push({before:s,action:chosen.a,after:chosen.n});
   s=chosen.n;
  }
  if(s.winner!==null && line.length<=25)return line;
 }
 throw Error("no test match found");
}
async function playAction(page,{before,action}){
 if(action.wall===null){
  await page.locator("#skip").click();
 }else{
  await page.locator('[data-cell="'+before.walls[action.wall.wall]+'"]').click();
  await page.locator('[data-cell="'+action.wall.to+'"]').click();
  if(action.secondWall!==null){
   await page.locator('[data-cell="'+before.walls[action.secondWall.wall]+'"]').click();
   await page.locator('[data-cell="'+action.secondWall.to+'"]').click();
  }else if(before.powers[before.turn]){
   await page.locator("#skip").click();
  }
 }
 await page.locator("#directions button").nth(action.dir).click();
}
for(const enabled of [false,true]){
 test("post-match commentary and count agree with real "+(enabled?"curry":"classic")+" rule",async({page})=>{
  test.setTimeout(90000);
  const errors=[];page.on("pageerror",e=>errors.push(String(e)));
  await page.goto("/experiments/curry-two-wall.html");
  await page.locator("#mode").selectOption("local");
  if(!enabled)await page.locator("#curryMode").selectOption("off");
  await page.locator("#new").click();
  const line=finishedGreedyLine(enabled);
  for(const move of line)await playAction(page,move);
  const ending=line.at(-1).after;
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#resultMode")).toHaveText(enabled?"🍛 カレーあり":"★ カレーなし");
  await expect(page.locator("#resultText")).toContainText("星 "+ending.scores[0]+"対"+ending.scores[1]);
  await expect(page.locator("#resultText")).toContainText(line.length+"手で決着");
  await expect(page.locator("#resultStats li")).toHaveCount(2);
  if(enabled){
   await expect(page.locator("#resultStats")).toContainText("カレー獲得");
   await expect(page.locator("#resultStats")).toContainText("壁2個移動");
  }else{
   await expect(page.locator("#resultText")).not.toContainText("カレー効果");
   await expect(page.locator("#resultText")).not.toContainText("パワー");
   await expect(page.locator("#resultStats")).not.toContainText("カレー");
   await expect(page.locator("#resultStats")).toContainText("壁を動かした手");
  }
  // Undo after a winning result must forget its event, not double-count it.
  await page.locator("#closeResult").click();
  await page.locator("#undo").click();
  await expect(page.locator("#result")).not.toBeVisible();
  await playAction(page,line.at(-1));
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#resultText")).toContainText(line.length+"手で決着");
  expect(errors).toEqual([]);
 });
}

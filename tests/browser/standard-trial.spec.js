import {test,expect} from "@playwright/test";
import {initial,movableWalls,moveWall,slideOptions} from "../../src/engine.js";
import {slideByBoard} from "./tap-target.js";

test("opt-in 9×9 standard trial plays with seven real stars and keeps beginner selectable",async({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    await page.locator("#localMode").click();
    await expect(page.locator("#layout")).toHaveValue("0");
    await expect(page.locator("#layout option[value='0']")).toHaveText("はじまりの氷原");
    await expect(page.locator("#layout option[value='9']")).toContainText("新スタンダード 9×9");
    await page.locator("#layout").selectOption("9");
    await page.locator("#start").click();
    await expect(page.locator("#board")).toHaveAttribute("aria-label","9×9のゲーム盤");
    await expect(page.locator("#board .cell")).toHaveCount(81);
    await expect(page.locator("#board .cell .star")).toHaveCount(7);
    await expect(page.locator("#board .cell.wall")).toHaveCount(10);
    await expect(page.locator("#scores")).toContainText("0 / 4");
    await expect(page.locator("#directions")).toBeHidden();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const state=initial(9,0);
    const move=movableWalls(state)[0];
    await page.locator(`[data-cell="${state.walls[move.wall]}"]`).click();
    await expect(page.locator(`[data-cell="${move.to}"]`)).toHaveClass(/target/);
    await page.locator(`[data-cell="${move.to}"]`).click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    const legal=slideOptions(moveWall(state,move));
    expect(legal.length).toBeGreaterThan(0);
    await slideByBoard(page,legal[0].dir);
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await page.screenshot({path:testInfo.outputPath(`standard-trial-9x9-${width}.png`),fullPage:true});
    await page.locator("#undo").click();
    await expect(page.locator("#turnCount")).toHaveText("1手目");
    await expect(page.locator("#scores")).toContainText("0 / 4");
    await page.locator("#settings").click();
    await expect(page.locator("#layout")).toHaveValue("9");
    await page.locator("#layout").selectOption("0");
    await page.locator("#start").click();
    await expect(page.locator("#board .cell")).toHaveCount(49);
    await expect(page.locator("#scores")).toContainText("0 / 3");
  }
});

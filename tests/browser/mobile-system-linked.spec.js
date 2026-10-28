import { test, expect } from "@playwright/test";
import { initial, movableWalls, moveWall, slideOptions, finishSlide } from "../../src/engine.js";

test("mobile screen remains bound to the real 7×7 engine and all legal interactions", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();

  const initialState = initial(0, 0);
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator(".cell.wall")).toHaveCount(initialState.walls.length);
  await expect(page.locator(".cell .star")).toHaveCount(initialState.stars.length);
  await expect(page.locator(".token")).toHaveCount(2);
  for (const pos of initialState.walls)
    await expect(page.locator(`[data-cell="${pos}"]`)).toHaveClass(/wall/);
  for (const pos of initialState.stars)
    await expect(page.locator(`[data-cell="${pos}"] .star`)).toHaveCount(1);

  const move = movableWalls(initialState)[0];
  await page.locator(`[data-cell="${initialState.walls[move.wall]}"]`).click();
  await expect(page.locator(`[data-cell="${move.to}"]`)).toHaveClass(/target/);
  await page.screenshot({path: testInfo.outputPath("ice-wall-selected.png"), fullPage: true});
  await page.locator(`[data-cell="${move.to}"]`).click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await page.screenshot({path: testInfo.outputPath("ice-slide-direction.png"), fullPage: true});

  const nextWallState = moveWall(initialState, move);
  const legal = slideOptions(nextWallState);
  expect(legal.length).toBeGreaterThan(0);
  for (let dir = 0; dir < 4; dir++) {
    const button = page.locator("#directions button").nth(dir);
    if (legal.some(m => m.dir === dir)) await expect(button).toBeEnabled();
    else await expect(button).toBeDisabled();
  }
  const chosen = legal[0];
  const after = finishSlide(nextWallState, chosen.dir);
  await page.locator("#directions button").nth(chosen.dir).click();
  await expect(page.locator("#turnCount")).toHaveText(`${after.ply + 1}手目`);
  await expect(page.locator(".cell .star")).toHaveCount(after.stars.length);
  await expect(page.locator("#scores")).toContainText(`${after.scores[0]} / 3`);
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
});

test("320/390 mobile view fits and approved art never hides an image-less game", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fits).toBe(true);
    const board = await page.locator("#board").boundingBox();
    expect(Math.abs(board.width - board.height)).toBeLessThan(1);
    const art = await page.request.get("/assets/ice-world-mobile.webp");
    if (art.status() === 200) {
      await expect(page.locator('link[href*="world-mobile.css"]')).toHaveCount(1);
      const logo = await page.request.get("/assets/zurash-approved-logo.webp");
      expect(logo.status()).toBe(200);
      // The actual accepted images must be active, not merely return HTTP 200.
      await expect.poll(() => page.locator(".mast").evaluate(el =>
        getComputedStyle(el).backgroundImage.includes("zurash-approved-logo.webp")
      )).toBe(true);
      await expect.poll(() => page.locator("body").evaluate(el =>
        getComputedStyle(el).backgroundImage.includes("ice-world-mobile.webp")
      )).toBe(true);
    } else {
      await expect(page.locator('link[href*="world-mobile.css"]')).toHaveCount(0);
      await expect(page.locator(".mast h1")).toBeAttached();
    }
  }

  await page.locator("#localMode").click();
  await page.locator("#layout").selectOption("8");
  await page.locator("#start").click();
  await expect(page.locator(".cell")).toHaveCount(121);
  expect(await page.locator(".board-scroll").evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("current CPU levels and learning-mode Undo restriction survive visual changes", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.locator("#settings").click();
  await expect(page.locator("#cpuLevel option")).toHaveCount(5);
  await page.locator("#cpuLevel").selectOption("learning");
  await page.locator("#start").click();
  await expect(page.locator("#learningPanel")).toBeVisible();
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator(".cell")).toHaveCount(49);
});

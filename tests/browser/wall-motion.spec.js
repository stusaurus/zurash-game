import { test, expect } from "@playwright/test";
import { initial, actions, movableWalls } from "../../src/engine.js";

// Record animation use without relying on a 260ms timing window.
async function recordWallAnimations(page, slow = false) {
  await page.addInitScript(({ slow }) => {
    window.__wallAnimations = [];
    const realAnimate = Element.prototype.animate;
    Element.prototype.animate = function (frames, options) {
      if (this.classList.contains("wall-flight")) {
        window.__wallAnimations.push({ frames, duration: options.duration });
        if (slow) options = { ...options, duration: 1200 };
      }
      return realAnimate.call(this, frames, options);
    };
  }, { slow });
}
async function startLocal(page) {
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
}
test("wall slides exactly one tile without changing the number of cells or rules", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await recordWallAnimations(page);
  await startLocal(page);
  const start = initial();
  const wall = movableWalls(start)[0];
  const source = start.walls[wall.wall], dest = wall.to;
  const sourceBox = await page.locator(`[data-cell="${source}"]`).boundingBox();
  const destBox = await page.locator(`[data-cell="${dest}"]`).boundingBox();
  await page.locator(`[data-cell="${source}"]`).click();
  await expect(page.locator(`[data-cell="${source}"].selected`)).toHaveCount(1);
  await page.locator(`[data-cell="${dest}"].target`).click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await expect(page.locator(`.cell.wall[data-cell="${dest}"]`)).toHaveCount(1);
  await expect(page.locator(`.cell.wall[data-cell="${source}"]`)).toHaveCount(0);
  await expect(page.locator(".cell.wall")).toHaveCount(8);
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator(".cell .star")).toHaveCount(5);
  await expect(page.locator(".wall-flight")).toHaveCount(0);
  const calls = await page.evaluate(() => window.__wallAnimations);
  expect(calls).toHaveLength(1);
  const frames = calls[0].frames;
  const dx = (dest % 7) - (source % 7), dy = Math.floor(dest / 7) - Math.floor(source / 7);
  expect(Math.abs(dx) + Math.abs(dy)).toBe(1);
  // Parse the CSS translate without platform-sensitive regex escaping.
  const transform = frames[1].transform;
  expect(transform.startsWith("translate(") && transform.endsWith(")")).toBe(true);
  const parts = transform.slice(10, -1).replaceAll("px", "").split(",").map(Number);
  expect(parts).toHaveLength(2);
  expect(parts.every(Number.isFinite)).toBe(true);
  // Cell spacing and fractional pixel rounding can differ by browser.
  expect(Math.abs(parts[0] - (destBox.x - sourceBox.x))).toBeLessThan(1);
  expect(Math.abs(parts[1] - (destBox.y - sourceBox.y))).toBeLessThan(1);
  // After a wall shift, the game is in slide phase: skip stays disabled,
  // while undo is available to reverse the uncompleted turn.
  await expect(page.locator("#skip")).toBeDisabled();
  await expect(page.locator("#undo")).toBeEnabled();
  await page.locator("#undo").click();
  await expect(page.locator(`.cell.wall[data-cell="${source}"]`)).toHaveCount(1);
  expect(errors).toEqual([]);
});

test("new game cancels an in-flight wall without a stale move committing", async ({ page }) => {
  await recordWallAnimations(page, true);
  await startLocal(page);
  const start = initial();
  const move = movableWalls(start)[0];
  await page.locator(`[data-cell="${start.walls[move.wall]}"]`).click();
  await page.locator(`[data-cell="${move.to}"]`).click();
  await expect(page.locator(".wall-flight")).toHaveCount(1);
  await expect(page.locator("#skip")).toBeDisabled();
  await expect(page.locator("#undo")).toBeDisabled();
  await page.locator("#settings").click();
  await page.locator("#start").click();
  await expect(page.locator(".wall-flight")).toHaveCount(0);
  await expect(page.locator("#phaseBadge")).toHaveText("1");
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  for (const at of start.walls) {
    await expect(page.locator(`.cell.wall[data-cell="${at}"]`)).toHaveCount(1);
  }
  await page.waitForTimeout(60); // allow cancelled animation continuation to flush
  expect(await page.locator(".cell.wall").count()).toBe(8);
  await expect(page.locator("#skip")).toBeEnabled();
});

test("reduced-motion preference moves the wall immediately without flight overlay", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await recordWallAnimations(page);
  await startLocal(page);
  const start = initial(), move = movableWalls(start)[0];
  await page.locator(`[data-cell="${start.walls[move.wall]}"]`).click();
  await page.locator(`[data-cell="${move.to}"]`).click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  expect(await page.evaluate(() => window.__wallAnimations)).toHaveLength(0);
  await expect(page.locator(".wall-flight")).toHaveCount(0);
  await expect(page.locator(`.cell.wall[data-cell="${move.to}"]`)).toHaveCount(1);
});

test("CPU wall shifts use the same one-cell visual transition", async ({ page }) => {
  const move = actions(initial(0, 1)).find(a => a.wall);
  expect(move).toBeDefined();
  await recordWallAnimations(page);
  await page.addInitScript((action) => {
    window.Worker = class {
      onmessage = null;
      onerror = null;
      postMessage({ id }) {
        setTimeout(() => this.onmessage?.({ data: { id, action } }), 10);
      }
      terminate() {}
    };
  }, move);
  await page.goto("/");
  await page.locator("#settings").click();
  await page.locator("#starter").selectOption("1");
  await page.locator("#start").click();
  await expect(page.locator("#turnCount")).toHaveText("2手目", { timeout: 10000 });
  const calls = await page.evaluate(() => window.__wallAnimations);
  expect(calls.length).toBeGreaterThanOrEqual(1);
  await expect(page.locator(".cell.wall")).toHaveCount(8);
  await expect(page.locator(".cell")).toHaveCount(49);
});

import { slideByBoard } from "./tap-target.js";
import { test, expect } from "@playwright/test";

async function enterLocalGame(page) {
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
}

test("Triken braces, glides, then lands at the valid destination", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await enterLocalGame(page);
  const first = page.locator(".token.p1");
  await expect(page.locator('#board .cell.stop[data-slide-dir="1"]')).toBeEnabled();
  await page.evaluate(() => {
    const token = document.querySelector(".token.p1");
    window.__trikenFrames = [{ pose: token.dataset.pose, transform: token.style.transform }];
    new MutationObserver(() => window.__trikenFrames.push({
      pose: token.dataset.pose, transform: token.style.transform
    })).observe(token, { attributes: true, attributeFilter: ["data-pose"] });
  });
  const before = await first.getAttribute("style");
  await slideByBoard(page,1);
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(first).toHaveAttribute("data-pose", /stop|collect|idle/);
  const { frames, duration } = await page.evaluate(() => ({
    frames: window.__trikenFrames,
    duration: parseFloat(document.querySelector(".token.p1").style.getPropertyValue("--triken-glide-ms"))
  }));
  const poses = frames.map(frame => frame.pose);
  const windup = poses.indexOf("windup"), slide = poses.indexOf("slide");
  expect(windup).toBeGreaterThan(-1);
  expect(slide).toBeGreaterThan(windup);
  expect(poses.slice(slide + 1).some(pose => pose === "stop" || pose === "collect")).toBe(true);
  expect(duration).toBeGreaterThanOrEqual(315);
  expect(duration).toBeLessThanOrEqual(490);
  expect(frames[windup].transform).toBe(frames[0].transform);
  expect(await first.getAttribute("style")).not.toBe(before);
  await expect(page.locator(".pawn-image")).toHaveCount(2);
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator(".cell.wall")).toHaveCount(8);
  expect(errors).toEqual([]);
  await page.locator("#undo").click();
  await expect(first).toHaveAttribute("data-pose", "idle");
  await expect(first).toHaveAttribute("data-facing", "right");
});

test("reduced motion skips anticipation and positional tween", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await enterLocalGame(page);
  const first = page.locator(".token.p1");
  await page.evaluate(() => {
    const token = document.querySelector(".token.p1");
    window.__poses = [];
    new MutationObserver(() => window.__poses.push(token.dataset.pose))
      .observe(token, { attributes: true, attributeFilter: ["data-pose"] });
  });
  await slideByBoard(page,1);
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(first).toHaveAttribute("data-pose", "idle");
  const observed = await page.evaluate(() => window.__poses);
  expect(observed).not.toContain("windup");
  expect(await first.evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("starting a new match during windup cancels the previous slide", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await enterLocalGame(page);
  const startPosition = await page.locator(".token.p1").evaluate(el => el.style.transform);
  await page.evaluate(() => {
    document.querySelector('#board .cell.stop[data-slide-dir="1"]')?.click();
    document.querySelector("#settings").click();
    document.querySelector("#start").click();
  });
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await expect(page.locator(".token.p1")).toHaveAttribute("data-pose", "idle");
  await page.waitForTimeout(650);
  expect(await page.locator(".token.p1").evaluate(el => el.style.transform)).toBe(startPosition);
  await expect(page.locator(".token.p1")).toHaveAttribute("data-pose", "idle");
  await expect(page.locator("#skip")).toBeEnabled();
});

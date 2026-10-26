import { test, expect } from "@playwright/test";

test("result portraits use the approved PNGs without overflow on narrow screens", async ({ page }) => {
  const errors = [];
  page.on("pageerror", e => errors.push(String(e)));
  await page.setViewportSize({ width: 320, height: 720 });
  await page.goto("/");
  await page.evaluate(() => document.querySelector("#result").showModal());
  const result = page.locator("#result");
  const images = result.locator(".result-character img");
  await expect(images).toHaveCount(2);
  await expect.poll(() => images.evaluateAll(nodes =>
    nodes.every(img => img.complete && img.naturalWidth === 80 && img.naturalHeight === 80)
  )).toBe(true);
  await expect(page.locator(".result-winner img")).toHaveAttribute("src", "assets/triken-orange-80.png");
  await expect(page.locator(".result-loser img")).toHaveAttribute("src", "assets/triken-aqua-80.png");
  const boxes = await page.locator(".result-character").evaluateAll(elements =>
    elements.map(el => el.getBoundingClientRect().width)
  );
  expect(boxes[0]).toBeGreaterThan(boxes[1]);
  const fit = await result.evaluate(el => {
    const root = el.getBoundingClientRect();
    return [...el.querySelectorAll(".result-character")].every(node => {
      const box = node.getBoundingClientRect();
      return box.left >= root.left && box.right <= root.right;
    });
  });
  expect(fit).toBe(true);
  expect(errors).toEqual([]);
});

test("explicit ON allows result reactions on iPhone even with reduced motion enabled", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const winner = page.locator("#resultWinnerImage");
  const loser = page.locator("#resultLoserImage");
  await page.evaluate(() => document.querySelector("#result").showModal());
  expect(await winner.evaluate(img => getComputedStyle(img).animationName)).toBe("none");
  expect(await loser.evaluate(img => getComputedStyle(img).animationName)).toBe("none");
  await page.evaluate(() => document.querySelector("#result").close());
  await page.locator("#motionToggle").click();
  await expect(page.locator("#motionToggle")).toHaveText("動き：ON");
  await page.evaluate(() => document.querySelector("#result").showModal());
  await expect.poll(() => winner.evaluate(img => getComputedStyle(img).animationName))
    .toBe("triken-result-win");
  await expect.poll(() => loser.evaluate(img => getComputedStyle(img).animationName))
    .toBe("triken-result-consolation");
  const duration = await winner.evaluate(img => getComputedStyle(img).animationDuration);
  expect(parseFloat(duration)).toBeGreaterThanOrEqual(1);
});

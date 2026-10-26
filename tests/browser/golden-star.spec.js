import { test, expect } from "@playwright/test";

test("golden stars render as beveled pieces without changing the five-star layout", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    await expect(page.locator(".cell .star")).toHaveCount(5);
    await expect(page.locator(".cell.wall")).toHaveCount(8);
    await expect(page.locator(".token .pawn-image")).toHaveCount(2);
    const pieces = await page.locator(".cell .star").evaluateAll(nodes => nodes.map(star => {
      const front = star.querySelector(".star-face");
      const base = star.querySelector(".star-depth");
      const bevel = star.querySelector(".star-facet");
      const cellWidth = star.closest(".cell").getBoundingClientRect().width;
      const box = star.getBoundingClientRect();
      return {
        frontClip: getComputedStyle(front).clipPath,
        frontBackground: getComputedStyle(front).backgroundImage,
        depthColor: getComputedStyle(base).backgroundImage,
        bevelClip: getComputedStyle(bevel).clipPath,
        width: box.width,
        cellWidth,
        x: box.x,
        y: box.y,
      };
    }));
    for (const piece of pieces) {
      expect(piece.width).toBeGreaterThan(piece.cellWidth * .6);
      expect(piece.width).toBeLessThan(piece.cellWidth * .85);
      expect(piece.frontClip).toContain("polygon(");
      expect(piece.bevelClip).toContain("polygon(");
      expect(piece.frontBackground).toContain("linear-gradient(");
      expect(piece.depthColor).toContain("linear-gradient(");
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`gold-stars-${width}.png`), fullPage: true });
  }
  const originalStars = await page.locator(".cell:has(.star)").evaluateAll(cells => cells.map(el => el.dataset.cell));
  await page.locator(".cell.wall.available").first().click();
  await expect(page.locator(".cell.selected")).toHaveCount(1);
  await page.locator(".cell.target").first().click();
  expect(await page.locator(".cell:has(.star)").evaluateAll(cells => cells.map(el => el.dataset.cell))).toEqual(originalStars);
  expect(errors).toEqual([]);
});

test("pickup effect respects reduced motion preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const reduced = await page.evaluate(() => {
    const span = document.createElement("span");
    span.className = "spark-star";
    document.querySelector("#celebration").append(span);
    return getComputedStyle(span).display;
  });
  expect(reduced).toBe("none");
});

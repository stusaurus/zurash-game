import { test, expect } from "@playwright/test";

test("icefield is square, readable and preserves existing objects on small screens", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  for (const width of [320, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    await expect(page.locator(".token .pawn-image")).toHaveCount(2);
    await expect(page.locator(".cell.wall")).toHaveCount(8);
    await expect(page.locator(".cell .star")).toHaveCount(5);
    const sizes = await page.locator(".cell").evaluateAll(cells =>
      cells.map(el => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }))
    );
    expect(sizes.every(({w,h}) => Math.abs(w - h) < 1)).toBe(true);
    expect(sizes[0].w).toBeGreaterThan(35);
    const first = await page.locator(".cell").first().evaluate(el => ({
      background: getComputedStyle(el).backgroundImage,
      color: getComputedStyle(el).backgroundColor,
    }));
    const second = await page.locator(".cell").nth(1).evaluate(el => ({
      background: getComputedStyle(el).backgroundImage,
      color: getComputedStyle(el).backgroundColor,
    }));
    expect(first.background).toContain("radial-gradient");
    expect(second.background).toContain("linear-gradient");
    expect(first.color).not.toBe(second.color);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`icefield-${width}.png`), fullPage: true });
  }
  await page.locator(".cell.wall.available").first().click();
  await expect(page.locator(".cell.selected")).toHaveCount(1);
  expect(await page.locator(".cell.selected").evaluate(el => getComputedStyle(el).backgroundImage)).toBe("none");
  await expect(page.locator(".cell.target")).not.toHaveCount(0);
  expect(await page.locator(".cell.target").first().evaluate(el => getComputedStyle(el).backgroundImage)).toBe("none");
  await page.locator("#skip").click();
  await expect(page.locator(".cell.stop")).not.toHaveCount(0);
  expect(await page.locator(".cell.stop").first().evaluate(el => getComputedStyle(el).backgroundImage)).toBe("none");
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";

test("raised ice walls remain readable and tappable across phone and tablet widths", async ({ page }, testInfo) => {
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  for (const width of [320, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    await expect(page.locator(".cell.wall")).toHaveCount(8);
    await expect(page.locator(".cell .star")).toHaveCount(5);
    const walls = await page.locator(".cell.wall").evaluateAll(nodes => nodes.map(node => {
      const cell = node.getBoundingClientRect();
      const block = getComputedStyle(node, "::before");
      return {
        cellWidth: cell.width,
        blockWidth: parseFloat(block.width),
        blockHeight: parseFloat(block.height),
        background: block.backgroundImage,
        shadow: block.boxShadow,
        radius: block.borderRadius,
      };
    }));
    expect(walls.every(w => w.blockWidth > w.cellWidth * .65)).toBe(true);
    expect(walls.every(w => w.blockHeight > w.cellWidth * .62)).toBe(true);
    expect(walls.every(w => w.background.includes("radial-gradient") && w.background.includes("linear-gradient"))).toBe(true);
    expect(walls.every(w => w.shadow.includes("inset") && w.shadow !== "none")).toBe(true);
    expect(walls.every(w => w.radius !== "0px")).toBe(true);
    await expect.poll(() => page.locator(".pawn-image").evaluateAll(nodes =>
      nodes.every(img => img.complete && img.naturalWidth === 80)
    )).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: testInfo.outputPath(`ice-wall-${width}.png`), fullPage: true });
  }

  const available = page.locator(".cell.wall.available").first();
  await expect(available).toBeEnabled();
  const ring = await available.evaluate(node => {
    const overlay = getComputedStyle(node, "::after");
    return { border: overlay.borderStyle, pointerEvents: overlay.pointerEvents };
  });
  expect(ring.border).not.toBe("none");
  expect(ring.pointerEvents).toBe("none");

  const original = await available.getAttribute("data-cell");
  await available.click();
  const selected = page.locator(`.cell.wall.selected[data-cell="${original}"]`);
  await expect(selected).toHaveCount(1);
  expect(await selected.evaluate(node => getComputedStyle(node, "::before").boxShadow)).not.toBe("none");
  const targets = page.locator(".cell.target");
  await expect(targets).not.toHaveCount(0);
  expect(await targets.first().evaluate(node => getComputedStyle(node).backgroundColor)).toBe("rgb(197, 231, 214)");
  const destination = await targets.first().getAttribute("data-cell");
  await targets.first().click();
  await expect(page.locator(`.cell.wall[data-cell="${destination}"]`)).toHaveCount(1);
  await expect(page.locator(".cell.wall")).toHaveCount(8);
  await expect(page.locator(".cell .star")).toHaveCount(5);
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  expect(errors).toEqual([]);
});

import { test, expect } from "@playwright/test";

test("approved four-color Triken atlas is served and turns follow left/right slides", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  const asset = await page.request.get("/assets/triken-four-colors.webp");
  expect(asset.ok()).toBe(true);
  expect((await asset.body()).length).toBeGreaterThan(2000);
  await expect(page.locator(".token")).toHaveCount(2);
  const images = await page.locator(".token .coin").evaluateAll(nodes =>
    nodes.map(node => getComputedStyle(node, "::before").backgroundImage));
  expect(images.every(value => value.includes("triken-four-colors.webp"))).toBe(true);

  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  await expect(page.locator("#directions button").nth(1)).toBeEnabled();
  await page.locator("#directions button").nth(1).click(); // player 1, right
  await expect(page.locator(".token.p1")).toHaveAttribute("data-facing", "right");
  await expect(page.locator(".token.p1")).toHaveAttribute("data-pose", "slide");
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await page.locator("#skip").click();
  await expect(page.locator("#directions button").nth(3)).toBeEnabled();
  await page.locator("#directions button").nth(3).click(); // player 2, left
  await expect(page.locator(".token.p2")).toHaveAttribute("data-facing", "left");
  await expect(page.locator("#turnCount")).toHaveText("3手目");

  await page.locator("#undo").click();
  await expect(page.locator(".token.p2")).toHaveAttribute("data-facing", "right");
  await expect(page.locator(".token.p2")).toHaveAttribute("data-pose", "idle");
  await page.locator("#settings").click();
  await page.locator("#start").click();
  await expect(page.locator(".token.p1")).toHaveAttribute("data-facing", "right");
  await expect(page.locator(".token.p2")).toHaveAttribute("data-facing", "right");
  expect(errors).toEqual([]);
});


test("Triken sprite boxes remain visible at iPhone and narrow screen widths", async ({ page }) => {
  for (const width of [320, 375, 390, 430, 768]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".token .coin")).toHaveCount(2);
    const sizes = await page.locator(".token").evaluateAll(nodes => nodes.map(token => {
      const body = token.querySelector(".coin");
      const pseudo = getComputedStyle(body, "::before");
      const outer = token.getBoundingClientRect(), rect = body.getBoundingClientRect();
      return {
        outer: outer.width,
        width: rect.width,
        height: rect.height,
        pseudoWidth: parseFloat(pseudo.width),
        pseudoHeight: parseFloat(pseudo.height),
        background: pseudo.backgroundImage,
      };
    }));
    for (const size of sizes) {
      expect(size.width).toBeGreaterThan(size.outer * .7);
      expect(size.height).toBeGreaterThan(size.outer * .7);
      expect(size.pseudoWidth).toBeGreaterThan(size.outer * .7);
      expect(size.pseudoHeight).toBeGreaterThan(size.outer * .7);
      expect(size.background).toContain("triken-four-colors.webp");
    }
  }
});

test("Triken is rendered with decoded image elements, not only numeric badges", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const pawns = page.locator(".token .pawn-image");
  await expect(pawns).toHaveCount(2);
  await expect.poll(() => pawns.evaluateAll(nodes =>
    nodes.every(img => img.complete && img.naturalWidth === 320 && img.naturalHeight === 80)
  )).toBe(true);
  const boxes = await page.locator(".token").evaluateAll(nodes => nodes.map(node => {
    const img = node.querySelector(".pawn-image");
    const frame = node.querySelector(".pawn-frame");
    return { frame: frame.getBoundingClientRect().width,
      image: img.getBoundingClientRect().width,
      outer: node.getBoundingClientRect().width,
      display: getComputedStyle(img).display };
  }));
  for (const box of boxes) {
    expect(box.display).not.toBe("none");
    expect(box.frame).toBeGreaterThan(box.outer * .7);
    expect(box.image).toBeGreaterThan(box.frame * 3.5);
  }
});

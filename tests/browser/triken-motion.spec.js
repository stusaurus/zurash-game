import { test, expect } from "@playwright/test";

test("approved four-color Triken atlas is served and turns follow left/right slides", async ({ page }) => {
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  await page.goto("/");
  const asset = await page.request.get("/assets/triken-four-colors.webp");
  expect(asset.ok()).toBe(true);
  expect((await asset.body()).length).toBeGreaterThan(2000);
  await expect(page.locator(".token")).toHaveCount(2);
  await expect.poll(() => page.locator(".pawn-image").evaluateAll(nodes =>
    nodes.every(img => img.complete && img.naturalWidth === 80 && img.naturalHeight === 80)
  )).toBe(true);
  const dataUrls = await page.locator(".pawn-image").evaluateAll(nodes => nodes.map(img => img.src));
  expect(dataUrls.every(src => src.startsWith("data:image/png;base64,"))).toBe(true);
  expect(dataUrls[0]).not.toEqual(dataUrls[1]);
  // Decoding a URL and allocating a box is insufficient: assert actual opaque
  // character pixels survive cropping in both color slots.
  const coverage = await page.locator(".pawn-image").evaluateAll(images =>
    images.map(img => {
      const canvas = document.createElement("canvas");
      canvas.width = canvas.height = 80;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      const pixels = ctx.getImageData(0, 0, 80, 80).data;
      let visible = 0;
      for (let k = 3; k < pixels.length; k += 4) {
        if (pixels[k] > 80) visible++;
      }
      return visible / (80 * 80);
    })
  );
  expect(coverage.every(ratio => ratio > 0.2)).toBe(true);

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
    await expect.poll(() => page.locator(".pawn-image").evaluateAll(nodes =>
      nodes.every(img => img.complete && img.naturalWidth === 80)
    )).toBe(true);
    const sizes = await page.locator(".token").evaluateAll(nodes => nodes.map(token => {
      const body = token.querySelector(".coin");
      const img = token.querySelector(".pawn-image");
      const outer = token.getBoundingClientRect(), rect = body.getBoundingClientRect();
      const imageBox = img.getBoundingClientRect();
      return {
        outer: outer.width,
        width: rect.width,
        height: rect.height,
        imageWidth: imageBox.width,
        imageHeight: imageBox.height,
        decoded: img.complete && img.naturalWidth === 80,
      };
    }));
    for (const size of sizes) {
      expect(size.width).toBeGreaterThan(size.outer * .7);
      expect(size.height).toBeGreaterThan(size.outer * .7);
      expect(size.imageWidth).toBeGreaterThan(size.outer * .7);
      expect(size.imageHeight).toBeGreaterThan(size.outer * .7);
      expect(size.decoded).toBe(true);
    }
  }
});

test("Triken is rendered with decoded image elements, not only numeric badges", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const pawns = page.locator(".token .pawn-image");
  await expect(pawns).toHaveCount(2);
  await expect.poll(() => pawns.evaluateAll(nodes =>
    nodes.every(img => img.complete && img.naturalWidth === 80 && img.naturalHeight === 80)
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
    expect(box.image).toBeGreaterThan(box.frame * .9);
    expect(box.image).toBeLessThan(box.frame * 1.1);
  }
});

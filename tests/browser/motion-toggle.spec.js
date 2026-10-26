import { test, expect } from "@playwright/test";

test("iPhone reduced-motion fallback explains apparent teleport; explicit ON restores travel", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  const toggle = page.locator("#motionToggle");
  await expect(toggle).toHaveText("動き：OFF");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-motion", "still");
  const initiallyStopped = await page.locator(".token.p1").evaluate(el => getComputedStyle(el).transitionDuration);
  expect(initiallyStopped).toBe("0s");

  await toggle.click();
  await expect(toggle).toHaveText("動き：ON");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-motion", "animate");
  const enabledDuration = await page.locator(".token.p1").evaluate(el => getComputedStyle(el).transitionDuration);
  expect(parseFloat(enabledDuration)).toBeGreaterThan(0.2);
  // Changing the setting does not restart a match.
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  await expect(page.locator("#directions button").nth(1)).toBeEnabled();
  const pawn = page.locator(".token.p1");
  const origin = await pawn.boundingBox();
  // Install a requestAnimationFrame recorder *before* starting travel.
  // Cross-process Playwright awaits may begin sampling only after arrival on WebKit.
  await page.evaluate(() => {
    const token = document.querySelector(".token.p1");
    window.__trikenFlight = { points: [token.getBoundingClientRect().x], done: false };
    const observer = new MutationObserver(() => {
      if (token.dataset.pose !== "slide") return;
      observer.disconnect();
      const started = performance.now();
      const sample = () => {
        window.__trikenFlight.points.push(token.getBoundingClientRect().x);
        if (performance.now() - started < 530) requestAnimationFrame(sample);
        else window.__trikenFlight.done = true;
      };
      requestAnimationFrame(sample);
    });
    observer.observe(token, { attributes: true, attributeFilter: ["data-pose"] });
  });
  await page.locator("#directions button").nth(1).click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect.poll(() => page.evaluate(() => window.__trikenFlight.done)).toBe(true);
  const arrival = await pawn.boundingBox();
  const samples = await page.evaluate(() => window.__trikenFlight.points);
  expect(arrival.x).toBeGreaterThan(origin.x + 30);
  expect(samples.length).toBeGreaterThan(3);
  const intermediate = samples.filter(x => x > origin.x + 5 && x < arrival.x - 5);
  expect(intermediate.length).toBeGreaterThan(0);
  await toggle.click();
  await expect(toggle).toHaveText("動き：OFF");
  expect(await pawn.evaluate(el => getComputedStyle(el).transitionDuration)).toBe("0s");
});

test("motion control is accessible and remembers a manual choice without overriding it with OS preference", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.locator("#motionToggle").click();
  await expect(page.locator("#motionToggle")).toHaveAttribute("aria-pressed", "true");
  await page.reload();
  await expect(page.locator("#motionToggle")).toHaveText("動き：ON");
  expect(await page.locator(".token.p1").evaluate(el => parseFloat(getComputedStyle(el).transitionDuration)))
    .toBeGreaterThan(.2);
  await page.locator("#motionToggle").click();
  await page.reload();
  await expect(page.locator("#motionToggle")).toHaveText("動き：OFF");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await expect(page.locator("#motionToggle")).toHaveText("動き：OFF");
});

test("default animation remains on when iPhone is not in reduced-motion mode", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.goto("/");
  await expect(page.locator("#motionToggle")).toHaveText("動き：ON");
  expect(await page.locator(".token.p1").evaluate(el => parseFloat(getComputedStyle(el).transitionDuration)))
    .toBeGreaterThan(.2);
});

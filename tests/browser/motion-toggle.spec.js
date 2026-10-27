import { test, expect } from "@playwright/test";

test("iPhone reduced-motion fallback explains apparent teleport; explicit ON restores travel", async ({ page }, testInfo) => {
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
    const evidence = window.__flightEvidence = { frames: [], events: [], mutations: [], click: null, stopped: false };
    const position = () => token.getBoundingClientRect().x;
    const recordFrame = timestamp => {
      if (evidence.stopped) return;
      evidence.frames.push({ time: performance.now(), timestamp, x: position(), pose: token.dataset.pose });
      requestAnimationFrame(recordFrame);
    };
    requestAnimationFrame(recordFrame);
    for (const type of ["transitionrun", "transitionstart", "transitionend", "transitioncancel"]) {
      token.addEventListener(type, event => {
        if (event.target === token && event.propertyName === "transform")
          evidence.events.push({ type, time: performance.now(), x: position(), elapsed: event.elapsedTime });
      });
    }
    document.querySelector("#directions button:nth-child(2)").addEventListener("click", () => {
      evidence.click = { time: performance.now(), x: position() };
    }, { once: true, capture: true });
    const poseObserver = new MutationObserver(() => evidence.mutations.push({time:performance.now(), pose:token.dataset.pose, x:position()}));
    poseObserver.observe(token, { attributes:true, attributeFilter:["data-pose", "style"] });
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
  const { samples, evidence } = await page.evaluate(() => {
    window.__flightEvidence.stopped = true;
    return {samples: window.__trikenFlight.points, evidence: window.__flightEvidence};
  });
  const record = { origin: origin.x, arrival: arrival.x, samples, ...evidence };
  await testInfo.attach("glide-timing.json", { body: JSON.stringify(record, null, 2), contentType: "application/json" });
  console.log("GLIDE_TIMING " + JSON.stringify(record));
  expect(arrival.x).toBeGreaterThan(origin.x + 30);
  // Three samples (start, one in-flight position, finish) are sufficient.
  // WebKit under CI load can render only three frames for this short tween.
  expect(samples.length).toBeGreaterThanOrEqual(3);
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

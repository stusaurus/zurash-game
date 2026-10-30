/* Test helper for the actual UI: phones use legal landing tiles and
 * desktop keeps the existing arrow keys. The production engine publishes
 * data-slide-dir from slideOptions(), never recomputed by the test. */
export async function slideByBoard(page, dir = null) {
  const phone = await page.evaluate(() => matchMedia("(max-width: 600px)").matches);
  if (phone) {
    const tile = dir === null
      ? page.locator("#board .cell.stop:not([disabled])").first()
      : page.locator(`#board .cell.stop[data-slide-dir="${dir}"]:not([disabled])`);
    await tile.click();
  } else {
    const key = dir === null
      ? page.locator("#directions button:not([disabled])").first()
      : page.locator("#directions button").nth(dir);
    await key.click();
  }
}

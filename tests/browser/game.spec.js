import { test, expect } from "@playwright/test";
import { initial, apply, movableWalls, key } from "../../src/engine.js";
import { choose, seeded } from "../../src/ai.js";
async function local(page) {
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
}
async function doAction(page, state, action) {
  if (action.wall) {
    await page
      .locator(`[data-cell="${state.walls[action.wall.wall]}"]`)
      .click();
    await page.locator(`[data-cell="${action.wall.to}"]`).click();
  } else await page.locator("#skip").click();
  await page.locator("#directions button").nth(action.dir).click();
  const n = apply(state, action);
  if (n.winner === null)
    await expect(page.locator("#turnCount")).toHaveText(`${n.ply + 1}手目`);
  await expect(page.locator("#undo")).toBeEnabled();
  return n;
}
test("responsive board, dialogs, and exact reference asset", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  for (const width of [320, 390, 768, 1200]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const box = await page.locator("#board").boundingBox();
    expect(Math.abs(box.width - box.height)).toBeLessThan(1);
    expect(box.width / 7).toBeGreaterThan(35);
    const cells = await page
      .locator(".cell")
      .evaluateAll((els) =>
        els.map((e) => ({
          w: e.getBoundingClientRect().width,
          h: e.getBoundingClientRect().height,
        })),
      );
    expect(cells.every((c) => Math.abs(c.w - c.h) < 1)).toBe(true);
    const undoBox = await page.locator("#undo").boundingBox();
    expect(undoBox.height).toBeLessThan(50);

    await page.screenshot({
      path: testInfo.outputPath(`width-${width}.png`),
      fullPage: true,
    });
  }
  await page.locator("#help").click();
  await expect(page.locator("#helpDialog")).toBeVisible();
  await page.locator("#helpDialog [data-close]").last().click();
  await page.locator("#settings").click();
  await page.locator("#setupDialog .close").click();
  const asset = await page.request.get("/assets/triken-reference.jpeg");
  expect(asset.status()).toBe(200);
  expect(errors).toEqual([]);
});
test("wall selection, shift, undo, skip, slide, local handoff, victory and rematch", async ({
  page,
}, testInfo) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await local(page);
  let state = initial();
  for (const delta of [-7, 1, 7, -1]) {
    const move = movableWalls(state).find(m => m.to - state.walls[m.wall] === delta);
    expect(move).toBeDefined();
    await page.locator(`[data-cell="${state.walls[move.wall]}"]`).click();
    await expect(page.locator(`[data-cell="${move.to}"]`)).toHaveText(({[-7]: "↑", [1]: "→", [7]: "↓", [-1]: "←"})[delta]);
  }
  const wall = movableWalls(state)[0];
  await page.locator(`[data-cell="${state.walls[wall.wall]}"]`).click();
  await expect(page.locator(".target")).not.toHaveCount(0);
  const delta = wall.to - state.walls[wall.wall];
  const arrow = ({ [-7]: "↑", [1]: "→", [7]: "↓", [-1]: "←" })[delta];
  await expect(page.locator(`[data-cell="${wall.to}"]`)).toHaveText(arrow);
  await page.locator(`[data-cell="${wall.to}"]`).click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await page.locator("#undo").click();
  await expect(page.locator("#phaseBadge")).toHaveText("1");
  const rng = seeded(99),
    seen = new Map();
  let finalState, finalAction;
  for (let turn = 0; turn < 100 && state.winner === null; turn++) {
    seen.set(key(state), (seen.get(key(state)) || 0) + 1);
    const action = choose(state, { level: "greedy", rng, seen });
    if (apply(state, action).winner !== null) {
      finalState = state;
      finalAction = action;
    }
    state = await doAction(page, state, action);
  }
  expect(state.winner).not.toBeNull();
  await expect(page.locator("#result")).toBeVisible();
  await expect(page.locator("#result")).toHaveAttribute("open", "");
  await expect(page.locator("#resultText")).toContainText("最終スコア");
  await expect(page.locator("#lastMove")).toContainText("★ゲット！");
  await expect(page.locator("#resultTitle")).toContainText(
    `プレイヤー${state.winner + 1}`,
  );
  await expect(page.locator("#turnCount")).toHaveText(`${state.ply}手目`);
  await expect(page.locator("#result")).toHaveCSS("opacity", "1");
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: testInfo.outputPath("victory.png"), fullPage: true });
  await page.locator("#reviewFinal").click();
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#board")).toBeVisible();
  await page.locator("#undo").click();
  expect(finalAction).toBeDefined();
  await doAction(page, finalState, finalAction);
  await expect(page.locator("#result")).toBeVisible();
  await page.locator("#rematch").click();
  await expect(page.locator("#result")).toBeHidden();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await page.locator("#skip").click();
  await page.locator("#directions button:not([disabled])").first().click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator("#phaseTitle")).toContainText("プレイヤー2");
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  expect(errors).toEqual([]);
});
test("CPU worker responds and undo returns to human turn; reset cancels pending CPU", async ({
  page,
}, testInfo) => {
  const press = testInfo.project.use.hasTouch ? "tap" : "click";
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#skip")[press]();
  await page.locator("#directions button:not([disabled])").first()[press]();
  await expect(page.locator("#turnCount")).toHaveText("3手目", {
    timeout: 30000,
  });
  await expect(page.locator("#skip")).toBeEnabled();
  await page.locator("#undo")[press]();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await page.locator("#skip")[press]();
  await page.locator("#directions button:not([disabled])").first()[press]();
  await page.locator("#settings")[press]();
  await page.locator("#start")[press]();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await expect(page.locator("#skip")).toBeEnabled();
  expect(errors).toEqual([]);
});

test("CPU continues on turn four (second worker response)", async ({ page }, testInfo) => {
  const press = testInfo.project.use.hasTouch ? "tap" : "click";
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  for (let humanTurn = 0; humanTurn < 2; humanTurn++) {
    await expect(page.locator("#skip")).toBeEnabled({ timeout: 30000 });
    await page.locator("#skip")[press]();
    await page.locator("#directions button:not([disabled])").first()[press]();
    await expect(page.locator("#turnCount")).toHaveText(
      `${2 * humanTurn + 3}手目`, { timeout: 30000 },
    );
    await expect(page.locator("#skip")).toBeEnabled();
  }
  await expect(page.locator("#phaseTitle")).toContainText("あなた");
  expect(errors).toEqual([]);
});
test("challenge mode is selectable, survives CPU turns, and can switch to normal", async ({ page }, testInfo) => {
  const press = testInfo.project.use.hasTouch ? "tap" : "click";
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await expect(page.locator("#scores")).toContainText("CPU（つよい）");
  await page.locator("#settings")[press]();
  await expect(page.locator("#cpuLevel")).toHaveValue("strong");
  await page.locator("#cpuLevel").selectOption("search");
  await page.locator("#start")[press]();
  await expect(page.locator("#scores")).toContainText("CPU（ふつう）");
  await page.locator("#skip")[press]();
  await page.locator("#directions button:not([disabled])").first()[press]();
  await expect(page.locator("#turnCount")).toHaveText("3手目", { timeout: 30000 });
  await page.locator("#settings")[press]();
  await page.locator("#cpuLevel").selectOption("strong");
  await page.locator("#start")[press]();
  await expect(page.locator("#scores")).toContainText("CPU（つよい）");
  for (let i = 0; i < 2; i++) {
    await page.locator("#skip")[press]();
    await page.locator("#directions button:not([disabled])").first()[press]();
    await expect(page.locator("#turnCount")).toHaveText(`${i * 2 + 3}手目`, { timeout: 30000 });
  }
  expect(errors).toEqual([]);
});
test('wall choices always leave a legal sliding continuation',async({page})=>{
 await local(page);
 let s=await doAction(page,initial(),{wall:{wall:1,to:13},dir:0});
 await page.locator('[data-cell="8"]').click();
 await expect(page.locator('[data-cell="7"]')).toBeDisabled();
 await expect(page.locator('[data-cell="7"]')).not.toHaveClass(/target/);
 await doAction(page,s,{wall:null,dir:3});
 await expect(page.locator('#turnCount')).toHaveText('3手目');
});


test("experimental 2-player stages are selectable and playable on mobile", async ({ page }, testInfo) => {
  const press = testInfo.project.use.hasTouch ? "tap" : "click";
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto("/");
  await page.locator("#settings")[press]();
  await expect(page.locator("#layout option")).toHaveCount(5);
  await expect(page.locator("#layout optgroup")).toHaveCount(2);
  await page.locator("#layout").selectOption("3");
  await page.locator("#start")[press]();
  await expect(page.locator("#currentStage")).toContainText("ほしの分かれ道");
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator(".star")).toHaveCount(5);
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await page.locator("#skip")[press]();
  await page.locator("#directions button:not([disabled])").first()[press]();
  await expect(page.locator("#turnCount")).toHaveText("3手目", { timeout: 30000 });
  await page.locator("#settings")[press]();
  await expect(page.locator("#layout")).toHaveValue("3");
  await page.locator("#layout").selectOption("4");
  await page.locator("#start")[press]();
  await expect(page.locator("#currentStage")).toContainText("こおりの交差路");
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator(".star")).toHaveCount(5);
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await page.locator("#skip")[press]();
  await page.locator("#directions button:not([disabled])").first()[press]();
  await expect(page.locator("#turnCount")).toHaveText("3手目", { timeout: 30000 });
  expect(errors).toEqual([]);
});

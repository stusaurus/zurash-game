import { slideByBoard } from "./tap-target.js";
import { test, expect } from "@playwright/test";
import { initial, movableWalls, moveWall, slideOptions, finishSlide, actions, apply } from "../../src/engine.js";

test("mobile screen remains bound to the real 7×7 engine and all legal interactions", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();

  const initialState = initial(0, 0);
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator(".cell.wall")).toHaveCount(initialState.walls.length);
  await expect(page.locator(".cell .star")).toHaveCount(initialState.stars.length);
  await expect(page.locator(".token")).toHaveCount(2);
  for (const pos of initialState.walls)
    await expect(page.locator(`[data-cell="${pos}"]`)).toHaveClass(/wall/);
  for (const pos of initialState.stars)
    await expect(page.locator(`[data-cell="${pos}"] .star`)).toHaveCount(1);

  const move = movableWalls(initialState)[0];
  await page.locator(`[data-cell="${initialState.walls[move.wall]}"]`).click();
  await expect(page.locator(`[data-cell="${move.to}"]`)).toHaveClass(/target/);
  await page.screenshot({path: testInfo.outputPath("ice-wall-selected.png"), fullPage: true});
  await page.locator(`[data-cell="${move.to}"]`).click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await page.screenshot({path: testInfo.outputPath("ice-slide-direction.png"), fullPage: true});

  const nextWallState = moveWall(initialState, move);
  const legal = slideOptions(nextWallState);
  expect(legal.length).toBeGreaterThan(0);
  for (let dir = 0; dir < 4; dir++) {
    const button = page.locator("#directions button").nth(dir);
    if (legal.some(m => m.dir === dir)) await expect(button).toBeEnabled();
    else await expect(button).toBeDisabled();
  }
  const chosen = legal[0];
  const after = finishSlide(nextWallState, chosen.dir);
  await slideByBoard(page,chosen.dir);
  await expect(page.locator("#turnCount")).toHaveText(`${after.ply + 1}手目`);
  await expect(page.locator(".cell .star")).toHaveCount(after.stars.length);
  await expect(page.locator("#scores")).toContainText(`${after.scores[0]} / 3`);
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
});

test("320/390 mobile view fits and approved art never hides an image-less game", async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    expect(fits).toBe(true);
    const board = await page.locator("#board").boundingBox();
    expect(Math.abs(board.width - board.height)).toBeLessThan(1);
    const art = await page.request.get("/assets/ice-world-mobile.webp");
    if (art.status() === 200) {
      await expect(page.locator('link[href*="world-mobile.css"]')).toHaveCount(1);
      const logo = await page.request.get("/assets/zurash-approved-logo.webp");
      expect(logo.status()).toBe(200);
      // The actual accepted images must be active, not merely return HTTP 200.
      await expect.poll(() => page.locator(".mast").evaluate(el =>
        getComputedStyle(el).backgroundImage.includes("zurash-approved-logo.webp")
      )).toBe(true);
      await expect.poll(() => page.locator("body").evaluate(el =>
        getComputedStyle(el).backgroundImage.includes("ice-world-mobile.webp")
      )).toBe(true);
    } else {
      await expect(page.locator('link[href*="world-mobile.css"]')).toHaveCount(0);
      await expect(page.locator(".mast h1")).toBeAttached();
    }
    if (art.status() === 200)
      await page.screenshot({path: testInfo.outputPath(`ice-mobile-${width}.png`), fullPage: true});
  }

  await page.locator("#localMode").click();
  await page.locator("#layout").selectOption("8");
  await page.locator("#start").click();
  await expect(page.locator(".cell")).toHaveCount(121);
  expect(await page.locator(".board-scroll").evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("current CPU levels and learning-mode Undo restriction survive visual changes", async ({page}) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:390,height:844});
  await page.goto("/");
  await page.locator("#settings").click();
  await expect(page.locator("#cpuLevel option")).toHaveCount(5);
  await page.locator("#cpuLevel").selectOption("learning");
  await page.locator("#start").click();
  await expect(page.locator("#learningPanel")).toBeVisible();
  await expect(page.locator("#undo")).toBeDisabled();
  await expect(page.locator(".cell")).toHaveCount(49);
});


test("seamless HUD uses real phase controls and keeps every tap target clear", async ({page}, testInfo) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator('link[href*="world-mobile.css"]')).toHaveCount(1);
    await expect(page.locator(".score")).toHaveCount(2);
    await expect(page.locator(".score.current")).toHaveCount(1);
    await expect(page.locator("#phaseBadge")).toHaveText("1");
    await expect(page.locator("#directions button")).toHaveCount(4);
    await expect(page.locator("#skip")).toBeEnabled();
    // Decorative HUD must not cause horizontal overflow; buttons stay touchable.
    const layout = await page.evaluate(() => ({
      documentWidth:document.documentElement.scrollWidth,
      viewportWidth:innerWidth,
      scoreWidth:document.querySelector("#scores").getBoundingClientRect().width,
      gameWidth:document.querySelector(".game").getBoundingClientRect().width,
      controls:[...document.querySelectorAll("#undo, #skip, #settings")]
        .map(e=>({id:e.id||"direction",w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height})),
    }));
    expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.scoreWidth).toBeLessThan(layout.gameWidth);
    expect(layout.controls.every(c=>c.w>=40 && c.h>=44)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("seamless-hud-"+width+".png"),fullPage:true});

    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await expect(page.locator("#skip")).toBeDisabled();
    expect(await page.locator("#board .cell.stop:not([disabled])").count()).toBeGreaterThan(0);
    await page.screenshot({path:testInfo.outputPath("seamless-glide-"+width+".png"),fullPage:true});
    await slideByBoard(page);
    await expect(page.locator("#phaseBadge")).toHaveText("1");
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("mobile gameplay hides redundant arrows and uses real glowing landing tiles", async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator('link[href*="mobile-tap.css"]')).toHaveCount(1);
    await expect(page.locator("#directions")).toBeHidden();
    await expect(page.locator("#board .cell")).toHaveCount(49);
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await expect(page.locator(".control-deck .actions #undo")).toBeVisible();
    await expect(page.locator(".control-deck .actions #skip")).toBeVisible();
    const before = await page.locator("#board").boundingBox();
    const layout = await page.evaluate(()=>{
      const btns = [...document.querySelectorAll("#undo,#skip")].map(x=>x.getBoundingClientRect());
      const ctl = document.querySelector(".control-deck").getBoundingClientRect();
      return {w:document.documentElement.scrollWidth,viewport:innerWidth,
        controls:btns.map(r=>({w:r.width,h:r.height})),height:ctl.height,
        arrowsVisible:getComputedStyle(document.querySelector("#directions")).display};
    });
    expect(layout.w).toBeLessThanOrEqual(layout.viewport);
    expect(layout.arrowsVisible).toBe("none");
    expect(layout.controls.every(b=>b.w>=44&&b.h>=44)).toBe(true);
    expect(layout.height).toBeLessThan(125);
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    const stop=page.locator("#board .cell.stop:not([disabled])");
    expect(await stop.count()).toBeGreaterThan(0);
    await expect(stop.first()).toHaveAttribute("data-slide-dir",/^[0-3]$/);
    await expect(stop.first()).toHaveAttribute("aria-label",/滑走停止位置/);
    await expect(page.locator("#skip")).toBeHidden();
    await page.screenshot({path:testInfo.outputPath("tap-first-"+width+".png"),fullPage:true});
    await stop.first().click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await expect(page.locator("#phaseBadge")).toHaveText("1");
    expect((await page.locator("#board").boundingBox()).width).toBe(before.width);
    await page.locator("#undo").click();
    await expect(page.locator("#turnCount")).toHaveText("1手目");
  }
});


test("legal board tap displays ice glide and landing without creating extra pieces",async ({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await expect(page.locator("#directions")).toBeHidden();
  await page.locator("#skip").click();
  const target=page.locator("#board .cell.stop:not([disabled])").first();
  const before=await page.locator("#board .cell").count();
  await expect(target).toHaveCSS("cursor","pointer");
  await target.click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator(".ice-glide-vfx .ice-landing")).toHaveCount(1);
  await expect(page.locator(".ice-glide-vfx .ice-shard")).toHaveCount(4);
  expect(await page.locator(".ice-glide-vfx .ice-shard").evaluateAll(nodes =>
    nodes.every(node => getComputedStyle(node).pointerEvents === "none")
  )).toBe(true);
  await expect(page.locator("#board .cell")).toHaveCount(before);
  await expect(page.locator(".ice-glide-vfx")).toHaveAttribute("aria-hidden","true");
  await page.screenshot({path:testInfo.outputPath("tap-ice-landing.png"),fullPage:true});
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await expect(page.locator(".ice-glide-vfx .ice-landing")).toHaveCount(0);
  await expect(page.locator(".ice-glide-vfx .ice-shard")).toHaveCount(0);
});


test("reduced motion keeps landing cells tappable without decorative ice animation",async ({page})=>{
  await page.setViewportSize({width:320,height:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  const target=page.locator("#board .cell.stop:not([disabled])").first();
  await expect(target).toHaveCSS("animation-name","none");
  await target.click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator(".ice-glide-vfx .ice-streak")).toHaveCount(0);
  await expect(page.locator(".ice-glide-vfx .ice-landing")).toHaveCount(0);
  await expect(page.locator(".ice-glide-vfx .ice-shard")).toHaveCount(0);
});


test("real wall move hands focus to legal landing tiles and back after sliding", async ({page},testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-command-feedback","ready");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  const deck = page.locator(".control-deck");
  await expect(deck).toHaveAttribute("data-command-phase","wall");
  await expect(deck).toHaveAttribute("data-command-ready","false");
  await page.evaluate(() => {
    window.__commandPhases=[];
    const el=document.querySelector(".control-deck");
    new MutationObserver(() => window.__commandPhases.push({
      phase:el.dataset.commandPhase,
      ready:el.dataset.commandReady,
      handoff:el.dataset.commandHandoff || "",
    })).observe(el,{attributes:true,attributeFilter:[
      "data-command-phase","data-command-ready","data-command-handoff"
    ]});
  });
  const original=initial(0,0);
  const legalWallMove=movableWalls(original)[0];
  expect(legalWallMove).toBeTruthy();
  await page.locator('[data-cell="'+original.walls[legalWallMove.wall]+'"]').click();
  await page.locator('[data-cell="'+legalWallMove.to+'"]').click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await expect(deck).toHaveAttribute("data-command-phase","slide");
  await expect(deck).toHaveAttribute("data-command-ready","true");
  await expect.poll(() => page.evaluate(() =>
    window.__commandPhases.some(x=>x.handoff==="slide")
  )).toBe(true);
  await page.screenshot({path:testInfo.outputPath("handoff-real-wall-to-slide.png"),fullPage:true,animations:"allow"});
  await slideByBoard(page);
  await expect(page.locator("#phaseBadge")).toHaveText("1");
  await expect(deck).toHaveAttribute("data-command-phase","wall");
  await expect(deck).toHaveAttribute("data-command-ready","false");
  await expect.poll(() => page.evaluate(() =>
    window.__commandPhases.some(x=>x.handoff==="wall")
  )).toBe(true);
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await expect(deck).toHaveAttribute("data-command-phase","wall");
  await expect(deck).not.toHaveAttribute("data-command-handoff",/./);
});

test("in-game motion OFF prevents phase sweep while preserving skip-and-glide",async ({page}) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-command-feedback","ready");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#motionToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-zurash-motion","still");
  await page.locator("#skip").click();
  const deck=page.locator(".control-deck");
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await expect(deck).toHaveAttribute("data-command-phase","slide");
  await expect(deck).toHaveAttribute("data-command-ready","true");
  await expect(deck).not.toHaveAttribute("data-command-handoff",/./);
  const animation=await deck.evaluate(el => getComputedStyle(el,"::after").animationName);
  expect(animation).toBe("none");
  await slideByBoard(page);
  await expect(page.locator("#phaseBadge")).toHaveText("1");
  await expect(page.locator("#turnCount")).toHaveText("2手目");
});



test("live Triken scoreboard HUD fits smartphones and tracks real score/phase",async ({page},testInfo) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator('link[href*="mobile-hud.css"]')).toHaveCount(1);
    await expect(page.locator("#scores .score")).toHaveCount(2);
    await expect(page.locator("#scores .score.p1")).toContainText("0 / 3");
    await expect(page.locator("#scores .score.p2")).toContainText("0 / 3");
    await expect(page.locator("#phaseBadge")).toHaveText("1");

    const hud=await page.evaluate(() => {
      const rc=s=>document.querySelector(s).getBoundingClientRect();
      const orange=document.querySelector("#scores .score.p1");
      const aqua=document.querySelector("#scores .score.p2");
      return {
        viewport:innerWidth,
        documentWidth:document.documentElement.scrollWidth,
        actualBoardCells:document.querySelectorAll("#board .cell").length,
        icon1:getComputedStyle(orange,"::before").backgroundImage,
        icon2:getComputedStyle(aqua,"::before").backgroundImage,
        score:rc("#scores").toJSON(),
        instruction:rc(".instruction").toJSON(),
        board:rc("#board").toJSON(),
        clipped:[...document.querySelectorAll("#scores strong,#scores .stars")].some(el=>
          el.scrollWidth>el.clientWidth+2
        ),
      };
    });
    expect(hud.documentWidth).toBeLessThanOrEqual(hud.viewport);
    expect(hud.actualBoardCells).toBe(49);
    expect(hud.icon1).toContain("triken-orange-80.png");
    expect(hud.icon2).toContain("triken-aqua-80.png");
    expect(hud.score.width).toBeLessThanOrEqual(hud.viewport);
    expect(hud.instruction.width).toBeLessThanOrEqual(hud.viewport);
    expect(hud.instruction.bottom).toBeLessThanOrEqual(hud.board.top+12);
    expect(hud.clipped).toBe(false);
    await page.screenshot({path:testInfo.outputPath("hud-score-"+width+"-wall.png"),fullPage:true});

    // Change only through real app controls: never write state directly.
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await expect(page.locator(".control-deck")).toHaveAttribute("data-command-phase","slide");
    await page.screenshot({path:testInfo.outputPath("hud-score-"+width+"-slide.png"),fullPage:true});
    await slideByBoard(page);
    await expect(page.locator("#phaseBadge")).toHaveText("1");
  }
});

test("desktop stays on PR48 world theme without mobile-only HUD injection",async ({page}) => {
  await page.setViewportSize({width:960,height:720});
  await page.goto("/");
  await expect(page.locator("#scores .score")).toHaveCount(2);
  await expect(page.locator('link[href*="mobile-hud.css"]')).toHaveCount(0);
  await expect(page.locator(".cell")).toHaveCount(49);
  await expect(page.locator("#directions button")).toHaveCount(4);
});



test("320px score numbers remain large and board stays prominent",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator("#scores .score-count")).toHaveCount(2);
    await expect(page.locator("#scores .score-count").first()).toHaveText("0 / 3");
    await expect(page.locator("#scores .score-count").last()).toHaveText("0 / 3");
    await expect(page.locator("#scores .score-color").first()).toContainText("オレンジ");
    await expect(page.locator("#scores .score-color").last()).toContainText("みずいろ");
    const metrics=await page.evaluate(()=>{
      const rect=el=>el.getBoundingClientRect();
      const cards=[...document.querySelectorAll("#scores .score")];
      const counts=[...document.querySelectorAll("#scores .score-count")];
      const message=document.querySelector("#message");
      const board=document.querySelector("#board");
      return {
        bodyWidth:document.documentElement.scrollWidth,
        viewport:innerWidth,
        boardTop:rect(board).top,
        boardWidth:rect(board).width,
        fontSizes:counts.map(el=>parseFloat(getComputedStyle(el).fontSize)),
        countInside:counts.every((el,i)=>{
          const c=rect(el),p=rect(cards[i]);
          return c.left>=p.left && c.right<=p.right+1;
        }),
        messageFont:parseFloat(getComputedStyle(message).fontSize),
        titleUnclipped:[...document.querySelectorAll("#scores .score strong")].every(el=>el.scrollWidth<=el.clientWidth+1)
      };
    });
    expect(metrics.bodyWidth).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.countInside).toBe(true);
    expect(metrics.fontSizes.every(n=>n>=13)).toBe(true);
    expect(metrics.messageFont).toBeGreaterThanOrEqual(10);
    expect(metrics.titleUnclipped).toBe(true);
    if(width===320){
      expect(metrics.boardTop).toBeLessThan(360);
      expect(metrics.boardWidth).toBeGreaterThan(275);
    }
    await page.screenshot({path:testInfo.outputPath("readable-hud-"+width+".png"),fullPage:true});
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await page.locator("#skip").click();
    await slideByBoard(page);
    await expect(page.locator("#scores .score-count")).toHaveCount(2);
    await expect(page.locator("#phaseBadge")).toHaveText("1");
  }
});


test("gameplay focus compacts only mobile chrome after a real game start",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator('link[href*="mobile-focus.css"]')).toHaveCount(1);
    await expect(page.locator("html")).not.toHaveAttribute("data-zurash-match-view","play");
    await expect(page.locator("#board .cell")).toHaveCount(49);
    const before=await page.evaluate(()=>{
      const box=x=>document.querySelector(x).getBoundingClientRect();
      return {mast:box(".mast").height,boardTop:box("#board").top,boardW:box("#board").width};
    });
    await page.screenshot({path:testInfo.outputPath("scenic-before-start-"+width+".png"),fullPage:true});
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await expect(page.locator("html")).toHaveAttribute("data-zurash-match-view","play");
    await expect(page.locator("#board .cell")).toHaveCount(49);
    await expect(page.locator("#scores .score")).toHaveCount(2);
    const after=await page.evaluate(()=>{
      const box=x=>document.querySelector(x).getBoundingClientRect();
      return {
        mast:box(".mast").height,boardTop:box("#board").top,boardW:box("#board").width,
        overflow:document.documentElement.scrollWidth>innerWidth,
        allControls:[...document.querySelectorAll("#skip,#undo,#settings,#help")]
           .map(el=>({w:boxSelector(el).width,h:boxSelector(el).height})),
      };
      function boxSelector(el){return el.getBoundingClientRect();}
    });
    expect(after.mast).toBe(0);
    await expect(page.locator(".mast")).toBeHidden();
    await expect(page.locator("header .brand")).toBeVisible();
    expect(after.boardTop).toBeLessThan(before.boardTop - 70);
    expect(after.boardW).toBe(before.boardW);
    // On everyday phone widths the full physical crosspad should be reachable
    // without scrolling below the visible 844px gameplay viewport.
    if (width <= 390) {
      const deckBottom=await page.locator(".control-deck").evaluate(el=>
        el.getBoundingClientRect().bottom
      );
      expect(deckBottom).toBeLessThanOrEqual(844);
    }
    expect(after.overflow).toBe(false);
    expect(after.allControls.every(c=>c.w>=40 && c.h>=40)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("focused-match-"+width+".png"),fullPage:true});
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await slideByBoard(page);
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await page.locator("#help").click();
    await expect(page.locator("#helpDialog")).toBeVisible();
    await page.locator('#helpDialog [data-close="helpDialog"]').first().click();
    await page.locator("#settings").click();
    await expect(page.locator("#setupDialog")).toBeVisible();
    await page.locator('#setupDialog [data-close="setupDialog"]').first().click();
    await expect(page.locator("html")).toHaveAttribute("data-zurash-match-view","play");
  }
});


test("live match menu and score become one connected frosted visor", async ({page},testInfo) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator("#board .cell")).toHaveCount(49);
    await expect(page.locator("html")).not.toHaveAttribute("data-zurash-match-view","play");
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await expect(page.locator("html")).toHaveAttribute("data-zurash-match-view","play");
    const metrics=await page.evaluate(()=>{
      const rect=selector=>document.querySelector(selector).getBoundingClientRect();
      const top=rect(".game-top"),score=rect("#scores"),board=rect("#board"),pad=rect(".control-deck");
      const buttons=[...document.querySelectorAll(".game-top button")].map(el=>{
        const r=el.getBoundingClientRect(); return {w:r.width,h:r.height,visible:r.width>0};
      });
      const mode=getComputedStyle(document.querySelector(".game-top .mode-switch"));
      const style=getComputedStyle(document.querySelector("#scores"));
      return {
        width:innerWidth,
        pageWidth:document.documentElement.scrollWidth,
        gap:score.top-top.bottom,
        leftDiff:Math.abs(score.left-top.left),
        rightDiff:Math.abs(score.right-top.right),
        menuBackground:mode.backgroundImage,
        scoreCorner:style.borderTopLeftRadius,
        boardWidth:board.width,
        boardCells:document.querySelectorAll("#board .cell").length,
        padBottom:pad.bottom,
        buttons
      };
    });
    expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.width);
    expect(Math.abs(metrics.gap)).toBeLessThanOrEqual(1);
    expect(metrics.leftDiff).toBeLessThanOrEqual(1);
    expect(metrics.rightDiff).toBeLessThanOrEqual(1);
    expect(metrics.menuBackground).toBe("none");
    expect(metrics.scoreCorner).toBe("0px");
    expect(metrics.boardCells).toBe(49);
    expect(metrics.buttons.every(b=>b.visible && b.w>=40 && b.h>=42)).toBe(true);
    if(width<=390) expect(metrics.padBottom).toBeLessThanOrEqual(844);
    await expect(page.locator("#scores .score-count")).toHaveCount(2);
    await page.screenshot({path:testInfo.outputPath("seamless-visor-"+width+".png"),fullPage:true});
    await page.locator("#settings").click();
    await expect(page.locator("#setupDialog")).toBeVisible();
    await page.locator('#setupDialog [data-close="setupDialog"]').first().click();
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await slideByBoard(page);
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("mobile play help and auxiliary chrome stay reachable beside compact dock",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    // The original complete help label is kept on the opening screen.
    await expect(page.locator("html")).not.toHaveAttribute("data-zurash-match-view","play");
    await expect(page.locator("#help")).toHaveAccessibleName("遊び方を開く");
    const openingHelpSize=await page.locator("#help").evaluate(el=>parseFloat(getComputedStyle(el).fontSize));
    expect(openingHelpSize).toBeGreaterThan(0);
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await expect(page.locator("html")).toHaveAttribute("data-zurash-match-view","play");
    const chrome=await page.evaluate(()=>{
      const help=document.querySelector("#help");
      const motion=document.querySelector("#motionToggle");
      const footer=document.querySelector("footer");
      const hint=document.querySelector(".game > p.hint:not(#boardScrollHint)");
      const board=document.querySelector("#board");
      const deck=document.querySelector(".control-deck");
      const box=el=>{const r=el.getBoundingClientRect();return {x:r.x,y:r.y,w:r.width,h:r.height,b:r.bottom};};
      return {
        help:box(help),motion:box(motion),deck:box(deck),board:box(board),
        icon:getComputedStyle(help,"::before").content,
        helpFont:parseFloat(getComputedStyle(help).fontSize),
        footerDisplay:getComputedStyle(footer).display,
        hintFont:parseFloat(getComputedStyle(hint).fontSize),
        hintVisible:box(hint).h>0,
        overflow:document.documentElement.scrollWidth>innerWidth
      };
    });
    expect(chrome.overflow).toBe(false);
    expect(chrome.icon).toBe('"?"');
    expect(chrome.helpFont).toBe(0);
    expect(chrome.help.w).toBeGreaterThanOrEqual(44);
    expect(chrome.help.h).toBeGreaterThanOrEqual(44);
    expect(chrome.motion.w).toBeGreaterThanOrEqual(44);
    expect(chrome.motion.h).toBeGreaterThanOrEqual(44);
    expect(chrome.footerDisplay).toBe("none");
    expect(chrome.hintVisible).toBe(true);
    expect(chrome.hintFont).toBeGreaterThanOrEqual(10);
    expect(chrome.board.w).toBeGreaterThan(275);
    if(width<=390)expect(chrome.deck.b).toBeLessThanOrEqual(844);
    await page.screenshot({path:testInfo.outputPath("polished-aux-"+width+".png"),fullPage:true});
    await page.locator("#help").click();
    await expect(page.locator("#helpDialog")).toBeVisible();
    await page.locator('#helpDialog [data-close="helpDialog"]').first().click();
    const before=await page.locator("#motionToggle").getAttribute("aria-pressed");
    await page.locator("#motionToggle").click();
    await expect(page.locator("#motionToggle")).not.toHaveAttribute("aria-pressed",before);
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await slideByBoard(page);
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("star stop tip reads clearly below the compact touch dock without another card",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    const tip=page.locator(".game > p.star-tip");
    await expect(tip).toContainText("星は止まったらゲット！");
    await expect(tip).toContainText("通りすぎても取れないよ。");
    await expect(tip.locator(".star-tip-icon")).toHaveText("★");
    await expect(tip.locator(".star-tip-icon")).toHaveAttribute("aria-hidden","true");
    const m=await page.evaluate(()=>{
      const tip=document.querySelector(".game > p.star-tip");
      const label=tip.querySelector("span:last-child");
      const icon=tip.querySelector(".star-tip-icon");
      const deck=document.querySelector(".control-deck");
      const board=document.querySelector("#board");
      const r=el=>el.getBoundingClientRect();
      const style=getComputedStyle(tip);
      const textStyle=getComputedStyle(label);
      const iconStyle=getComputedStyle(icon);
      const deckRect=r(deck),tipRect=r(tip),boardRect=r(board);
      return {
        width:innerWidth,scrollWidth:document.documentElement.scrollWidth,
        display:style.display,fontSize:parseFloat(style.fontSize),
        textColor:textStyle.color,background:style.backgroundImage,
        iconColor:iconStyle.color,tipWidth:tipRect.width,
        tipHeight:tipRect.height,tipTop:tipRect.top,
        boardWidth:boardRect.width,deckBottom:deckRect.bottom,
        labelScroll:label.scrollWidth,labelClient:label.clientWidth,
        iconWidth:r(icon).width,motionHeight:r(document.querySelector("#motionToggle")).height
      };
    });
    expect(m.scrollWidth).toBeLessThanOrEqual(m.width);
    expect(m.display).toBe("flex");
    expect(m.fontSize).toBeGreaterThanOrEqual(10.5);
    expect(m.background).toContain("linear-gradient");
    expect(m.iconColor).not.toBe(m.textColor);
    expect(m.iconWidth).toBeGreaterThanOrEqual(23);
    expect(m.tipHeight).toBeGreaterThanOrEqual(30);
    expect(m.labelScroll).toBeLessThanOrEqual(m.labelClient+1);
    expect(m.tipTop).toBeGreaterThanOrEqual(m.deckBottom);
    expect(m.boardWidth).toBeGreaterThan(275);
    expect(m.motionHeight).toBeGreaterThanOrEqual(44);
    if(width<=390)expect(m.deckBottom).toBeLessThanOrEqual(844);
    await page.screenshot({path:testInfo.outputPath("ice-star-rule-"+width+".png"),fullPage:true});
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await slideByBoard(page);
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("tap-first dock is compact while board frame and tile geometry are unchanged",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    const before=await page.locator("#board").boundingBox();
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    const after=await page.locator("#board").boundingBox();
    expect(after.width).toBe(before.width);
    expect(after.height).toBe(before.height);
    await expect(page.locator("#directions")).toBeHidden();
    const metrics=await page.evaluate(()=>{
      const get=s=>document.querySelector(s).getBoundingClientRect();
      const a=get("#undo"),b=get("#skip"),deck=get(".control-deck");
      return {width:document.documentElement.scrollWidth,viewport:innerWidth,
        controls:[a,b].map(r=>({w:r.width,h:r.height})),
        deck:{height:deck.height,left:deck.left,right:deck.right},
        board:get("#board").height};
    });
    expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
    expect(metrics.controls.every(b=>b.w>=44&&b.h>=44)).toBe(true);
    expect(metrics.deck.height).toBeLessThan(125);
    await page.screenshot({path:testInfo.outputPath("compact-tap-dock-"+width+".png"),fullPage:true});
    await page.locator("#skip").click();
    await page.locator("#board .cell.stop:not([disabled])").first().click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("pressing a glowing board destination without click never advances the turn",async ({page})=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await page.locator("#skip").click();
    const target=page.locator("#board .cell.stop:not([disabled])").first();
    await target.dispatchEvent("pointerdown",{pointerId:7,isPrimary:true});
    await expect(page.locator("#turnCount")).toHaveText("1手目");
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await target.dispatchEvent("pointercancel",{pointerId:7,isPrimary:true});
    await expect(page.locator("#turnCount")).toHaveText("1手目");
    await target.click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("landing tile remains a keyboard accessible real button",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  const target=page.locator("#board .cell.stop:not([disabled])").first();
  await target.focus();
  await page.keyboard.down("Space");
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await page.keyboard.up("Space");
  await expect(page.locator("#turnCount")).toHaveText("2手目");
});


test("dragging away from a landing tile does not execute a slide",async ({page})=>{
  await page.setViewportSize({width:390,height:667});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  const target=page.locator("#board .cell.stop:not([disabled])").first();
  const p={pointerId:7,isPrimary:true,button:0,clientX:80,clientY:80};
  await target.dispatchEvent("pointerdown",p);
  await page.locator("body").dispatchEvent("pointermove",{...p,clientX:108,clientY:114});
  await page.locator("body").dispatchEvent("pointerup",{...p,clientX:108,clientY:114});
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await target.click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
});


test("short-height phones keep board taps reachable and score visible at the dock",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const viewport of [
    {width:320,height:568},{width:375,height:667},
    {width:390,height:667},{width:430,height:740}
  ]){
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await expect(page.locator("#directions")).toBeHidden();
    const metrics=await page.evaluate(()=>{
      const main=document.querySelector("main");
      const scroll=document.querySelector(".board-scroll");
      return {pageWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,
        safePadding:parseFloat(getComputedStyle(main).paddingBottom),
        scrollPadding:parseFloat(getComputedStyle(document.documentElement).scrollPaddingBottom),
        boardWidth:document.querySelector("#board").getBoundingClientRect().width,
        boardScroll:getComputedStyle(scroll).overflowX};
    });
    expect(metrics.pageWidth).toBeLessThanOrEqual(metrics.viewportWidth);
    expect(metrics.boardWidth).toBeGreaterThan(275);
    expect(metrics.safePadding).toBeGreaterThanOrEqual(18);
    expect(metrics.scrollPadding).toBeGreaterThanOrEqual(18);
    expect(metrics.boardScroll).toBe("auto");
    const glance=page.locator("#mobileScoreGlance");
    await glance.scrollIntoViewIfNeeded();
    await expect(glance).toBeInViewport();
    await expect(glance.locator("[data-glance-turn]")).toHaveText("1手目");
    await page.locator("#skip").click();
    const stop=page.locator("#board .cell.stop:not([disabled])").first();
    await stop.scrollIntoViewIfNeeded();
    await expect(stop).toBeInViewport();
    await stop.click();
    await expect(glance.locator("[data-glance-turn]")).toHaveText("2手目");
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await page.screenshot({path:testInfo.outputPath("short-tap-iphone-"+viewport.width+"x"+viewport.height+".png"),fullPage:true});
  }
});


test("iPhone thumb-view score mirror follows the real turn without covering controls",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    const glance=page.locator("#mobileScoreGlance");
    // The opening screen keeps the accepted unaltered HUD.
    await expect(glance).toBeHidden();
    await expect(page.locator("#scores .score-count")).toHaveCount(2);
    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await expect(page.locator("html")).toHaveAttribute("data-zurash-match-view","play");
    await expect(glance).toHaveAttribute("data-ready","true");
    await expect(glance).toBeVisible();
    await expect(glance.locator("[data-glance-turn]")).toHaveText("1手目");

    async function verifyMirror(){
      return page.evaluate(()=>{
        const glance=document.querySelector("#mobileScoreGlance");
        const source=[...document.querySelectorAll("#scores .score")];
        const scores=[...glance.querySelectorAll("[data-glance-score]")].map(el=>el.textContent.trim());
        const expected=source.map(card=>card.querySelector(".score-count").textContent.trim().split("/")[0].trim());
        const turns=[...glance.querySelectorAll(".glance-player")].map(el=>el.classList.contains("current"));
        const expectedTurns=source.map(card=>card.classList.contains("current"));
        const box=el=>el.getBoundingClientRect();
        const r=box(glance);
        const controls=[...document.querySelectorAll("#undo, #skip")];
        const overlap=controls.some(el=>{
          const b=box(el);
          return r.left<b.right && r.right>b.left && r.top<b.bottom && r.bottom>b.top;
        });
        return {
          scores,expected,turns,expectedTurns,turn:glance.querySelector("[data-glance-turn]").textContent.trim(),
          realTurn:document.querySelector("#turnCount").textContent.trim(),
          pointerEvents:getComputedStyle(glance).pointerEvents,
          overlay:overlap,pageWidth:document.documentElement.scrollWidth,
          viewportWidth:innerWidth,
          outsideCabinet:r.left<box(document.querySelector(".control-deck")).left ||
            r.right>box(document.querySelector(".control-deck")).right
        };
      });
    }
    let snapshot=await verifyMirror();
    expect(snapshot.scores).toEqual(snapshot.expected);
    expect(snapshot.turns).toEqual(snapshot.expectedTurns);
    expect(snapshot.turn).toBe(snapshot.realTurn);
    expect(snapshot.pointerEvents).toBe("none");
    expect(snapshot.overlay).toBe(false);
    expect(snapshot.outsideCabinet).toBe(false);
    expect(snapshot.pageWidth).toBeLessThanOrEqual(snapshot.viewportWidth);

    // The actual engine performs a legal move; the glance tracks its DOM.
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await slideByBoard(page);
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await expect(glance.locator("[data-glance-turn]")).toHaveText("2手目");
    snapshot=await verifyMirror();
    expect(snapshot.scores).toEqual(snapshot.expected);
    expect(snapshot.turns).toEqual(snapshot.expectedTurns);
    expect(snapshot.turn).toBe(snapshot.realTurn);
    expect(snapshot.overlay).toBe(false);
    await page.screenshot({path:testInfo.outputPath("thumb-glance-"+width+".png"),fullPage:true});
  }
});


test("all five named layouts use genuine tap-to-land while desktop arrows remain",async ({page},testInfo)=>{
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.setViewportSize({width:390,height:844});
  for (const [layout,name] of [[4,"A"],[5,"B"],[6,"C"],[7,"D"],[8,"E"]]) {
    await page.goto("/");
    await expect(page.locator('link[href*="mobile-tap.css"]')).toHaveCount(1);
    await page.locator("#localMode").click();
    await page.locator("#layout").selectOption(String(layout));
    await page.locator("#start").click();
    await expect(page.locator("#directions")).toBeHidden();
    const cells=await page.locator("#board .cell").count();
    expect(cells).toBeGreaterThan(0);
    await page.locator("#skip").click();
    const tiles=page.locator("#board .cell.stop:not([disabled])");
    expect(await tiles.count()).toBeGreaterThan(0);
    await expect(tiles.first()).toHaveAttribute("data-slide-dir",/^[0-3]$/);
    await tiles.first().scrollIntoViewIfNeeded();
    await tiles.first().click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await expect(page.locator("#board .cell")).toHaveCount(cells);
    await expect(page.locator("#mobileScoreGlance [data-glance-turn]")).toHaveText("2手目");
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("touch-mode-"+name+".png"),fullPage:true});
  }
  await page.setViewportSize({width:1024,height:768});
  await page.goto("/");
  await expect(page.locator("#directions")).toBeVisible();
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  await expect(page.locator("#directions button:enabled").first()).toBeVisible();
  await page.locator("#directions button:enabled").first().click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
});


test("turning motion OFF hides active ice fragments without affecting slides",async ({page})=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await expect(page.locator("html")).toHaveAttribute("data-zurash-motion","animate");
  await page.locator("#skip").click();
  await page.locator("#board .cell.stop:not([disabled])").first().click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator(".ice-glide-vfx .ice-shard")).toHaveCount(4);
  await expect(page.locator(".ice-glide-vfx")).toBeVisible();
  await page.locator("#motionToggle").click();
  await expect(page.locator("html")).toHaveAttribute("data-zurash-motion","still");
  await expect(page.locator(".ice-glide-vfx")).toBeHidden();
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await expect(page.locator(".ice-glide-vfx .ice-shard")).toHaveCount(0);
  await page.locator("#skip").click();
  await page.locator("#board .cell.stop:not([disabled])").first().click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator(".ice-glide-vfx .ice-shard")).toHaveCount(0);
});


test("directional ice streak grows from the real start toward right and left",async ({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-command-feedback","ready");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.evaluate(()=>{
    window.__iceTrailHistory=[];
    const seen=new WeakSet();
    const host=document.querySelector(".board-wrap");
    new MutationObserver(()=>{
      const streak=host.querySelector(".ice-glide-vfx .ice-streak");
      if(!streak||seen.has(streak))return;
      seen.add(streak);
      const css=getComputedStyle(streak);
      window.__iceTrailHistory.push({
        vertical:streak.classList.contains("vertical"),
        reverse:streak.classList.contains("reverse"),
        name:css.animationName,
        origin:css.transformOrigin,
        time:streak.style.getPropertyValue("--ice-travel-ms"),
        pointer:css.pointerEvents,
      });
    }).observe(host,{subtree:true,childList:true});
  });
  // Player 1 starts at the left edge: a legal rightward glide.
  await page.locator("#skip").click();
  await expect(page.locator('#board .cell.stop[data-slide-dir="1"]')).toBeEnabled();
  await page.locator('#board .cell.stop[data-slide-dir="1"]').click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect.poll(()=>page.evaluate(()=>window.__iceTrailHistory.length)).toBe(1);
  // Player 2 starts at the right edge: the very same rule engine slides left.
  await page.locator("#skip").click();
  await expect(page.locator('#board .cell.stop[data-slide-dir="3"]')).toBeEnabled();
  await page.locator('#board .cell.stop[data-slide-dir="3"]').click();
  await expect(page.locator("#turnCount")).toHaveText("3手目");
  const tracks=await page.evaluate(()=>window.__iceTrailHistory);
  expect(tracks).toHaveLength(2);
  expect(tracks.map(t=>t.reverse)).toEqual([false,true]);
  expect(tracks.every(t=>!t.vertical)).toBe(true);
  expect(tracks.every(t=>t.name==="ice-swish-horizontal")).toBe(true);
  expect(tracks.every(t=>t.pointer==="none")).toBe(true);
  expect(tracks.every(t=>parseFloat(t.time)>=300)).toBe(true);
  expect(parseFloat(tracks[1].origin)).toBeGreaterThan(parseFloat(tracks[0].origin));
  await expect(page.locator("#board .cell")).toHaveCount(49);
  await page.screenshot({path:testInfo.outputPath("touch-directional-ice-trail.png"),fullPage:true});
});


test("real star pickup briefly lights the mirrored thumb score without changing the rules",async ({page},testInfo)=>{
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await page.locator("#localMode").click();
  await page.locator("#layout").selectOption("1");
  await page.locator("#start").click();
  const state=initial(1,0);
  // This official board permits a score on the first turn. Derive a legal
  // wall + slide from the real engine rather than injecting a fake score.
  const action=actions(state).find(a=>apply(state,a).scores[0]===1);
  expect(action).toBeTruthy();
  expect(action.wall).not.toBeNull();
  const next=apply(state,action);
  expect(next.scores).toEqual([1,0]);
  const glance=page.locator("#mobileScoreGlance");
  await expect(glance).toBeVisible();
  await expect(glance.locator(".glance-p1")).not.toHaveClass(/just-scored/);
  await page.locator(`[data-cell="${state.walls[action.wall.wall]}"]`).click();
  await page.locator(`[data-cell="${action.wall.to}"]`).click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await slideByBoard(page,action.dir);
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator("#scores .score.p1.just-scored")).toHaveCount(1);
  await expect(glance.locator("[data-glance-score='1']")).toHaveText("1");
  await expect(glance.locator(".glance-p1.just-scored")).toHaveCount(1);
  await expect(glance.locator(".glance-p2.just-scored")).toHaveCount(0);
  await expect(glance.locator(".glance-p1 b")).toHaveCSS("animation-name","ice-score-twinkle");
  await expect(glance).toHaveAttribute("aria-hidden","true");
  await expect(page.locator(".ice-glide-vfx .ice-shard.scored")).toHaveCount(4);
  await page.screenshot({path:testInfo.outputPath("real-star-thumb-score.png"),fullPage:true});
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
  await expect(glance.locator("[data-glance-score='1']")).toHaveText("0");
  await expect(glance.locator(".glance-p1")).not.toHaveClass(/just-scored/);
});

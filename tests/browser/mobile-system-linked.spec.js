import { test, expect } from "@playwright/test";
import { initial, movableWalls, moveWall, slideOptions, finishSlide } from "../../src/engine.js";

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
  await page.locator("#directions button").nth(chosen.dir).click();
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
      controls:[...document.querySelectorAll("#directions button, #undo, #skip, #settings")]
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
    expect(await page.locator("#directions button:enabled").count()).toBeGreaterThan(0);
    await page.screenshot({path:testInfo.outputPath("seamless-glide-"+width+".png"),fullPage:true});
    await page.locator("#directions button:enabled").first().click();
    await expect(page.locator("#phaseBadge")).toHaveText("1");
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("right-hand crosspad maps actual engine directions and preserves gameplay", async ({page},testInfo) => {
  await page.emulateMedia({reducedMotion:"reduce"});
  for (const width of [320,390,430]) {
    await page.setViewportSize({width,height:844});
    await page.goto("/");
    await expect(page.locator(".cell")).toHaveCount(49);
    await expect(page.locator("#directions button")).toHaveCount(4);
    await expect(page.locator(".control-deck .actions #skip")).toBeEnabled();
    await expect(page.locator(".score.current")).toHaveCount(1);

    const layout = await page.evaluate(() => {
      const rect = (selector) => {
        const r=document.querySelector(selector).getBoundingClientRect();
        return {x:r.x,y:r.y,w:r.width,h:r.height,cx:r.x+r.width/2,cy:r.y+r.height/2};
      };
      return {
        pageWidth:document.documentElement.scrollWidth,
        viewport:innerWidth,
        board:rect("#board"),
        pad:rect("#directions"),
        actions:rect(".control-deck .actions"),
        arrows:[...document.querySelectorAll("#directions button")].map(el=>{
          const r=el.getBoundingClientRect();return {txt:el.textContent,aria:el.getAttribute("aria-label"),cx:r.x+r.width/2,cy:r.y+r.height/2,w:r.width,h:r.height};
        }),
        controlRects:[...document.querySelectorAll("#skip,#undo")].map(el=>{
          const r=el.getBoundingClientRect();return {width:r.width,height:r.height};
        })
      };
    });
    expect(layout.pageWidth).toBeLessThanOrEqual(layout.viewport);
    expect(layout.pad.cx).toBeGreaterThan(layout.actions.cx);
    expect(layout.pad.y).toBeGreaterThanOrEqual(layout.board.y + layout.board.h - 2);
    const [up,right,down,left] = layout.arrows;
    expect(layout.arrows.map(x=>x.txt)).toEqual(["↑","→","↓","←"]);
    expect(layout.arrows.map(x=>x.aria)).toEqual(["上へ滑る","右へ滑る","下へ滑る","左へ滑る"]);
    expect(up.cy).toBeLessThan(right.cy);
    expect(down.cy).toBeGreaterThan(right.cy);
    expect(left.cx).toBeLessThan(up.cx);
    expect(right.cx).toBeGreaterThan(up.cx);
    expect(Math.abs(up.cx-down.cx)).toBeLessThan(2);
    expect(Math.abs(left.cy-right.cy)).toBeLessThan(2);
    expect(layout.arrows.every(x=>x.w>=44 && x.h>=44)).toBe(true);
    expect(layout.controlRects.every(x=>x.width>=44 && x.height>=44)).toBe(true);
    await page.screenshot({path:testInfo.outputPath("crosspad-"+width+"-wall.png"),fullPage:true});

    await page.locator("#localMode").click();
    await page.locator("#start").click();
    await page.locator("#skip").click();
    await expect(page.locator("#phaseBadge")).toHaveText("2");
    await expect(page.locator("#skip")).toBeDisabled();
    const active = page.locator("#directions button:enabled");
    expect(await active.count()).toBeGreaterThan(0);
    await page.screenshot({path:testInfo.outputPath("crosspad-"+width+"-glide.png"),fullPage:true});
    await active.first().click();
    await expect(page.locator("#phaseBadge")).toHaveText("1");
    await expect(page.locator("#turnCount")).toHaveText("2手目");
    await page.locator("#undo").click();
    await expect(page.locator("#turnCount")).toHaveText("1手目");
  }
});


test("arcade presses glow across real rerenders without changing legal moves", async ({page}, testInfo) => {
  await page.setViewportSize({width:390,height:844});
  await page.emulateMedia({reducedMotion:"no-preference"});
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-command-feedback","ready");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  const initialButtons = await page.locator("#directions button").count();
  expect(initialButtons).toBe(4);
  await page.evaluate(() => {
    window.__crosspadFeedback = [];
    const deck = document.querySelector(".control-deck");
    new MutationObserver(() => window.__crosspadFeedback.push({
      dir:deck.dataset.commandDirection || "",
      action:deck.dataset.commandAction || "",
    })).observe(deck,{attributes:true,attributeFilter:["data-command-direction","data-command-action"]});
  });
  await page.locator("#skip").click();
  await expect(page.locator("#phaseBadge")).toHaveText("2");
  await expect.poll(() => page.evaluate(() =>
    window.__crosspadFeedback.some(x => x.action === "skip")
  )).toBe(true);

  const enabled = page.locator("#directions button:enabled");
  expect(await enabled.count()).toBeGreaterThan(0);
  const chosen = await enabled.first().evaluate(b =>
    Array.from(b.parentElement.children).indexOf(b)
  );
  const names=["up","right","down","left"];
  await enabled.first().click();
  // A genuine press screenshot while the real pawn begins its glide.
  await page.screenshot({path:testInfo.outputPath("arcade-feedback-during-glide.png"),fullPage:true,animations:"allow"});
  await expect.poll(() => page.evaluate(() =>
    window.__crosspadFeedback.some(x => x.dir)
  )).toBe(true);
  expect(await page.evaluate(() => window.__crosspadFeedback.filter(x => x.dir).at(-1)?.dir))
    .toBe(names[chosen]);

  // Real engine, including the existing windup and end-of-slide score logic.
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  await expect(page.locator("#phaseBadge")).toHaveText("1");
  await expect(page.locator("#directions button")).toHaveCount(4);
  await page.waitForTimeout(800);
  await expect(page.locator(".control-deck")).not.toHaveAttribute("data-command-direction", /./);
  await page.screenshot({path:testInfo.outputPath("arcade-feedback-after-glide.png"),fullPage:true});
  await page.locator("#undo").click();
  await expect(page.locator("#turnCount")).toHaveText("1手目");
});

test("reduced motion keeps real crosspad controls usable without overlay animation", async ({page}) => {
  await page.setViewportSize({width:320,height:844});
  await page.emulateMedia({reducedMotion:"reduce"});
  await page.goto("/");
  await expect(page.locator("html")).toHaveAttribute("data-zurash-command-feedback","ready");
  await page.locator("#localMode").click();
  await page.locator("#start").click();
  await page.locator("#skip").click();
  await page.locator("#directions button:enabled").first().click();
  await expect(page.locator("#turnCount")).toHaveText("2手目");
  const css = await page.locator(".control-deck").evaluate(el =>
    getComputedStyle(el,"::after").animationName
  );
  expect(css).toBe("none");
});


test("real wall move hands focus to legal crosspad and back after sliding", async ({page},testInfo) => {
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
  await page.locator("#directions button:enabled").first().click();
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
  await page.locator("#directions button:enabled").first().click();
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
    await page.locator("#directions button:enabled").first().click();
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
    await page.locator("#directions button:enabled").first().click();
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
        allControls:[...document.querySelectorAll("#directions button,#skip,#undo,#settings,#help")]
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
    await page.locator("#directions button:enabled").first().click();
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
    await page.locator("#directions button:enabled").first().click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("mobile play help and auxiliary chrome stay reachable without competing with crosspad",async ({page},testInfo)=>{
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
    await page.locator("#directions button:enabled").first().click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});


test("star stop tip reads clearly below the live crosspad without adding a card",async ({page},testInfo)=>{
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
    await page.locator("#directions button:enabled").first().click();
    await expect(page.locator("#turnCount")).toHaveText("2手目");
  }
});

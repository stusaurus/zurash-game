/* Cosmetic mobile command feedback, delegated to existing game controls.
 * src/app.js owns rules/turns/movement; this file only observes the current
 * rendered phase and responds visually. Never intercepts or synthesizes a move.
 */
const mobile = window.matchMedia("(max-width: 600px)");
document.documentElement.dataset.zurashCommandFeedback = "ready";

const directions = ["up", "right", "down", "left"];

/* Instant tactile preview on physical touch/pointer down. This is an
 * observed state only: a press without a click never sends a game move.
 * The existing click handler still validates and executes every command. */
let previewTimer = null;
let activePointer = null;
function clearPreview() {
  activePointer = null;
  if (previewTimer !== null) clearTimeout(previewTimer);
  previewTimer = null;
  const shell = document.querySelector(".control-deck");
  if (shell) delete shell.dataset.commandPress;
}
function previewButton(target) {
  const shell = document.querySelector(".control-deck");
  if (!shell || !mobile.matches || !(target instanceof Element)) return;
  const button = target.closest("button");
  if (!button || button.disabled || !shell.contains(button)) return;
  const pad = button.closest("#directions");
  let key = "";
  if (pad) {
    const index = Array.prototype.indexOf.call(pad.children, button);
    if (index < 0 || index > 3) return;
    key = directions[index];
  } else if (button.id === "skip" || button.id === "undo") {
    key = button.id;
  }
  if (!key) return;
  clearPreview();
  shell.dataset.commandPress = key;
}
function releasePreview() {
  if (previewTimer !== null) clearTimeout(previewTimer);
  // Short release dwell makes fast taps perceivable but does not delay a move.
  previewTimer = setTimeout(clearPreview, 65);
}
document.addEventListener("pointerdown", event => {
  if (event.isPrimary === false || event.button > 0) return;
  previewButton(event.target);
  if (deck?.dataset.commandPress) {
    activePointer = { id:event.pointerId, x:event.clientX, y:event.clientY };
  }
}, true);
// A thumb can start on a button and then swipe to scroll. Once its contact
// travels >12px, remove the illusion of a held button; do not block scrolling.
document.addEventListener("pointermove", event => {
  if (!activePointer || event.pointerId !== activePointer.id) return;
  if (Math.hypot(event.clientX-activePointer.x,event.clientY-activePointer.y)>12)
    clearPreview();
}, true);
document.addEventListener("pointerup", event => {
  if (activePointer && event.pointerId !== activePointer.id) return;
  activePointer=null;
  releasePreview();
}, true);
document.addEventListener("pointercancel", clearPreview, true);
document.addEventListener("keydown", event => {
  if ((event.key === "Enter" || event.key === " ") && !event.repeat)
    previewButton(event.target);
}, true);
document.addEventListener("keyup", event => {
  if (event.key === "Enter" || event.key === " ") releasePreview();
}, true);
window.addEventListener("blur", clearPreview);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) clearPreview();
});

const deck = document.querySelector(".control-deck");
const phaseBadge = document.querySelector("#phaseBadge");
const arrowGroup = document.querySelector("#directions");

/* Read-only score/turn mirror for the cabinet where the player's thumb rests.
 * Observe the DOM rendered by app.js: NEVER maintain an independent game score.
 * The original accessible scoreboard stays authoritative and unchanged. */
const glance = document.querySelector("#mobileScoreGlance");
const liveScores = document.querySelector("#scores");
const liveTurn = document.querySelector("#turnCount");
function syncGlance() {
  if (!glance || !liveScores || !liveTurn) return;
  const cards = [...liveScores.querySelectorAll(".score")];
  if (cards.length !== 2) {
    delete glance.dataset.ready;
    return;
  }
  let valid = true;
  cards.forEach((card, index) => {
    const value = card.querySelector(".score-count")?.textContent.trim().split("/")[0].trim();
    const output = glance.querySelector(`[data-glance-score="${index + 1}"]`);
    const player = glance.querySelector(`.glance-p${index + 1}`);
    if (!value || !/^[0-9]+$/.test(value) || !output || !player) {
      valid = false;
      return;
    }
    output.textContent = value;
    player.classList.toggle("current", card.classList.contains("current"));
  });
  const turn = liveTurn.textContent.trim();
  if (!turn) valid = false;
  const turnLabel = glance.querySelector("[data-glance-turn]");
  if (!turnLabel) valid = false;
  else turnLabel.textContent = turn;
  if (valid) glance.dataset.ready = "true";
  else delete glance.dataset.ready;
}
if (glance && liveScores && liveTurn) {
  const glanceObserver = new MutationObserver(syncGlance);
  glanceObserver.observe(liveScores, {childList:true,characterData:true,subtree:true});
  glanceObserver.observe(liveTurn, {childList:true,characterData:true,subtree:true});
  syncGlance();
}
let clearFeedback = null;
let clearHandoff = null;
let lastPhase = null;

function clearPress() {
  clearPreview();
  if (clearFeedback !== null) clearTimeout(clearFeedback);
  clearFeedback = null;
  if (!deck) return;
  delete deck.dataset.commandDirection;
  delete deck.dataset.commandAction;
}

function clearTransition() {
  if (clearHandoff !== null) clearTimeout(clearHandoff);
  clearHandoff = null;
  if (deck) delete deck.dataset.commandHandoff;
}

function syncPhase() {
  if (!deck || !phaseBadge || !arrowGroup) return;
  // The label is owned by the real engine-driven src/app.js render().
  const phase = phaseBadge.textContent.trim() === "2" ? "slide" : "wall";
  const canGlide = phase === "slide" && !!arrowGroup.querySelector("button:enabled");
  const canWallAction = phase === "wall" && !document.querySelector("#skip")?.disabled;
  deck.dataset.commandPhase = phase;
  deck.dataset.commandReady = canGlide ? "true" : "false";

  if (lastPhase !== null && lastPhase !== phase) {
    clearTransition();
    // Do not suggest a playable action during CPU turns, victory, or busy frames.
    // Likewise honor the game's own animation preference.
    const playerCanAct = phase === "slide" ? canGlide : canWallAction;
    if (playerCanAct && mobile.matches && document.documentElement.dataset.zurashMotion !== "still") {
      deck.dataset.commandHandoff = phase;
      clearHandoff = setTimeout(clearTransition, 420);
    }
  }
  // A completed glide should release the directional light in step with the
  // real turn; the existing 750ms timer remains a safety fallback.
  if (lastPhase === "slide" && phase === "wall" && deck.dataset.commandDirection) {
    if (clearFeedback !== null) clearTimeout(clearFeedback);
    clearFeedback = setTimeout(clearPress, 110);
  }
  lastPhase = phase;
}

if (deck && phaseBadge && arrowGroup) {
  const observer = new MutationObserver(syncPhase);
  observer.observe(phaseBadge,{childList:true,characterData:true,subtree:true});
  observer.observe(arrowGroup,{childList:true});
  syncPhase();
}

document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  if (!deck || !target || !mobile.matches) return;
  const button = target.closest("button");
  if (!button) return;
  if (button.matches("#undo,#start,#rematch,#settings,#cpuMode,#localMode")) {
    clearPress();
    clearTransition();
    return;
  }
  if (button.disabled) return;
  const pad = button.closest("#directions");
  if (pad) {
    const index = Array.prototype.indexOf.call(pad.children,button);
    if (index < 0 || index > 3) return;
    clearPress();
    deck.dataset.commandDirection = directions[index];
    // Leave the glow on the stable parent while the actual pawn winds up/slides.
    clearFeedback = setTimeout(clearPress,750);
  } else if (button.id === "skip") {
    clearPress();
    deck.dataset.commandAction = "skip";
    clearFeedback = setTimeout(clearPress,320);
  }
},true);

mobile.addEventListener?.("change", () => {
  if (!mobile.matches) {
    clearPress();
    clearTransition();
  }
});
// Game's existing motion control also disables the decorative phase sweep.
document.getElementById("motionToggle")?.addEventListener("click", () => {
  queueMicrotask(() => {
    if (document.documentElement.dataset.zurashMotion === "still") clearTransition();
  });
});

/* Opening the valid match switches to a compact scenic HUD; no game state is
 * read or changed here. The actual #start handler validates/sets up the match,
 * closes #setupDialog and renders the board before this bubble listener runs.
 */
document.addEventListener("click", (event) => {
  const element = event.target instanceof Element ? event.target : null;
  if (!element?.closest("#start")) return;
  const setup = document.querySelector("#setupDialog");
  if (setup?.open) return; // Invalid setup: do not suggest a match started.
  document.documentElement.dataset.zurashMatchView = "play";
}, false);

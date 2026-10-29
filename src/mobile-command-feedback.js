/* Cosmetic mobile command feedback, delegated to existing game controls.
 * src/app.js owns rules/turns/movement; this file only observes the current
 * rendered phase and responds visually. Never intercepts or synthesizes a move.
 */
const mobile = window.matchMedia("(max-width: 600px)");
document.documentElement.dataset.zurashCommandFeedback = "ready";

const directions = ["up", "right", "down", "left"];
const deck = document.querySelector(".control-deck");
const phaseBadge = document.querySelector("#phaseBadge");
const arrowGroup = document.querySelector("#directions");
let clearFeedback = null;
let clearHandoff = null;
let lastPhase = null;

function clearPress() {
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

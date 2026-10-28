/* Cosmetic feedback layer for the real arcade crosspad.
 * Event delegation survives src/app.js replacing direction buttons on render().
 * Never prevents clicks, changes legal moves, or controls pawn animation.
 */
const mobile = window.matchMedia("(max-width: 600px)");
let clearFeedback = null;
const directions = ["up", "right", "down", "left"];
function resetFeedback(deck) {
  if (clearFeedback !== null) clearTimeout(clearFeedback);
  clearFeedback = null;
  delete deck.dataset.commandDirection;
  delete deck.dataset.commandAction;
}
document.addEventListener("click", (event) => {
  const target = event.target instanceof Element ? event.target : null;
  const deck = document.querySelector(".control-deck");
  if (!deck || !target || !mobile.matches) return;
  const button = target.closest("button");
  if (!button) return;
  // Reset old feedback even when a new match or Undo interrupts a glide.
  if (button.matches("#undo,#start,#rematch,#settings,#cpuMode,#localMode")) {
    resetFeedback(deck);
    return;
  }
  if (button.disabled) return;
  const pad = button.closest("#directions");
  if (pad) {
    const index = Array.prototype.indexOf.call(pad.children, button);
    if (index < 0 || index > 3) return;
    resetFeedback(deck);
    deck.dataset.commandDirection = directions[index];
    // Existing 85ms windup and 315-490ms glide run independently.
    clearFeedback = setTimeout(() => resetFeedback(deck), 750);
  } else if (button.id === "skip") {
    resetFeedback(deck);
    deck.dataset.commandAction = "skip";
    clearFeedback = setTimeout(() => resetFeedback(deck), 320);
  }
}, true);
mobile.addEventListener?.("change", () => {
  if (!mobile.matches) {
    const deck = document.querySelector(".control-deck");
    if (deck) resetFeedback(deck);
  }
});

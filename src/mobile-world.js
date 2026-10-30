/* Cosmetic-only loader: the approved art is optional until committed to /assets.
 * Never alter game state, inputs, AI, score or board geometry.
 * On missing artwork, preserve the playable existing PR #48 theme.
 */
const mobile = window.matchMedia("(max-width: 600px)");
let loading = false;
let applied = false;
function installApprovedMobileArt() {
  if (!mobile.matches || loading || applied) return;
  loading = true;
  const sources = [
    "assets/zurash-approved-logo.webp",
    "assets/ice-world-mobile.webp",
  ];
  Promise.all(sources.map(src => new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => img.naturalWidth > 0 ? resolve() : reject(new Error("empty image"));
    img.onerror = () => reject(new Error("missing artwork"));
    img.src = new URL(src, document.baseURI).href;
  }))).then(() => {
    if (applied) return;
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "world-mobile.css?v=20261029-arcade-v13";
    css.media = "(max-width: 600px)";
    document.head.append(css);
    // A separate, reversible HUD skin for the existing live score/phase markup.
    const hud = document.createElement("link");
    hud.rel = "stylesheet";
    hud.href = "mobile-hud.css?v=20261029-score-v13";
    hud.media = "(max-width: 600px)";
    document.head.append(hud);
    // Optional compact chrome after a valid match starts; never affects desktop.
    const focus = document.createElement("link");
    focus.rel = "stylesheet";
    focus.href = "mobile-focus.css?v=20261030-glance-grid-v17";
    focus.media = "(max-width: 600px)";
    // Stylesheets added at runtime load asynchronously, especially in WebKit.
    // Install tactile listeners only after every skin layer settles, so an
    // immediate pointerdown never sets a press state before its CSS exists.
    // Touch-first controls are a final responsive layer, loaded after the
    // established ice skins. Desktop direction buttons remain unchanged.
    const tap = document.createElement("link");
    tap.rel = "stylesheet";
    tap.href = "mobile-tap.css?v=20261031-board-press-v7";
    tap.media = "(max-width: 600px)";
    const skinReady = [css, hud, focus, tap].map(link => new Promise(resolve => {
      link.addEventListener("load", resolve, {once: true});
      link.addEventListener("error", resolve, {once: true});
    }));
    document.head.append(focus);
    document.head.append(tap);
    // Only cosmetic event feedback; board, engine and CPU remain authoritative.
    void Promise.all(skinReady)
      .then(() => import("./mobile-command-feedback.js?v=20261031-board-press-v31"))
      .catch(() => {});
    applied = true;
  }).catch(() => {
    /* Assets not yet installed: the existing world.css remains fully functional. */
  }).finally(() => { loading = false; });
}
installApprovedMobileArt();
mobile.addEventListener?.("change", installApprovedMobileArt);

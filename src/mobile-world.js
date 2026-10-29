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
    css.href = "world-mobile.css?v=20261028-system-linked";
    css.media = "(max-width: 600px)";
    document.head.append(css);
    // A separate, reversible HUD skin for the existing live score/phase markup.
    const hud = document.createElement("link");
    hud.rel = "stylesheet";
    hud.href = "mobile-hud.css?v=20261028-live-hud1";
    hud.media = "(max-width: 600px)";
    document.head.append(hud);
    // Optional compact chrome after a valid match starts; never affects desktop.
    const focus = document.createElement("link");
    focus.rel = "stylesheet";
    focus.href = "mobile-focus.css?v=20261029-gameplay-focus";
    focus.media = "(max-width: 600px)";
    document.head.append(focus);
    // Only cosmetic event feedback; board, engine and CPU remain authoritative.
    void import("./mobile-command-feedback.js").catch(() => {});
    applied = true;
  }).catch(() => {
    /* Assets not yet installed: the existing world.css remains fully functional. */
  }).finally(() => { loading = false; });
}
installApprovedMobileArt();
mobile.addEventListener?.("change", installApprovedMobileArt);

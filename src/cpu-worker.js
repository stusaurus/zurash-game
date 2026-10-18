import { choose, seeded } from "./ai.js";
self.onmessage = ({ data }) => {
  const { id, state, history, level = "search" } = data;
  try {
    self.postMessage({
      id,
      action: choose(state, {
        level,
        rng: seeded(state.ply + 137),
        seen: new Map(history),
      }),
    });
  } catch (e) {
    self.postMessage({ id, error: String(e) });
  }
};

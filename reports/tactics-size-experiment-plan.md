# Tactics board-size experiment (proposal; no results yet)

## Player observation and goal
A human's 7×7, five-star, first-to-three game ended in 13 plies and about two minutes. The goal for Tactics is roughly five minutes with **no new mechanics**. Increase the total stars and the winning threshold together. Preserve Sprint unchanged.

## Candidate matrix
| Candidate | Board | Stars | First to | Wall counts to test |
| --- | --- | --- | --- | --- |
| A | 8×8 | 7 | 4 | 8, 10, 12 |
| B (initial favorite) | 9×9 | 9 | 5 | 10, 12, 14 |
| C | 10×10 | 11 | 6 | 12, 14, 16 |

These are hypotheses, not measured playtimes. More stars can shorten access to a star even as the win threshold increases. Evaluate multiple wall densities rather than assuming more walls is better.

## Engine prerequisites
The current `src/engine.js` hardcodes seven in `step`, 49 in `distances`, and three in `finishSlide` and `successors`. `initial` does not store board size or win target in state. Do **not** simply append a 9×9 layout to `LAYOUTS`: its indices will be interpreted on a 7×7 board.

- Add `size` and `target` to state with backward-compatible defaults for legacy states. Keep existing layout indices and exact Sprint positions.
- Make `step` size-aware and pass state size through slide, movable-wall validation, and distance computation.
- Use `target` in both action application and search successor winner calculation. Include size/target in state keys to prevent cross-variant cache collisions.
- Audit all other consumers of 7×7 assumptions: AI evaluation and rotation transforms, study scripts, UI board CSS/rendering, keyboard/touch interaction, replay/serialization, and tests.
- Ensure no wall shift or slide strands either player. Preserve the existing turn rule (optional one-wall shift then slide) and full-turn legality.

## Fair candidate generation
- Start positions, walls and stars must be disjoint; all coordinates in bounds; valid legal opening for both starters.
- Prefer 180-degree rotational symmetry for fair starting geometry. Odd star counts may include one center star only on odd-width boards; for even widths an odd number of stars **cannot** be perfectly 180-degree symmetric without a fixed center cell. Therefore 8×8/7-star and 10×10/11-star layouts need a different balancing method (paired mirrored layouts, or an asymmetry audit) rather than claiming perfect symmetry.
- Use reproducible seeded generation and record each candidate's full coordinates and generator version.
- Reject immediate wins, no-legal-move starts, and severe one-sided access to stars before expensive matches.

## Experiment and acceptance
Run paired starter-swapped games for multiple policies (random, greedy, search/strong) and independent seeds. Record wins by starting seat, capped games, stalls, repeated states, first star, median/p90 decided plies, distinct opening choices, and CPU latency. Capped games are **not** draws. Keep raw logs and confidence intervals. Compare strong-vs-strong and asymmetric policy pairings to expose AI-specific bias.

Human duration is not CPU duration: log human turn start/end times, total elapsed time, mode, board size, number of turns, and optional difficulty, with privacy-preserving opt-in measurement. Target Tactics 4–6 minutes based on real human sessions; do not convert plies to minutes from one observation without uncertainty.

## Decision gate
Do not deploy Tactics as the default until (1) Sprint regression and browser tests pass, (2) both starting seats can win and severe first-player bias is not observed, (3) stalemates are acceptably rare, and (4) human play confirms longer **meaningful** decisions rather than empty travel. If all candidates are weak, iterate instead of selecting 9×9 by fiat.

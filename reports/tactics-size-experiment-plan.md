> Historical proposal. Current engine implementation, 5–7 minute target and measured results supersede the prerequisites and original target below. See [2026-10-21 audit](tactics-audit-2026-10-21.md) and [release gates](tactics-release-gates.md).

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

## Fairness is a mandatory release gate (not a weighted bonus)
A candidate that fails fairness is rejected regardless of playtime or entertainment scores. Evaluate seat advantage separately from player/AI skill by swapping the **same two policies** between first and second seats under matched seeds. Report win/loss/capped separately; never hide capped games inside a win-rate denominator.

- **Initial screening target:** first-seat win share among decided games 45–55%, with sufficient sample size and uncertainty shown. This is a screening target, **not** proof of balance; a 50% result from few or highly capped games is inconclusive.
- Require a predeclared statistical equivalence test or sufficiently narrow confidence interval around 50%, rather than accepting a nonsignificant difference from 50% as proof of equality. Increase sample sizes if the interval is too wide.
- Analyze strong-vs-strong, greedy-vs-greedy, and both directions of strong-vs-greedy. Flag consistent seat advantages even if aggregate results cancel.
- Compare identical layouts with starter swapped; for non-centrosymmetric layouts also run 180°-rotated and/or color-swapped mirrored layouts, balancing all orientation/starter combinations.
- Record early-star access, legal action count, forced openings, no-legal-move and stall rates for each seat. Inspect exploitability with deeper search and opening enumeration; empirical balance cannot rule out a forced win.
- Require actual human A/B seat-swapped trials before final release. Human sample sizes and time are reported separately from AI simulations.
- If no candidate passes, **do not ship Tactics**. Revise placement, wall density, star distribution, or board dimensions and rerun the same independent holdout protocol.

The proposed 45–55% band is a design target to be revisited with data; no candidate is currently certified fair.

## First automated screening (2026-10-20; exploratory, NOT acceptance)
Run: https://github.com/stusaurus/zurash-game/actions/runs/39430519566 ; artifact: tactics-fairness-screen (4 seeds/layout, 80-ply cap, random and lightweight greedy). This is a smoke test, not a powered balance study.

| Size | Policy | Decided first wins | Decided second wins | Capped / all |
|---|---|---:|---:|---:|
| 8×8 | random | 3 | 1 | 12/16 |
| 8×8 | greedy | 5 | 3 | 8/16 |
| 9×9 | random | 0 | 0 | 8/8 |
| 9×9 | greedy | 4 | 1 | 3/8 |
| 10×10 | random | 0 | 0 | 16/16 |
| 10×10 | greedy | 4 | 3 | 9/16 |

**Decision:** no candidate passes. High cap rates make first-seat win fractions unstable; the 9×9 greedy 4–1 split is not statistically conclusive. Random agents may be weak, so their cap rate alone does not establish a game-rule defect. First inspect star reachability and scoring opportunities, then test wall counts/placements, improve policies, and rerun larger paired samples. Do not call 80 plies a human playtime measurement.

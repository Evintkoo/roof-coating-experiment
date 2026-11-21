/**
 * One suite body, two sizes. A suite in tests/suites/ takes a Scale and registers its tests; the fast test file
 * (`X.test.ts`, run by `bun run check`) calls it with the small real configuration, the proof file
 * (`X.proof.test.ts`, run by `bun run proof`) with the full size and the original thresholds. Same code, same assertions;
 * only the sample sizes differ. See docs/testing.md.
 */
export type Tier = "fast" | "proof"

import {
  REFINE_BASELINE_PROOF,
  refineBaselineSuite,
} from "./suites/refineBaseline"

// Proof tier (bun run proof): plan-3 default 256 draws and the default 20 starts (40 solves); backs H5 and H11 in docs/proofs/plan-05.md.
refineBaselineSuite(REFINE_BASELINE_PROOF)

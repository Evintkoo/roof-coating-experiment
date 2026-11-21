import { REFINE_E2E_FAST, refineE2eSuite } from "./suites/refineE2e"

// Fast tier: the same chain and fault matrix as refine.e2e.proof.test.ts at small size (4 draws, 4 starts, 3 x 4 table).
refineE2eSuite(REFINE_E2E_FAST)

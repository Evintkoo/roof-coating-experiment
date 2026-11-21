import { REFINE_E2E_PROOF, refineE2eSuite } from "./suites/refineE2e"

// Proof tier (bun run proof): the full chain run (256 draws) -> refine (20 starts) -> budget-table (3 x 100 levels, 64 draws)
// with the plan limits T_nrt 600 s and T_nrt_table 900 s; backs H11 and the fault matrix F1..F13 in docs/proofs/plan-05.md.
refineE2eSuite(REFINE_E2E_PROOF)

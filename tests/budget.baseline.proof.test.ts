import { BUDGET_PROOF, budgetBaselineSuite } from "./suites/budgetBaseline"

// Proof tier (bun run proof): the full table, 3 profiles x 100 levels, 64 draws; backs H11, H13..H17 in docs/proofs/plan-05.md.
budgetBaselineSuite(BUDGET_PROOF)

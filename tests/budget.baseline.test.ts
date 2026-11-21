import { BUDGET_FAST, budgetBaselineSuite } from "./suites/budgetBaseline"

// Fast tier: the same assertions as budget.baseline.proof.test.ts on a small real table (3 profiles x 6 levels, 2 draws; BUDGET_FAST).
budgetBaselineSuite(BUDGET_FAST)

import { INDONESIA_E2E_PROOF, indonesiaE2eSuite } from "./suites/indonesiaE2e"

// Proof tier (bun run proof): real `run` at the plan-3 default of 256 draws, then `indonesia` on the five sites, ten years and
// 256 draws against the 600 s limit (H11), 6060 rows, one and two workers byte-identical, the report. The fault matrix F1..F9
// is size independent and lives in indonesia.e2e.test.ts.
indonesiaE2eSuite(INDONESIA_E2E_PROOF)

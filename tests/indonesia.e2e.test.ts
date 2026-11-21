import { INDONESIA_E2E_FAST, indonesiaE2eSuite } from "./suites/indonesiaE2e"

// Fast tier: real CLI chain run (4 draws), indonesia (Jakarta, 2023-2024, 4 draws), report; the budget, determinism and
// Bun-versus-Node checks, and the fault matrix F1..F9.
indonesiaE2eSuite(INDONESIA_E2E_FAST)

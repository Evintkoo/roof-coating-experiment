import { COMPARE_PROOF, compareBrowserSuite } from "./suites/compareBrowser"

// Proof tier (bun run proof): the same suite body with 200 live moves for the latency bound.
compareBrowserSuite(COMPARE_PROOF)

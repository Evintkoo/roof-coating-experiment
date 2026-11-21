import { BROWSER_PROOF, reportBrowserSuite } from "./suites/reportBrowser"

// Proof tier (bun run proof): every real-Chrome proof of plan 00 Task 5 (reorder, react, no-match, live equals core in Bun,
// 200-move latency, newest wins, layers off, extreme hold, clamping, keyboard, print, debug panel).
reportBrowserSuite(BROWSER_PROOF)

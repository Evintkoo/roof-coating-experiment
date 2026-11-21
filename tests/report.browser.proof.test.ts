import { BROWSER_PROOF, reportBrowserSuite } from "./suites/reportBrowser"

// Proof tier (bun run proof): every real-Chrome proof of plan 00 Task 5, the fast subset included, plus the ones that are bound
// to a wall-clock limit or a long hold and so stay out of the gate: 200-move latency (T_live_ms 100), newest wins under a burst,
// layers off, extreme hold, clamping, keyboard, print, no console errors during live use, debug panel.
reportBrowserSuite(BROWSER_PROOF)

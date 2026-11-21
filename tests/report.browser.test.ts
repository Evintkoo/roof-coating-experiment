import { BROWSER_FAST, reportBrowserSuite } from "./suites/reportBrowser"

// Fast tier: the real-Chrome proofs that do not depend on size or on a wall-clock limit: offline load, brush correctness, clear,
// dark theme, phone width, hook absence without #test, axis reorder, brush after a redraw, no-match row, scenario change and
// live equals core in Bun. The timing-bound and long-hold proofs run in report.browser.proof.test.ts.
reportBrowserSuite(BROWSER_FAST)

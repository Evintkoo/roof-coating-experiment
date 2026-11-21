import { BROWSER_FAST, reportBrowserSuite } from "./suites/reportBrowser"

// Fast tier: the small subset of the real-Chrome proofs that take seconds each (offline load, brush correctness, clear,
// dark theme, phone width, hook absence without #test). The rest of the suite runs in report.browser.proof.test.ts.
reportBrowserSuite(BROWSER_FAST)

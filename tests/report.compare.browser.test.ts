import { COMPARE_FAST, compareBrowserSuite } from "./suites/compareBrowser"

// Fast tier: the comparison lanes and the one-variable sweep on the built fixture report in a real Chrome (height against the frozen
// baseline, the one clock, live latency over 40 moves with a sweep running, cancel and stale, motion, wording).
compareBrowserSuite(COMPARE_FAST)

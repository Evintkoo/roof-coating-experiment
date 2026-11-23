import { PHYSICS_FAST, physicsBrowserSuite } from "./suites/physicsBrowser"

// Fast tier: the live physics tab on the built fixture report in a real Chrome (height against the frozen baseline, the one clock,
// motion rules, continuity, arrow scale, latency over 40 moves with the panel playing, workers, faults, wording, contrast).
physicsBrowserSuite(PHYSICS_FAST)

import { PIPELINE_E2E_FAST, pipelineE2eSuite } from "./suites/pipelineE2e"

// Fast tier: the artifacts, the determinism and different-seed checks on three real `run`s with 4 draws, the debug-log
// events, and the stepwise fault matrix F1..F9.
pipelineE2eSuite(PIPELINE_E2E_FAST)

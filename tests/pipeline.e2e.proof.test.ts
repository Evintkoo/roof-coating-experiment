import { PIPELINE_E2E_PROOF, pipelineE2eSuite } from "./suites/pipelineE2e"

// Proof tier (bun run proof): three real `run`s at the plan-3 default of 256 draws against the frozen runtime
// (tests/fixtures/frozen_runtime.txt); the debug-log events at n_mc 16. The fault matrix F1..F9 is size-independent
// and lives in pipeline.e2e.test.ts.
pipelineE2eSuite(PIPELINE_E2E_PROOF)

// Bundle entry used by live.test.ts: what the browser worker would pull in from core.
import { contextFromJson } from "../../src/core/pipeline/contextJson"
import { liveSimulate } from "../../src/core/pipeline/live"

;(globalThis as Record<string, unknown>).__entry = {
  contextFromJson,
  liveSimulate,
}

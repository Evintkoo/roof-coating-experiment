import {
  REFINE_BASELINE_FAST,
  refineBaselineSuite,
} from "./suites/refineBaseline"

// Fast tier: H5 against the same 96 screened candidates and 4096 Sobol points with 8 draws and 4 starts.
refineBaselineSuite(REFINE_BASELINE_FAST)

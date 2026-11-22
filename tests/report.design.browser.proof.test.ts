import {
  DESIGN_REPORT_PROOF,
  designReportBrowserSuite,
} from "./suites/designReportBrowser"

// Proof tier (bun run proof): the same suite body at proof size.
designReportBrowserSuite(DESIGN_REPORT_PROOF)

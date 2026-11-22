import {
  DESIGN_REPORT_FAST,
  designReportBrowserSuite,
} from "./suites/designReportBrowser"

// Fast tier: the redesigned page in a real Chrome (closed height, first screen, size and offline, labels, closed disclosures,
// widths, tap targets, print, headings and keyboard, determinism, theme, budget panel).
designReportBrowserSuite(DESIGN_REPORT_FAST)

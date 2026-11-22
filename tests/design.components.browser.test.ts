import {
  COMPONENTS_FAST,
  designComponentsBrowserSuite,
} from "./suites/designComponentsBrowser"

// Fast tier: behaviour of the molecule and organism scripts and the component gallery in both themes in a real Chrome.
designComponentsBrowserSuite(COMPONENTS_FAST)

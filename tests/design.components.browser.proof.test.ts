import {
  COMPONENTS_PROOF,
  designComponentsBrowserSuite,
} from "./suites/designComponentsBrowser"

// Proof tier (bun run proof): the fast subset plus the heavier checks (computed contrast of every state, print, a phone).
designComponentsBrowserSuite(COMPONENTS_PROOF)

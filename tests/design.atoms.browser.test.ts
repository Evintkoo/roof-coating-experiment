import {
  ATOMS_FAST,
  designAtomsBrowserSuite,
} from "./suites/designAtomsBrowser"

// Fast tier: every atom state in both themes (no console errors, no failed requests, fonts load), 44 px targets, the focus ring,
// reduced motion, a phone width. The computed contrast of every state and the print palette run in the proof twin.
designAtomsBrowserSuite(ATOMS_FAST)

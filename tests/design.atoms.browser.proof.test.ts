import {
  ATOMS_PROOF,
  designAtomsBrowserSuite,
} from "./suites/designAtomsBrowser"

// Proof tier (bun run proof): the fast subset plus the computed text contrast (4.5:1, both themes, every state) and print.
designAtomsBrowserSuite(ATOMS_PROOF)

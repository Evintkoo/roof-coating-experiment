import {
  ANIMATION_PROOF,
  animationBrowserSuite,
} from "./suites/animationBrowser"

// Proof tier (bun run proof): the same suite body plus the frame budget at 1x and 4x CPU throttle (H4).
animationBrowserSuite(ANIMATION_PROOF)

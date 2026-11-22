import {
  ANIMATION_FAST,
  animationBrowserSuite,
} from "./suites/animationBrowser"

// Fast tier: the animated section in a real Chrome (height, labels, sources, autoplay once, reduced motion, visibility pause,
// tweening, the screening run, the inline lane, a killed worker, a broken context). The frame budget is in the proof file.
animationBrowserSuite(ANIMATION_FAST)

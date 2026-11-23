// Everything the page would bundle for plan 07 (loop, tweens, day player, screening panel, pool) with the inline lane (the models).
import { designsOf, screenChunk } from "../../src/core/anim/screening"
import { contextFromJson } from "../../src/core/pipeline/contextJson"
import { browserDayDeps, mountDayPlayer } from "../../src/web/anim/dayPlayer"
import { browserLoop } from "../../src/web/anim/loop"
import { mountScreeningPanel } from "../../src/web/anim/screeningPanel"
import { createTweens } from "../../src/web/anim/tween"

Object.assign(window, {
  designsOf,
  screenChunk,
  contextFromJson,
  mountScreeningPanel,
  mountDayPlayer,
  browserDayDeps,
  browserLoop,
  createTweens,
})

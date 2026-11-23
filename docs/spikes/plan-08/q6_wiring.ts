// Q6: one render() call site in dayPlayer.ts covers play, pause, seek, step, setData and tick, so one onFrame hook is complete; the
// clock reads as a 0 to 1 phase (tH / 24) without change; opening a tab adds no ticker (no loop.add outside play).
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  advance,
  DAY_H,
  initialClock,
  seek,
} from "../../../src/core/anim/timeline"
import { expectOk, finish, root } from "./lib"

const src = readFileSync(join(root, "src/web/anim/dayPlayer.ts"), "utf8")
const calls = [...src.matchAll(/\brender\(\)/g)].length
const defs = [...src.matchAll(/const render = /g)].length
const adds = [...src.matchAll(/loop\.add\(/g)].length
console.log(
  `render() definitions ${defs}, calls ${calls - 0}; loop.add sites ${adds}`,
)
expectOk("render is defined once", defs === 1)
for (const m of ["play(", "pause(", "seek(", "step(", "setData(", "tick = "])
  expectOk(
    `the ${m.replace(/[( =]/g, "")} path ends in render()`,
    new RegExp(`${m.replace("(", "\\(")}[\\s\\S]*?render\\(\\)`).test(src),
  )
expectOk("the only ticker is added by play()", adds === 1)
let s = { ...initialClock("once"), playing: true }
s = advance(s, 1000, 1)
const phase = s.tH / DAY_H
expectOk(
  "the pure clock reads as a 0 to 1 phase",
  phase > 0 && phase < 1 && seek(s, 12).tH / DAY_H === 0.5,
  String(phase),
)
const e = advance({ ...initialClock("once"), playing: true }, 16_000, 1)
expectOk(
  "a sweep at 1x ends after 16 s and stops (once)",
  e.tH === 24 && !e.playing,
)
finish()

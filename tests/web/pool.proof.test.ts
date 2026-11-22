import { afterAll, beforeAll, expect, test } from "bun:test"
import { type Harness, startPoolHarness } from "../support/poolBrowser"

// Frozen in docs/spikes/plan-07.md and never edited: T_speedup 1.5, T_screen_s 2.
const T_SPEEDUP = 1.5
const T_SCREEN_S = 2
let h: Harness
beforeAll(async () => {
  h = await startPoolHarness()
}, 120000)
afterAll(async () => {
  await h?.close()
})

const time = async (size: number): Promise<number> => {
  const p = await h.page()
  await p.evaluate(({ w, c, d, s }) => window.T.make(w, c, d, s), {
    w: h.workerSrc,
    c: h.ctxJson,
    d: h.data,
    s: size,
  })
  await p.evaluate(() => window.T.full(96)) // warm up
  const best: number[] = []
  for (let i = 0; i < 3; i++)
    best.push((await p.evaluate(() => window.T.full(96))).ms)
  await p.context().close()
  return Math.min(...best)
}

test("speedupAtLeastFloor", async () => {
  const one = await time(1)
  const four = await time(4)
  const speedup = one / four
  console.log(
    `1 worker ${one.toFixed(0)} ms, 4 workers ${four.toFixed(0)} ms, speedup ${speedup.toFixed(2)}x`,
  )
  expect(speedup).toBeGreaterThanOrEqual(T_SPEEDUP)
  expect(four / 1000).toBeLessThanOrEqual(T_SCREEN_S)
}, 300000)

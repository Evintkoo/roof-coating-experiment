// Regression for docs/qa/bugs.md c6: parallel-coordinates ticks are short numbers and the first axis title is not clipped at the left,
// the layer checkboxes are ordinary-size boxes (the 44 px target is the label), the debug log uses the design's monospace font.
// Pre-fix commit 25d1885: ticks like 0.944274 and 34.1225, 44 px orange blocks, a non-design monospace.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { figText, outside, type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("parcoordsTicksAreShortAndTitlesInside", async () => {
  const page = await qa.open({ width: 390 })
  const ticks = await figText(
    page,
    "fig-parcoords",
    ".tick text, .axis-heading text, .axis text",
  )
  const nums = ticks.boxes
    .map((b) => b.text)
    .filter((t) => /^-?[0-9.]+$/.test(t))
  expect(nums.length).toBeGreaterThan(5)
  for (const n of nums)
    expect(n.replace(/^-/, "").length, n).toBeLessThanOrEqual(5)
  const titles = await figText(page, "fig-parcoords", ".axis-title")
  expect(outside(titles.boxes, titles.w, titles.h)).toEqual([])
}, 90_000)

test("layerCheckboxesAreOrdinaryAndDebugLogUsesTheDesignMonospace", async () => {
  const page = await qa.open()
  await page.evaluate(() => {
    for (const d of document.querySelectorAll("details")) d.open = true
  })
  const r = await page.evaluate(() => {
    const cb = document.getElementById("live-layer-primer") as HTMLInputElement
    const lab = cb.closest("label") as HTMLElement
    const mono = getComputedStyle(document.body)
      .getPropertyValue("--tv-font-mono")
      .trim()
    return {
      box: cb.getBoundingClientRect().width,
      labelH: lab.getBoundingClientRect().height,
      pre: getComputedStyle(
        document.getElementById("debug-events") as HTMLElement,
      ).fontFamily,
      mono,
    }
  })
  expect(r.box).toBeLessThanOrEqual(28)
  expect(r.labelH).toBeGreaterThanOrEqual(44)
  expect(r.mono).not.toBe("")
  expect(r.pre.replace(/\s/g, "")).toBe(r.mono.replace(/\s/g, ""))
}, 60_000)

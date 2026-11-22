// Regression for docs/qa/bugs.md c7: the layer drawings of the three recipes share one scale (a 205 um and a 104 um midcoat were drawn
// the same height because each stack was stretched to the same total). Pre-fix commit 25d1885.
import { expect, test } from "bun:test"
import { layerSchematic } from "../../../src/web/design/molecules/layerSchematic"
import { qaReport } from "../../support/qaPage"

const heights = (html: string, cls: string): number[] =>
  [
    ...html.matchAll(
      new RegExp(`class="tv-schem__${cls}"[^>]*height="([0-9.]+)"`, "g"),
    ),
  ].map((m) => Number(m[1]))

test("recipesOnThePageAreDrawnOnOneScale", async () => {
  const { html } = await qaReport()
  const mids = [
    ...html.matchAll(/data-layer-schematic="(SP-\d+)"[\s\S]*?<\/figure>/g),
  ].map((m) => m[0])
  expect(mids.length).toBe(3)
  const label = (f: string) => Number(/Midcoat ([0-9.]+) µm/.exec(f)?.[1])
  const h = mids.map((f) => heights(f, "midcoat")[0] as number)
  const um = mids.map(label)
  // equal scale: (height - 2.5 floor) / thickness is the same for every recipe
  const k = h.map((x, i) => (x - 2.5) / (um[i] as number))
  for (const v of k) expect(v).toBeCloseTo(k[0] as number, 2)
  expect(
    mids.every((f) => f.includes("the same scale for all three recipes")),
  ).toBe(true)
})

test("aSharedScaleDrawsAThinnerStackShorter", () => {
  const own = layerSchematic({
    name: "A",
    primer_um: 5,
    midcoat_um: 100,
    topcoat_um: 5,
  })
  const shared = layerSchematic({
    name: "A",
    primer_um: 5,
    midcoat_um: 100,
    topcoat_um: 5,
    sharedTotalUm: 220,
  })
  expect(heights(shared, "midcoat")[0] as number).toBeLessThan(
    heights(own, "midcoat")[0] as number,
  )
  expect(() =>
    layerSchematic({
      name: "A",
      primer_um: 5,
      midcoat_um: 100,
      topcoat_um: 5,
      sharedTotalUm: 50,
    }),
  ).toThrow()
})

// Regression for docs/qa/bugs.md c4: live control labels read cleanly (units, no doubled text, no float noise in the boxes).
// Pre-fix commit 39adac6: "Sol-gel pH (pH)", "(um)", "Peak irradiance (W/m2 peak irradiance (half-sine ...))", "(degC held constant)",
// and the midcoat PVC box showed 0.22499999999999998.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { openLive, type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close(), 120_000)

test("liveLabelsAndBoxValuesAreClean", async () => {
  const page = await qa.open()
  await openLive(page)
  const r = await page.evaluate(() => ({
    labels: [...document.querySelectorAll("#live-controls .srow label")].map(
      (l) => l.textContent ?? "",
    ),
    boxes: [
      ...document.querySelectorAll("#live-controls input[type=number]"),
    ].map((i) => (i as HTMLInputElement).value),
  }))
  expect(r.labels.length).toBe(11)
  for (const l of r.labels) {
    expect(l, l).not.toMatch(/\(um\)|degC|W\/m2|\(pH\)|half-sine/)
    expect((l.match(/\(/g) ?? []).length, l).toBeLessThanOrEqual(1)
  }
  expect(r.labels.some((l) => l.includes("(µm)"))).toBe(true)
  expect(r.labels.some((l) => l.includes("(°C)"))).toBe(true)
  expect(r.labels.some((l) => l.includes("(W/m²)"))).toBe(true)
  for (const b of r.boxes)
    expect(b.replace("-", "").replace(".", "").length, b).toBeLessThanOrEqual(7)
}, 60_000)

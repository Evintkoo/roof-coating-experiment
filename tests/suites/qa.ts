// Plan 07 Task 1, H1: the browser QA finds nothing on the fixed page and finds each seeded defect. One suite body, two sizes: the
// fast tier drives every control at 390 px; the proof tier adds the four widths and a 4x CPU throttle.
import { expect, test } from "bun:test"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { runQa } from "../../src/node/qa"
import { qaReport } from "../support/qaPage"
import type { Tier } from "./scale"

export type QaScale = {
  tier: Tier
  widths: readonly number[]
  cpuThrottle: number
}
export const QA_FAST: QaScale = { tier: "fast", widths: [390], cpuThrottle: 1 }
export const QA_PROOF: QaScale = {
  tier: "proof",
  widths: [320, 390, 768, 1280],
  cpuThrottle: 4,
}

export function qaSuite(S: QaScale): void {
  test("qaFindsNothingOnFixedPage", async () => {
    const { path } = await qaReport()
    const r = await runQa(path, {
      widths: S.widths,
      cpuThrottle: S.cpuThrottle,
    })
    expect(r.defects).toEqual([])
    // not an empty run: the controls, anchors, widths and the burst were really exercised
    expect(r.checked.controls).toBeGreaterThan(30)
    expect(r.checked.anchors).toBeGreaterThan(15)
    expect(r.checked.widths).toBe(S.widths.length)
    expect(r.checked.burst).toBe(50)
  }, 240_000)

  test("qaFindsEachSeededDefect", async () => {
    const { html } = await qaReport()
    const dir = mkdtempSync(join(tmpdir(), "qa-seed-"))
    const seeded = html.replace(
      "</main>",
      `<button type="button" id="seed-btn"></button><a href="#seed-dead">dead</a><p id="seed-dup">NaN</p><p id="seed-dup">x</p><div style="width:900px;height:4px"></div></main><script>console.error("seed console error");Promise.reject(new Error("seed rejection"));fetch("file:///nonexistent-seed.json")</script>`,
    )
    const path = join(dir, "seeded.html")
    writeFileSync(path, seeded)
    const r = await runQa(path, { widths: [390] })
    const ids = new Set(r.defects.map((d) => d.id))
    for (const want of [
      "console_error",
      "unnamed_control",
      "dead_anchor",
      "duplicate_id",
      "bad_text",
      "overflow",
    ])
      expect(ids.has(want), want).toBe(true)
    expect(r.defects.some((d) => d.repro.includes("unhandled rejection"))).toBe(
      true,
    )
  }, 240_000)
}

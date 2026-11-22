// Regression for docs/qa/bugs.md m9: the heading outline never skips a level, and no heading or sensitivity axis shows a raw
// column id. Pre-fix commit 041ab2d: H2 "Candidate card" inside H3, then H4; "r_solar", "t_max_c" and primer_gptes_molfrac on screen.
import { expect, test } from "bun:test"
import { figSobol } from "../../../src/web/figures"
import { qaReport } from "../../support/qaPage"

test("headingLevelsNeverSkipAndNeverStartInsideALowerOne", async () => {
  const { html } = await qaReport()
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, "")
    .replace(/<style[\s\S]*?<\/style>/g, "")
  const hs = [...body.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/g)].map(
    (m) => ({ n: Number(m[1]), text: (m[2] ?? "").replace(/<[^>]+>/g, "") }),
  )
  expect(hs.length).toBeGreaterThan(20)
  let prev = 0
  for (const h of hs) {
    expect(h.n, `"${h.text}" after h${prev}`).toBeLessThanOrEqual(prev + 1)
    expect(h.text, "raw id in heading").not.toMatch(/^[a-z0-9]+(_[a-z0-9]+)+$/)
    prev = h.n
  }
  expect(hs.filter((h) => h.n === 2 && /Candidate card/.test(h.text))).toEqual(
    [],
  )
})

test("sobolBarsAreLabelledWithWordsNotColumnIds", () => {
  const sens = ["primer_gptes_molfrac", "irradiance_w_m2"].flatMap((variable) =>
    (["S1", "ST"] as const).map((index) => ({
      output: "t_max_c",
      method: "sobol" as const,
      variable,
      index,
      value: 0.2,
      conf: 0.01,
    })),
  )
  const fig = figSobol(sens, "t_max_c")
  const xs = (fig.data as { x: string[] }[]).flatMap((t) => t.x)
  for (const x of xs) expect(x).not.toContain("_")
  expect(JSON.stringify(fig.layout)).not.toContain("t_max_c")
})

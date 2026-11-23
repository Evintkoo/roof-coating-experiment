// Regression for docs/qa/bugs.md c2: the Indonesia bars subtitle does not say "scenario ageing" twice, the legend sits above the
// facet titles, and the whiskers have a colour that shows on the bars. Pre-fix commit 041ab2d: "Aluminium, scenario ageing: aged
// (scenario ageing)", legend over "Jakarta"/"Surabaya".
import { expect, test } from "bun:test"
import { figIndonesiaBars } from "../../../src/web/figures"

const row = (site: string, bin: string, subject: string, state: string) => ({
  site,
  bin,
  subject,
  state,
  dq_w_m2: 10,
  dq_lo: 8,
  dq_hi: 12,
})

test("subtitleLegendAndWhiskers", () => {
  const rows = ["jakarta", "surabaya"].flatMap((s) =>
    ["hot", "typical", "overcast", "weighted"].flatMap((b) =>
      ["C1", "card_high", "card_balanced", "card_low"].map((u) =>
        row(s, b, u, "aged"),
      ),
    ),
  )
  const fig = figIndonesiaBars(rows as never, "aged")
  const layout = fig.layout as {
    annotations: { text: string; yshift?: number; y?: number }[]
    legend: { yshift: number }
    margin: { t: number }
  }
  const sub = layout.annotations.find((a) => a.text.startsWith("Aluminium"))
  expect(sub?.text).toBe(
    "Aluminium, scenario ageing: aged state; whiskers: outer bound of the benefit interval",
  )
  expect((sub?.text.match(/scenario ageing/g) ?? []).length).toBe(1)
  const titles = layout.annotations.filter(
    (a) => a.text === "Jakarta" || a.text === "Surabaya",
  )
  expect(titles.length).toBe(2)
  // the legend (anchored at the top of the plot, shifted up) clears the facet titles (anchored at the top, 13 px text) and the subtitle clears the legend
  expect(layout.legend.yshift).toBeGreaterThanOrEqual(30)
  expect(sub?.yshift ?? 0).toBeGreaterThan(layout.legend.yshift)
  expect(layout.margin.t).toBeGreaterThan(sub?.yshift ?? 0)
  for (const t of fig.data as { error_y: { color?: string } }[])
    expect(typeof t.error_y.color).toBe("string")
})

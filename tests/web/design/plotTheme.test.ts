import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  applyPlotTheme,
  colorScale,
  LIGHT_PLOT,
  plotTheme,
  SLOTS,
  slotColor,
  withAlpha,
} from "../../../src/web/design/plotTheme"
import { contrastRatio, THEMES } from "../../../src/web/design/themes"
import { resolveTheme } from "../../../src/web/design/tokens"
import { repoRoot } from "../../helpers"

const contract = JSON.parse(
  readFileSync(
    join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
const th = (m: "dark" | "light") =>
  plotTheme(m, resolveTheme(contract, THEMES, m), "Inter, sans-serif")

test("everySlotResolvesInBothThemesAndReachesThreeToOne", () => {
  for (const m of ["dark", "light"] as const) {
    const t = th(m)
    for (const s of SLOTS) {
      const c = slotColor(t, s)
      if (s !== "neutral")
        expect(contrastRatio(c, t.paper), `${m} ${s}`).toBeGreaterThanOrEqual(3)
    }
    expect(t.seq.length).toBe(7)
    expect(t.div.length).toBe(7)
  }
})

test("brandOrangeIsOnlyTheRecommendedSlot", () => {
  const t = th("dark")
  for (const s of SLOTS)
    if (s !== "recommended") expect(slotColor(t, s)).not.toBe(t.recommended)
})

test("aMissingTokenIsAnError", () => {
  expect(() => plotTheme("dark", { "surface-base": "#000000" }, "x")).toThrow(
    "token missing",
  )
})

test("colorScaleAndAlpha", () => {
  expect(colorScale(["#111111", "#222222", "#333333"])).toEqual([
    [0, "#111111"],
    [0.5, "#222222"],
    [1, "#333333"],
  ])
  expect(withAlpha("#ff0000", 0.2)).toBe("#ff000033")
  expect(withAlpha("rgba(1,2,3,0.5)", 0.2)).toBe("rgba(1,2,3,0.5)")
})

test("applyPlotThemeThemesAxesAnnotationsAndTraces", () => {
  const spec = {
    data: [
      {
        type: "scatter",
        line: { color: "#123456" },
        fillcolor: "#12345633",
        meta: { slot: "recommended" },
      },
      { type: "scatter", line: { color: "#123456" } },
    ],
    layout: {
      xaxis: {},
      annotations: [{ text: "a", name: "series-1" }, { text: "b" }],
    },
  }
  const d = th("dark")
  const out = applyPlotTheme(spec, d)
  expect((out.data[0] as { line: { color: string } }).line.color).toBe(
    d.recommended,
  )
  expect(out.data[1]).toEqual(spec.data[1])
  const lay = out.layout as unknown as {
    paper_bgcolor: string
    xaxis: { linecolor: string }
    annotations: { font: { color: string } }[]
  }
  expect(lay.paper_bgcolor).toBe(d.paper)
  expect(lay.xaxis.linecolor).toBe(d.axisStroke)
  expect(lay.annotations[0]?.font.color).toBe(d.colorway[0] as string)
  expect(lay.annotations[1]?.font.color).toBe(d.muted)
  // the input is not changed
  expect(spec.data[0]?.line.color).toBe("#123456")
  expect(LIGHT_PLOT.mode).toBe("light")
})

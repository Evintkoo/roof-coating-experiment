import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import { STAT_TONES, stat } from "../../../../src/web/design/molecules/stat"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R5 Stat", ["proxy", "scenario", "nominal", "interval"])
})

test("indexValueWithoutToneIsATypeError", () => {
  expectBuildError(
    // @ts-expect-error an index stat must say proxy, scenario or nominal
    () => stat({ label: "Corrosion index", value: 0.73 }),
    "Stat",
  )
  // an interval stat without its interval is a type error too
  expectBuildError(
    // @ts-expect-error the interval tone needs an interval
    () => stat({ label: "x", value: 1, tone: "interval" }),
    "Stat",
  )
})

test("everyToneRendersItsCaveatNextToTheValue", async () => {
  expect([...STAT_TONES]).toEqual(["proxy", "scenario", "nominal", "interval"])
  const proxy = stat({ label: "Corrosion index", value: 0.7013, tone: "proxy" })
  const els = await elementsOf(proxy)
  expect(
    els.find((e) => e.attrs["data-stat"] !== undefined)?.attrs["data-tone"],
  ).toBe("proxy")
  expect(proxy).toContain(">0.70<")
  expect(proxy).toContain('data-proxy-badge="proxy"')
  expect(proxy).toContain(">PROXY<")
  expect(stat({ label: "l", value: 1, tone: "scenario" })).toContain(
    'data-proxy-badge="scenario"',
  )
  expect(stat({ label: "l", value: 1, tone: "nominal" })).toContain(
    ">nominal only<",
  )
  const iv = stat({
    label: "Cooling",
    value: 14.44,
    unit: "K",
    digits: 1,
    tone: "interval",
    interval: { lo: 14.31, hi: 14.52 },
  })
  expect(iv).toContain(">14.4<")
  expect(iv).toContain(">K<")
  expect(iv).toContain("parameter uncertainty only: 14.3 to 14.5 K")
  expect(iv).not.toContain("data-proxy-badge")
  const note = stat({ label: "l", value: 1, tone: "proxy", note: "n" })
  expect(note).toContain(">n<")
})

test("statEscapesEveryField", async () => {
  const html = stat({
    label: XSS,
    value: 1,
    unit: XSS,
    note: XSS,
    tone: "proxy",
  })
  const els = await elementsOf(html)
  expect(els.some((e) => e.tag === "img")).toBe(false)
  expect(html).not.toContain("<img")
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(
    () => stat({ label: "l", value: Number.NaN, tone: "proxy" }),
    "Stat",
  )
  expectBuildError(
    () => stat({ label: "l", value: 1, tone: "info" as never }),
    "Stat",
  )
  expectBuildError(
    () =>
      stat({ label: "l", value: 1, tone: "proxy", interval: { lo: 2, hi: 1 } }),
    "Stat",
  )
  expectBuildError(() => stat({ label: " ", value: 1, tone: "proxy" }), "Stat")
})

test("cssIsTokenOnlyAndUnitsAreSans", () => {
  const css = MOLECULE_CSS.stat
  expectTokenOnly(css)
  expect(css).toMatch(/\.tv-stat__unit\{[^}]*font-family:var\(--tv-font-sans\)/)
  expect(css).toMatch(/\.tv-stat__num\{[^}]*font-family:var\(--tv-font-mono\)/)
})

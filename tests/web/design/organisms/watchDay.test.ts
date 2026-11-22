import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import {
  HONESTY_LABEL,
  watchDay,
} from "../../../../src/web/design/organisms/watchDay"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const day = (shift: number) =>
  Array.from(
    { length: 144 },
    (_, i) =>
      25 + shift + 20 * Math.max(0, Math.sin((Math.PI * (i / 6 - 6)) / 12)),
  )
const data = { recipeC: day(0), bareC: day(8), loC: day(-1), hiC: day(1) }

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R33 WatchDay", [
    "paused",
    "playing",
    "ended",
    "0.5",
    "1",
    "2",
    "4",
  ])
})

test("hasEveryControlTheHonestyLabelAndFourReadouts", async () => {
  const html = watchDay({ name: "SP-075", data })
  const els = await elementsOf(html)
  const anim = els.map((e) => e.attrs["data-anim"]).filter(Boolean)
  for (const k of ["play", "step-back", "scrub", "time", "step-fwd", "speed"])
    expect(anim).toContain(k)
  expect(anim.filter((k) => k === "read").length).toBe(4)
  expect(html).toContain(HONESTY_LABEL)
  expect(html).toContain("data-watch-day")
  // every control has an accessible name
  for (const e of els.filter((x) => x.tag === "button" || x.tag === "input"))
    expect(Boolean(e.attrs["aria-label"]), JSON.stringify(e.attrs)).toBe(true)
})

test("noAnimatedElementWithoutASource", async () => {
  const els = await elementsOf(watchDay({ name: "SP-075", data }))
  const moving = els.filter(
    (e) =>
      /tv-daychart__(cursor|dot|line|band)/.test(e.attrs.class ?? "") ||
      e.attrs["data-flux"],
  )
  expect(moving.length).toBeGreaterThanOrEqual(9)
  for (const e of moving)
    expect(e.attrs["data-source"], e.attrs.class).toBeTruthy()
})

test("badInputIsABuildErrorAndNamesAreEscaped", async () => {
  expectBuildError(() => watchDay({ name: "", data }), "WatchDay")
  expectBuildError(
    () => watchDay({ name: "x", data, state: "fast" as never }),
    "PlayButton",
  )
  expectBuildError(
    () => watchDay({ name: "x", data, speed: 3 as never }),
    "SpeedSelect",
  )
  expect(
    (await elementsOf(watchDay({ name: XSS, data }))).some(
      (e) => e.tag === "img",
    ),
  ).toBe(false)
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(ORGANISM_CSS.watchDay as string)
})

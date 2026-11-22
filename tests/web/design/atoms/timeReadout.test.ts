import { expect, test } from "bun:test"
import fc from "fast-check"
import {
  clockText,
  timeReadout,
} from "../../../../src/web/design/atoms/timeReadout"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R27 TimeReadout", [])
})

test("clockTextIsHhMmAndClamped", () => {
  expect(clockText(0)).toBe("00:00")
  expect(clockText(14.5)).toBe("14:30")
  expect(clockText(23.999)).toBe("23:59")
  expect(clockText(24)).toBe("24:00")
  expect(clockText(-3)).toBe("00:00")
  expect(clockText(Number.NaN)).toBe("00:00")
})

test("clockTextIsAlwaysFiveCharactersForAnyNumber", () => {
  fc.assert(
    fc.property(fc.double({ noNaN: false }), (x) =>
      /^\d\d:\d\d$/.test(clockText(x)),
    ),
  )
})

test("rendersAnOutputWithTheExactHour", async () => {
  const html = timeReadout({ tH: 7.25 })
  const [el] = await elementsOf(html)
  expect(el?.tag).toBe("output")
  expect(el?.attrs["data-value"]).toBe("7.25")
  expect(html).toContain(">07:15</output>")
  expectBuildError(() => timeReadout({ tH: Number.NaN }), "TimeReadout")
})

import { expect, test } from "bun:test"
import { DataError } from "../../src/core/errors"
import { parseEpw, TMYX_FILES } from "../../src/node/epw"

const CAL = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const HEADER = [
  "LOCATION,Jakarta-Soekarno-Hatta.Intl.AP,JW,IDN,SRC-TMYx,967490,-6.12550,106.6590,7.0,10.4",
  "DESIGN CONDITIONS,0",
  "TYPICAL/EXTREME PERIODS,0",
  "GROUND TEMPERATURES,0",
  "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
  "COMMENTS 1,test",
  "COMMENTS 2,test",
  "DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31",
]

/** An EPW row in the real column layout (35 fields); GHI is field 13. A calendar year without 29 February. */
function epw(
  ghiOf: (m: number, d: number, h: number) => string,
  drop = 0,
): string {
  const rows: string[] = []
  for (const [mi, n] of CAL.entries())
    for (let d = 1; d <= n; d++)
      for (let h = 1; h <= 24; h++) {
        const f = [
          2025,
          mi + 1,
          d,
          h,
          0,
          "?9?9",
          26.2,
          23.9,
          87,
          100930,
          0,
          0,
          404,
          ghiOf(mi + 1, d, h),
        ]
        while (f.length < 35) f.push(0)
        rows.push(f.join(","))
      }
  return [...HEADER, ...rows.slice(0, rows.length - drop)].join("\n")
}

test("parseEpw8760Rows", () => {
  const r = parseEpw(epw((m, _d, h) => String(m * 100 + h)))
  expect(r.ghi.length).toBe(8760)
  expect(r.month.length).toBe(8760)
  expect(r.ghi[0]).toBe(101) // 1 January, hour 1
  expect(r.ghi[8759]).toBe(1224) // 31 December, hour 24
  const perMonth = new Array<number>(12).fill(0)
  for (const m of r.month) perMonth[m - 1] = (perMonth[m - 1] as number) + 1
  expect(perMonth).toEqual(CAL.map((n) => n * 24)) // February has 672 hours: no leap day
  // a trailing newline and CRLF line ends are tolerated
  expect(
    parseEpw(`${epw(() => "5").replaceAll("\n", "\r\n")}\r\n`).ghi.length,
  ).toBe(8760)
})

test("parseEpwRejectsBadFiles", () => {
  const ok = () => "1"
  expect(() => parseEpw(epw(ok, 1))).toThrow(DataError) // 8759 rows
  expect(() =>
    parseEpw(`${epw(ok)}\n${"2025,1,1,1,0,x,0,0,0,0,0,0,0,0"}`),
  ).toThrow(DataError) // 8761 rows
  expect(() =>
    parseEpw(epw((m, d, h) => (m === 3 && d === 4 && h === 5 ? "9999" : "1"))),
  ).toThrow(DataError)
  expect(() =>
    parseEpw(epw((m, d, h) => (m === 3 && d === 4 && h === 5 ? "-4" : "1"))),
  ).toThrow(DataError)
  expect(() =>
    parseEpw(epw((m, d, h) => (m === 3 && d === 4 && h === 5 ? "abc" : "1"))),
  ).toThrow(DataError)
  expect(() => parseEpw(epw(ok).replace("LOCATION,", "SITE,"))).toThrow(
    DataError,
  )
  expect(() => parseEpw("")).toThrow(DataError)
})

test("tmyxFilesCoverFiveSites", () => {
  expect(Object.keys(TMYX_FILES)).toEqual([
    "jakarta",
    "surabaya",
    "medan",
    "makassar",
    "bandung",
  ])
  for (const p of Object.values(TMYX_FILES))
    expect(p).toMatch(/_TMYx\.2011-2025\.zip$/)
})

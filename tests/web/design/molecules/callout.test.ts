import { expect, test } from "bun:test"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  CALLOUT_TONES,
  callout,
} from "../../../../src/web/design/molecules/callout"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R7 Callout", ["info", "caution", "limit"])
})

test("everyToneIsANoteWithAWordAndParagraphs", async () => {
  expect([...CALLOUT_TONES]).toEqual(["info", "caution", "limit"])
  for (const [tone, word] of [
    ["info", "Note"],
    ["caution", "Caution"],
    ["limit", "Limit"],
  ] as const) {
    const html = callout({ tone, body: ["One.", "Two."] })
    const els = await elementsOf(html)
    expect(els[0]?.attrs.role).toBe("note")
    expect(els[0]?.attrs["data-callout"]).toBe(tone)
    expect(els.filter((e) => e.tag === "p").length).toBe(3) // title + 2
    expect(html).toContain(`>${word}</p>`)
  }
  expect(callout({ tone: "info", title: "Honesty", body: "x" })).toContain(
    ">Honesty</p>",
  )
})

test("escapesTitleAndBodyF8", async () => {
  const els = await elementsOf(
    callout({ tone: "caution", title: XSS, body: [XSS] }),
  )
  expect(els.some((e) => e.tag === "img")).toBe(false)
})

test("badInputIsABuildErrorF7", () => {
  expectBuildError(
    () => callout({ tone: "warn" as never, body: "x" }),
    "Callout",
  )
  expectBuildError(() => callout({ tone: "info", body: "" }), "Callout")
  expectBuildError(() => callout({ tone: "info", body: [] }), "Callout")
  expectBuildError(() => callout({ tone: "info", body: ["a", " "] }), "Callout")
})

test("cssIsTokenOnlyWithEveryTone", () => {
  expectTokenOnly(MOLECULE_CSS.callout)
  for (const t of CALLOUT_TONES)
    expect(MOLECULE_CSS.callout).toContain(`.tv-callout--${t}`)
})

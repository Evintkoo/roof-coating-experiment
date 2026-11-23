import { expect, test } from "bun:test"
import {
  PLAY_STATES,
  PLAY_WORDS,
  playButton,
} from "../../../../src/web/design/atoms/playButton"
import { MOLECULE_CSS } from "../../../../src/web/design/css"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
} from "../../../support/designComponents"

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R24 PlayButton", PLAY_STATES)
})

test("everyStateIsARealButtonWithAVisibleWordAndANameThatSaysWhatItDoes", async () => {
  for (const state of PLAY_STATES) {
    const html = playButton({ state })
    const [el, ...rest] = await elementsOf(html)
    expect(el?.tag).toBe("button")
    expect(el?.attrs.type).toBe("button")
    expect(el?.attrs["data-state"]).toBe(state)
    expect(el?.attrs["aria-label"]).toBe(PLAY_WORDS[state].aria)
    expect(html).toContain(`>${PLAY_WORDS[state].label}</span>`)
    expect(rest.map((e) => e.tag)).toEqual(["span", "span"])
  }
})

test("anUnknownStateIsABuildErrorF9", () => {
  expectBuildError(
    () => playButton({ state: "rewinding" as never }),
    "PlayButton",
  )
})

test("cssIsTokenOnlyAndHasA44pxTarget", () => {
  expectTokenOnly(MOLECULE_CSS.playControls)
  expect(MOLECULE_CSS.playControls).toContain("min-height:var(--tv-target-min)")
  expect(MOLECULE_CSS.playControls).toContain("min-width:var(--tv-target-min)")
})

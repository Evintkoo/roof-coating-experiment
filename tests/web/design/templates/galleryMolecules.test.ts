import { expect, test } from "bun:test"
import { CALLOUT_TONES } from "../../../../src/web/design/molecules/callout"
import { FIGURE_SIZES } from "../../../../src/web/design/molecules/figureFrame"
import { LEGEND_SHAPES } from "../../../../src/web/design/molecules/legend"
import { PROXY_TONES } from "../../../../src/web/design/molecules/proxyBadge"
import { SLIDER_STATES } from "../../../../src/web/design/molecules/sliderField"
import { STAT_TONES } from "../../../../src/web/design/molecules/stat"
import { CELL_KINDS } from "../../../../src/web/design/molecules/tableCell"
import {
  GALLERY_MOLECULES_CSS,
  galleryMoleculeCells,
  galleryMolecules,
} from "../../../../src/web/design/templates/galleryMolecules"
import { elementsOf, expectTokenOnly } from "../../../support/designComponents"

const states = (m: string) =>
  galleryMoleculeCells()
    .filter((c) => c.atom === m)
    .map((c) => c.state)

test("everyStateOfEveryMoleculeIsInTheGalleryOnce", () => {
  expect(states("ProxyBadge")).toEqual([...PROXY_TONES])
  for (const tone of STAT_TONES) expect(states("Stat")).toContain(tone)
  expect(states("Callout")).toEqual([...CALLOUT_TONES])
  expect(states("Disclosure")).toEqual(["closed", "open"])
  for (const s of FIGURE_SIZES) expect(states("FigureFrame")).toContain(s)
  for (const s of LEGEND_SHAPES) expect(states("Legend")).toContain(s)
  expect(states("Tabs")).toEqual(["first selected", "second selected"])
  expect(states("SliderField")).toEqual([...SLIDER_STATES])
  for (const k of CELL_KINDS)
    expect(states("TableCell")).toContain(
      k === "empty"
        ? "empty"
        : k === "text"
          ? "text"
          : k === "number"
            ? "number"
            : "index",
    )
  expect(states("IntervalBar").length).toBeGreaterThanOrEqual(3)
  const keys = galleryMoleculeCells().map((c) => `${c.atom}/${c.state}`)
  expect(new Set(keys).size).toBe(keys.length)
})

test("fragmentIsDeterministicOutlinedAndUsesDistinctIds", async () => {
  const a = galleryMolecules()
  expect(galleryMolecules()).toBe(a)
  const els = await elementsOf(a)
  expect(els.filter((e) => e.attrs.class === "tv-gallery__cell").length).toBe(
    galleryMoleculeCells().length,
  )
  expect(els.filter((e) => e.tag === "h2").length).toBe(1)
  expect(els.filter((e) => e.tag === "h3").length).toBe(11)
  const ids = els.map((e) => e.attrs.id).filter(Boolean) as string[]
  expect(new Set(ids).size).toBe(ids.length)
  expect(els.some((e) => e.tag === "script")).toBe(false)
})

test("galleryCssIsTokenOnly", () => {
  expectTokenOnly(GALLERY_MOLECULES_CSS)
})

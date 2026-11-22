import { expect, test } from "bun:test"
import { BADGE_TONES } from "../../../../src/web/design/atoms/badge"
import {
  BUTTON_STATES,
  BUTTON_VARIANTS,
} from "../../../../src/web/design/atoms/button"
import { CHIP_STATES } from "../../../../src/web/design/atoms/chip"
import { CODE_VARIANTS } from "../../../../src/web/design/atoms/codeBlock"
import { ICON_NAMES } from "../../../../src/web/design/atoms/icon"
import { NAVLINK_STATES } from "../../../../src/web/design/atoms/navLink"
import { SECTION_LABEL_VARIANTS } from "../../../../src/web/design/atoms/sectionLabel"
import {
  GALLERY_CSS,
  galleryAtomCells,
  galleryAtoms,
} from "../../../../src/web/design/templates/galleryAtoms"
import {
  elementsOf,
  literalsIn,
  TOKEN_NAMES,
  varNames,
} from "../../../support/designAtoms"

const states = (atom: string) =>
  galleryAtomCells()
    .filter((c) => c.atom === atom)
    .map((c) => c.state)

test("everyStateOfEveryAtomIsInTheGalleryOnce", () => {
  expect(states("Button")).toEqual(
    BUTTON_VARIANTS.flatMap((v) =>
      BUTTON_STATES.map((s) => `${v} ${s}`),
    ).concat(["link", "link external", "icon"]),
  )
  expect(states("Icon")).toEqual([...ICON_NAMES])
  expect(states("Logo")).toEqual(["default"])
  expect(states("NavLink")).toEqual([...NAVLINK_STATES])
  expect(states("SectionLabel")).toEqual([...SECTION_LABEL_VARIANTS])
  expect(states("Badge")).toEqual([...BADGE_TONES])
  expect(states("Chip")).toEqual([...CHIP_STATES])
  expect(states("CodeBlock")).toEqual([...CODE_VARIANTS])
  const keys = galleryAtomCells().map((c) => `${c.atom}/${c.state}`)
  expect(new Set(keys).size).toBe(keys.length)
})

test("fragmentIsDeterministicEscapedAndOutlined", async () => {
  const a = galleryAtoms()
  expect(galleryAtoms()).toBe(a)
  const els = await elementsOf(a)
  const cells = els.filter((e) => e.attrs.class === "tv-gallery__cell")
  expect(cells.length).toBe(galleryAtomCells().length)
  for (const c of cells) {
    expect(c.attrs["data-atom"]).toBeTruthy()
    expect(c.attrs["data-state"]).toBeTruthy()
  }
  // one h2, one h3 per atom, no skipped level
  expect(els.filter((e) => e.tag === "h2").length).toBe(1)
  expect(els.filter((e) => e.tag === "h3").length).toBe(8)
  expect(els.some((e) => e.tag === "script")).toBe(false)
  // every interactive atom is marked so the browser test can measure target sizes
  expect(a).toContain('data-interactive="true"')
})

test("galleryCssIsTokenOnly", () => {
  expect(literalsIn(GALLERY_CSS)).toEqual([])
  for (const n of varNames(GALLERY_CSS))
    expect(TOKEN_NAMES.has(n), n).toBe(true)
})

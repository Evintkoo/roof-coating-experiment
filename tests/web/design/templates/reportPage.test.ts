import { expect, test } from "bun:test"
import {
  reportBody,
  reportDocument,
} from "../../../../src/web/design/templates/reportPage"
import { THEME_INIT_SCRIPT } from "../../../../src/web/design/theme"
import { elementsOf, expectBuildError } from "../../../support/designComponents"

const S = [
  { id: "verdict", label: "Verdict", html: "<section id='verdict'></section>" },
  { id: "limits", label: "Limits", html: "<section id='limits'></section>" },
  {
    id: "extra",
    label: "Extra",
    html: "<section id='extra'></section>",
    nav: false,
  },
]
const HEX = "a".repeat(64)

test("shellHasSkipLinkRailMainAndToggle", async () => {
  const els = await elementsOf(reportBody({ brand: "Spandek", sections: S }))
  expect(els.some((e) => e.attrs.class === "tv-shell")).toBe(true)
  expect(els.some((e) => e.attrs.class === "tv-skip")).toBe(true)
  expect(els.filter((e) => e.tag === "main").length).toBe(1)
  expect(els.some((e) => e.attrs.id === "theme-toggle")).toBe(true)
  // the rail lists the sections that want a link, in order
  const links = els.filter(
    (e) =>
      e.tag === "a" &&
      String(e.attrs.href).startsWith("#") &&
      e.attrs.class?.includes("tv-navlink"),
  )
  expect(links.map((l) => l.attrs.href)).toEqual(["#verdict", "#limits"])
})

test("documentCarriesTheCoreHashTheTitleAndTheScriptsInOrder", () => {
  const html = reportDocument({
    title: "<b>t</b>",
    core: HEX,
    css: "a{}",
    brand: "S",
    sections: S,
    scripts: ["data", "plotly", "main"],
  })
  expect(html).toContain(`<meta name="spandek-core-sha256" content="${HEX}">`)
  expect(html).not.toContain("<b>t</b>")
  const blocks = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1],
  )
  // the theme script is first, in <head>, so the stored theme is applied before the first paint
  expect(blocks).toEqual([THEME_INIT_SCRIPT, "data", "plotly", "main"])
  expect(html.indexOf(THEME_INIT_SCRIPT)).toBeLessThan(html.indexOf("<style>"))
  expect(html).toContain('<html lang="en" data-theme="light">')
  expect(
    reportDocument({
      title: "t",
      core: HEX,
      css: "",
      brand: "S",
      sections: S,
      scripts: ["", "", ""],
    }),
  ).toBe(
    reportDocument({
      title: "t",
      core: HEX,
      css: "",
      brand: "S",
      sections: S,
      scripts: ["", "", ""],
    }),
  )
})

test("badInputsAreBuildErrors", () => {
  expectBuildError(() => reportBody({ brand: "S", sections: [] }), "ReportPage")
  expect(() =>
    reportDocument({
      title: "t",
      core: "xyz",
      css: "",
      brand: "S",
      sections: S,
      scripts: ["", "", ""],
    }),
  ).toThrow("64 lower-case hex")
})

import { expect, test } from "bun:test"
import { fontFaceCss } from "../../../src/web/design/fonts"

test("fontFaceCssBuildsOneFaceEach", () => {
  const css = fontFaceCss([
    { family: "F One", weight: 400, base64: "QUJD" },
    { family: "F One", weight: 600, base64: "REVG" },
  ])
  expect(css.match(/@font-face/g)?.length).toBe(2)
  expect(css).toContain(`font-family:"F One"`)
  expect(css).toContain("font-weight:600")
  expect(css).toContain("url(data:font/woff2;base64,REVG)")
  expect(css).toContain("font-display:swap")
  expect(css).not.toContain("http")
})

test("fontFaceCssRefusesNonBase64AndQuotes", () => {
  expect(() =>
    fontFaceCss([{ family: "A", weight: 400, base64: "x)}body{x:y" }]),
  ).toThrow()
  expect(() =>
    fontFaceCss([{ family: `A"}`, weight: 400, base64: "QUJD" }]),
  ).toThrow()
})

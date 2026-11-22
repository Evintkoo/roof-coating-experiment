import { expect, test } from "bun:test"
import {
  attrs,
  esc,
  failState,
  linkAttrs,
  oneOf,
  safeHref,
  tag,
} from "../../../src/web/design/html"

test("escEscapesAllFive", () => {
  expect(esc(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;")
  expect(esc("plain 12.5 W m⁻²")).toBe("plain 12.5 W m⁻²")
  // a double escape would be a bug: & is escaped once, first
  expect(esc("&amp;")).toBe("&amp;amp;")
})

test("attrsEscapeValuesAndDropUndefined", () => {
  expect(attrs({ href: `x"y`, hidden: undefined, "data-a": 1 })).toBe(
    ` href="x&quot;y" data-a="1"`,
  )
  expect(attrs({ disabled: true, "aria-busy": false })).toBe(
    ` disabled aria-busy="false"`,
  )
  expect(attrs({ "aria-busy": true })).toBe(` aria-busy="true"`)
})

test("tagEscapesTextAndRefusesBadNames", () => {
  expect(tag("p", { class: "a" }, esc("<b>"))).toBe(
    `<p class="a">&lt;b&gt;</p>`,
  )
  expect(tag("br", {}, undefined)).toBe("<br>")
  expect(() => tag("p onclick=x", {}, "")).toThrow()
})

test("failStateThrowsExit4AtBuild", () => {
  try {
    failState("Button", "bogus" as never)
    throw new Error("must throw")
  } catch (e) {
    expect((e as { code?: number }).code).toBe(4)
    expect((e as { phase?: string }).phase).toBe("design.component")
    expect((e as { key?: string }).key).toBe("Button")
  }
})

test("oneOfReturnsAMemberAndThrowsOtherwise", () => {
  expect(oneOf("X", ["a", "b"] as const, "b")).toBe("b")
  for (const bad of ["c", "", undefined, 3, null, "A"])
    expect(() => oneOf("X", ["a", "b"] as const, bad)).toThrow()
})

test("safeHrefRefusesScriptAndHiddenSchemes", () => {
  for (const ok of [
    "#top",
    "/a/b",
    "./x.html",
    "report.html#limits",
    "https://example.org/a?b=c",
    "http://example.org",
    "mailto:a@b.c",
  ])
    expect(safeHref("X", ok)).toBe(ok)
  for (const bad of [
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "java\tscript:alert(1)",
    " javascript:alert(1)",
    "data:text/html,<script>",
    "vbscript:x",
    "file:///etc/passwd",
  ])
    expect(() => safeHref("X", bad), bad).toThrow()
})

test("linkAttrsOwnsExternalLinks", () => {
  expect(linkAttrs(true)).toEqual({
    target: "_blank",
    rel: "noopener noreferrer",
  })
  expect(linkAttrs(false)).toEqual({})
  expect(linkAttrs(undefined)).toEqual({})
})

import { buildError, finite, fixed, pct } from "../../../src/web/design/html"

test("buildErrorFiniteFixedAndPct", () => {
  expect(() => buildError("X", "m")).toThrow("m")
  expect(finite("X", "v", 1.5)).toBe(1.5)
  for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, "1", undefined])
    expect(() => finite("X", "v", bad)).toThrow()
  expect(fixed("X", 14.449, 1)).toBe("14.4")
  expect(fixed("X", 3, undefined)).toBe("3.00")
  expect(fixed("X", -0.001, 2)).toBe("0.00")
  expect(() => fixed("X", 1, 9)).toThrow()
  expect(() => fixed("X", 1, 1.5)).toThrow()
  expect(pct(5, 0, 10)).toBe("50")
  expect(pct(-5, 0, 10)).toBe("0")
  expect(pct(50, 0, 10)).toBe("100")
  expect(pct(1, 0, 3)).toBe("33.3333")
})

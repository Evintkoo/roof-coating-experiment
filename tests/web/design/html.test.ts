import { expect, test } from "bun:test"
import { attrs, esc, failState, tag } from "../../../src/web/design/html"

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

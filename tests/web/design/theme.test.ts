// The theme switch strings and markup (src/web/design/theme.ts): head script, toggle script, the toggle button.
import { expect, test } from "bun:test"
import {
  THEME_INIT_SCRIPT,
  THEME_KEY,
  THEME_TOGGLE_SCRIPT,
  themeToggle,
} from "../../../src/web/design/theme"
import { elementsOf } from "../../support/designComponents"

/** Runs the head script against a fake document and storage. */
function runInit(
  storage: { getItem(k: string): string | null } | "throws",
): string {
  let attr = ""
  const doc = {
    documentElement: { setAttribute: (_k: string, v: string) => (attr = v) },
  }
  const ls =
    storage === "throws"
      ? {
          getItem() {
            throw new Error("blocked")
          },
        }
      : storage
  new Function("document", "localStorage", THEME_INIT_SCRIPT)(doc, ls)
  return attr
}

test("initScriptAppliesStoredDarkAndFallsBackToLight", () => {
  expect(runInit({ getItem: (k) => (k === THEME_KEY ? "dark" : null) })).toBe(
    "dark",
  )
  expect(runInit({ getItem: () => "light" })).toBe("light")
  expect(runInit({ getItem: () => null })).toBe("light")
  expect(runInit({ getItem: () => "<script>" })).toBe("light")
  expect(runInit("throws")).toBe("light")
  expect(THEME_KEY).toBe("spandek:theme")
})

test("scriptsAreValidJavaScriptWithNoNetworkAndNoEval", () => {
  for (const s of [THEME_INIT_SCRIPT, THEME_TOGGLE_SCRIPT]) {
    expect(() => new Function(s)).not.toThrow()
    for (const bad of [
      "fetch(",
      "XMLHttpRequest",
      "eval(",
      "http:",
      "https:",
      "import(",
    ])
      expect(s).not.toContain(bad)
  }
  // the storage access is inside try/catch in both
  expect(THEME_INIT_SCRIPT).toMatch(/try\{[^}]*localStorage[^}]*\}catch/)
  expect(THEME_TOGGLE_SCRIPT).toMatch(/try\{localStorage\.setItem[^}]*\}catch/)
})

test("toggleIsAButtonNamedDarkModeWithAriaPressedAndVisibleState", async () => {
  const html = themeToggle()
  const els = await elementsOf(html)
  const b = els.find((e) => e.tag === "button")
  expect(b?.attrs.id).toBe("theme-toggle")
  expect(b?.attrs.type).toBe("button")
  expect(b?.attrs["aria-pressed"]).toBe("false")
  expect(b?.attrs.class).toContain("tv-button")
  expect(html).toContain("<span>Dark mode</span>")
  // the state text is visible but hidden from the accessible name (aria-pressed carries the state)
  expect(html).toContain('data-theme-state aria-hidden="true">Off<')
})

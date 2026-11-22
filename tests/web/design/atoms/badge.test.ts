import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { SpandekError } from "../../../../src/core/errors"
import { BADGE_TONES, badge } from "../../../../src/web/design/atoms/badge"
import { ATOM_CSS, atomsCss } from "../../../../src/web/design/css"
import { evaluatePairs, THEMES } from "../../../../src/web/design/themes"
import { repoRoot } from "../../../helpers"
import {
  elementsOf,
  literalsIn,
  TOKEN_NAMES,
  varNames,
  XSS,
} from "../../../support/designAtoms"

test("sheetEntryExistsBeforeTheCode", () => {
  const sheet = readFileSync(
    join(repoRoot, "docs/design/report-sheets.md"),
    "utf8",
  )
  expect(sheet).toContain("### R1 Badge")
  for (const k of [
    "purpose:",
    "tokens:",
    "states",
    "contract:",
    "accessibility:",
    "do:",
  ])
    expect(sheet.slice(sheet.indexOf("### R1 Badge"))).toContain(k)
  for (const tone of BADGE_TONES) expect(sheet).toContain(`\`${tone}\``)
})

test("badgeRendersEveryToneAsAnInlineLabel", async () => {
  expect([...BADGE_TONES]).toEqual([
    "proxy",
    "scenario",
    "nominal",
    "neutral",
    "go",
    "stop",
  ])
  for (const tone of BADGE_TONES) {
    const html = badge({ tone, label: "PROXY" })
    const els = await elementsOf(html)
    expect(els.map((e) => e.tag)).toEqual(["span"])
    expect(els[0]?.attrs.class).toBe(`tv-badge tv-badge--${tone}`)
    expect(els[0]?.attrs["data-tone"]).toBe(tone)
    expect(html).toContain(">PROXY</span>")
  }
})

test("badgeEscapesItsLabel_F8", async () => {
  const els = await elementsOf(badge({ tone: "proxy", label: XSS }))
  expect(els.map((e) => e.tag)).toEqual(["span"])
})

test("badgeNeedsALabelAndAKnownTone_F7", () => {
  for (const bad of [
    { tone: "info", label: "x" },
    { tone: "proxy", label: "" },
    { tone: "proxy", label: "   " },
    { tone: "", label: "x" },
  ]) {
    try {
      badge(bad as never)
      throw new Error("must throw")
    } catch (e) {
      expect(e).toBeInstanceOf(SpandekError)
      expect((e as SpandekError).code).toBe(4)
      expect((e as SpandekError).key).toBe("Badge")
    }
  }
})

test("badgeCssIsTokenOnlyAndHasEveryTone", () => {
  const css = ATOM_CSS.badge
  expect(literalsIn(css)).toEqual([])
  for (const n of varNames(css)) expect(TOKEN_NAMES.has(n), n).toBe(true)
  for (const tone of BADGE_TONES) expect(css).toContain(`.tv-badge--${tone}`)
  expect(css).toContain("14%")
  expect(css).toContain("border-radius:var(--tv-radius-pill)")
  // not interactive: no target-size rule, no cursor, no hover
  expect(css).not.toContain("target-min")
  expect(css).not.toContain(":hover")
  expect(css).toMatch(/@media print\{\.tv-badge\{background:none/)
})

test("everyBadgeInkIsContractTestedOnItsOwnBackground", () => {
  // the text token of each tone must be in the pair table against its tint (H4) or, for the outlined tones, against surfaces
  const css = ATOM_CSS.badge
  const rows = evaluatePairs({
    dark: { ...resolveDark() },
    light: { ...THEMES.light },
  })
  for (const [tone, ink, tinted] of [
    ["proxy", "status-proxy", true],
    ["go", "status-go", true],
    ["stop", "status-stop", true],
    ["scenario", "accent-secondary", false],
    ["nominal", "text-muted", false],
    ["neutral", "text-primary", false],
  ] as const) {
    const rule = new RegExp(
      `\\.tv-badge--${tone}\\{[^}]*color:var\\(--tv-${ink}\\)`,
    )
    expect(css, tone).toMatch(rule)
    const mine = rows.filter(
      (r) =>
        r.fg === ink && (tinted ? r.bg.includes("@14%") : !r.bg.includes("@")),
    )
    expect(mine.length, ink).toBeGreaterThan(0)
    for (const r of mine)
      expect(r.ratio, `${r.theme} ${r.fg} on ${r.bg}`).toBeGreaterThanOrEqual(
        4.5,
      )
  }
})
function resolveDark() {
  const contract = JSON.parse(
    readFileSync(
      join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
      "utf8",
    ),
  ) as { semantic: Record<string, { $value: string }> }
  return {
    ...Object.fromEntries(
      Object.entries(contract.semantic).map(([k, v]) => [k, v.$value]),
    ),
    ...THEMES.dark,
  }
}

test("atomsCssStillResolvesWithBadge", () => {
  expect(atomsCss()).toContain(".tv-badge")
})

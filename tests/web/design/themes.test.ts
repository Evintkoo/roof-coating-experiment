import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  contrastRatio,
  evaluatePairs,
  T_CONTRAST_LARGE,
  T_CONTRAST_TEXT,
  THEMES,
  TOKEN_PAIRS,
} from "../../../src/web/design/themes"
import { resolveTheme } from "../../../src/web/design/tokens"
import { repoRoot } from "../../helpers"

const contract = JSON.parse(
  readFileSync(
    join(repoRoot, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
const resolved = {
  dark: resolveTheme(contract, THEMES, "dark"),
  light: resolveTheme(contract, THEMES, "light"),
}

test("allPairsMeetContrastBothThemes", () => {
  expect(TOKEN_PAIRS.length).toBeGreaterThanOrEqual(144)
  const rows = evaluatePairs(resolved)
  expect(rows.length).toBe(TOKEN_PAIRS.length)
  for (const r of rows)
    expect(r.ratio).toBeGreaterThanOrEqual(
      r.kind === "text" ? T_CONTRAST_TEXT : T_CONTRAST_LARGE,
    )
  expect(new Set(rows.map((r) => r.theme))).toEqual(new Set(["dark", "light"]))
})

test("contrastMatchesKnownValues", () => {
  expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 2)
  // the contract's own stated values (instrument check, independent of the pair table)
  expect(contrastRatio("#ff683b", "#0b1020")).toBeCloseTo(6.58, 1)
  expect(Math.abs(contrastRatio("#ff683b", "#0b1020") - 6.58)).toBeLessThan(
    0.01,
  )
  expect(contrastRatio("#f7f8fa", "#0b1020")).toBeCloseTo(17.82, 1)
  expect(contrastRatio("#22d3c5", "#0b1020")).toBeCloseTo(10.09, 1)
  expect(contrastRatio("#ff855f", "#0b1020")).toBeCloseTo(7.91, 1)
  // alpha is blended over the background first: 72 % warm white over midnight is #b5b7bd at 9.44
  expect(contrastRatio("rgba(247, 248, 250, 0.72)", "#0b1020")).toBeCloseTo(
    9.44,
    1,
  )
  expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 2)
  expect(contrastRatio("#777777", "#777777")).toBeCloseTo(1, 5)
})

test("pairTableMatchesTheIndependentSpikeTable", () => {
  // docs/spikes/plan-06/q3-contrast.json was computed by a separate implementation (lib/colour.ts)
  const spike = JSON.parse(
    readFileSync(
      join(repoRoot, "docs/spikes/plan-06/q3-contrast.json"),
      "utf8",
    ),
  ) as { pairs: { theme: string; fg: string; bg: string; ratio: number }[] }
  expect(spike.pairs.length).toBe(144)
  const rows = evaluatePairs(resolved)
  for (const s of spike.pairs) {
    const r = rows.find(
      (x) => x.theme === s.theme && x.fg === s.fg && x.bg === s.bg,
    )
    expect(r, `${s.theme} ${s.fg} on ${s.bg}`).toBeDefined()
    expect(Math.abs((r?.ratio ?? 0) - s.ratio)).toBeLessThanOrEqual(0.011)
  }
})

test("theGateCanFail", () => {
  const bad = {
    ...resolved,
    light: { ...resolved.light, "text-muted": "rgba(11, 16, 32, 0.30)" },
  }
  const failing = evaluatePairs(bad).filter(
    (r) => r.ratio < (r.kind === "text" ? T_CONTRAST_TEXT : T_CONTRAST_LARGE),
  )
  expect(failing.length).toBeGreaterThan(0)
  expect(
    failing.every((r) => r.fg === "text-muted" && r.theme === "light"),
  ).toBe(true)
})

test("lightThemeCarriesEveryContractSemanticToken", () => {
  for (const k of Object.keys(contract.semantic))
    expect(resolved.light[k], k).toBeDefined()
  for (const k of Object.keys(resolved.dark))
    expect(resolved.light[k], `light lacks ${k}`).toBeDefined()
})

test("datavizPaletteIsPresentInBothThemes", () => {
  for (const t of ["dark", "light"] as const) {
    for (const k of [
      "viz-1",
      "viz-6",
      "viz-baseline",
      "viz-recommended",
      "viz-seq-1",
      "viz-seq-7",
      "viz-div-1",
      "viz-div-7",
    ])
      expect(resolved[t][k], `${t} ${k}`).toMatch(/^#[0-9a-f]{6}$/)
  }
  // frozen values from the Q4 spike
  expect(resolved.light["viz-3"]).toBe("#2a78d6")
  expect(resolved.dark["viz-3"]).toBe("#3987e5")
  expect(resolved.light["viz-baseline"]).toBe("#5e636f")
})

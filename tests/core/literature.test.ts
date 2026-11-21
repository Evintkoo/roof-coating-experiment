import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { DataError } from "../../src/core/errors"
import {
  assembleTio2Nk,
  convertG173,
  convertRiiNk,
  nkAt,
  parseG173,
  parseNk,
} from "../../src/core/literature"
import { repoRoot } from "../helpers"

const lit = (name: string) =>
  readFileSync(join(repoRoot, "data", "literature", name), "utf8")

const f64 = (...a: number[]) => Float64Array.from(a)

function codeOf(fn: () => unknown): number | undefined {
  try {
    fn()
  } catch (e) {
    return e instanceof DataError ? e.code : -1
  }
  return undefined
}

test("negativeKIsDataError", () => {
  expect(codeOf(() => parseNk("wl_um,n,k\n0.4,1.5,0\n0.5,1.5,-0.1\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n,k\n0.4,0,0\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n,k\n0.5,1.5,0\n0.4,1.5,0\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n,k\n0.4,1.5,0\n0.4,1.5,0\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n,k\n0.4,1.5,abc\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n\n0.4,1.5\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n,k\n"))).toBe(5)
  expect(codeOf(() => parseNk("wl_um,n,k\n0.4,1.5,0\n0.5,1.6,0.01\n"))).toBe(
    undefined,
  )
})

test("parseG173RejectsBadInput", () => {
  expect(codeOf(() => parseG173("wl_um,irradiance_w_m2_um\n0.3,-1\n"))).toBe(5)
  expect(
    codeOf(() => parseG173("wl_um,irradiance_w_m2_um\n0.4,1\n0.3,1\n")),
  ).toBe(5)
  expect(codeOf(() => parseG173("wl_um,irradiance_w_m2_um\n"))).toBe(5)
})

test("nkAtInterpolatesAndClamps", () => {
  const t = parseNk("wl_um,n,k\n0.4,1.0,0.0\n0.6,2.0,0.2\n1.0,3.0,0.2\n")
  const r = nkAt(t, f64(0.3, 0.4, 0.5, 0.6, 0.8, 1.0, 2.0))
  expect(Array.from(r.n)).toEqual([1.0, 1.0, 1.5, 2.0, 2.5, 3.0, 3.0])
  const k = Array.from(r.k)
  const want = [0, 0, 0.1, 0.2, 0.2, 0.2, 0.2]
  for (let i = 0; i < want.length; i++)
    expect(k[i]).toBeCloseTo(want[i] as number, 12)
})

test("g173IntegralIs1000p37", () => {
  const s = parseG173(lit("g173_global_tilt.csv"))
  expect(s.wl_um.length).toBe(2002)
  let sum = 0
  for (let i = 0; i + 1 < s.wl_um.length; i++)
    sum +=
      ((s.wl_um[i + 1] as number) - (s.wl_um[i] as number)) *
      (((s.irradiance_w_m2_um[i] as number) +
        (s.irradiance_w_m2_um[i + 1] as number)) /
        2)
  expect(Math.abs(sum - 1000.37)).toBeLessThan(0.005)
})

test("convertG173ConvertsUnits", () => {
  const raw =
    "ASTM G173-03 Reference Spectra Derived from SMARTS v. 2.9.2\n" +
    "Wvlgth nm,Etr W*m-2*nm-1,Global tilt  W*m-2*nm-1,Direct+circumsolar W*m-2*nm-1\n" +
    "280,1.0,0.5,0.25\n300,2.0,1.5,1.0\n"
  const s = parseG173(convertG173(raw))
  expect(Array.from(s.wl_um)).toEqual([0.28, 0.3])
  expect(Array.from(s.irradiance_w_m2_um)).toEqual([500, 1500])
  expect(codeOf(() => convertG173("x\ny\n"))).toBe(5)
  expect(codeOf(() => convertG173(""))).toBe(5)
})

const RII = (kind: "n" | "nk", rows: string) =>
  `REFERENCES: "x"\nDATA:\n  - type: tabulated ${kind}\n    data: |\n${rows}\nPROPERTIES:\n  conditions: {}\n`

test("convertRiiNkReadsTabulated", () => {
  const nk = parseNk(
    convertRiiNk(
      RII("nk", "      0.30 2.0 0.5\n      0.40 2.5 0.1\n      0.60 2.4 0.0"),
      { minWl: 0.35, maxWl: 0.7 },
    ),
  )
  expect(Array.from(nk.wl_um)).toEqual([0.4, 0.6])
  expect(Array.from(nk.k)).toEqual([0.1, 0])
  const n = parseNk(convertRiiNk(RII("n", "      0.45 2.8\n      0.5 2.7"), {}))
  expect(Array.from(n.k)).toEqual([0, 0])
  expect(codeOf(() => convertRiiNk("no table here", {}))).toBe(5)
})

// R2: TiO2 table = Siefke film n,k below 0.45 um, mean of Bond o/e n with k = 0 from 0.45 um.
test("tio2TableAssemblyRuleR2", () => {
  const siefke = parseNk(
    "wl_um,n,k\n0.30,3.3,0.9\n0.40,3.0,0.5\n0.44,2.8,0.3\n0.45,2.7,0.2\n0.50,2.6,0.1\n",
  )
  const bondO = parseNk("wl_um,n,k\n0.45,2.8,0\n0.60,2.6,0\n")
  const bondE = parseNk("wl_um,n,k\n0.45,3.2,0\n0.60,3.0,0\n")
  const t = assembleTio2Nk(siefke, bondO, bondE)
  expect(Array.from(t.wl_um)).toEqual([0.3, 0.4, 0.44, 0.45, 0.6])
  // below 0.45: Siefke n and k untouched
  expect(Array.from(t.n.slice(0, 3))).toEqual([3.3, 3.0, 2.8])
  expect(Array.from(t.k.slice(0, 3))).toEqual([0.9, 0.5, 0.3])
  // from 0.45: mean of ordinary and extraordinary n, k exactly 0
  expect(t.n[3]).toBeCloseTo(3.0, 12)
  expect(t.n[4]).toBeCloseTo(2.8, 12)
  expect(Array.from(t.k.slice(3))).toEqual([0, 0])
  // Bond grids must agree
  const badE = parseNk("wl_um,n,k\n0.45,3.2,0\n0.70,3.0,0\n")
  expect(codeOf(() => assembleTio2Nk(siefke, bondO, badE))).toBe(5)
  // Siefke must reach below 0.45 um
  const high = parseNk("wl_um,n,k\n0.5,2.6,0.1\n")
  expect(codeOf(() => assembleTio2Nk(high, bondO, bondE))).toBe(5)
})

test("committedTio2TableFollowsR2", () => {
  const t = parseNk(lit("tio2_nk.csv"))
  const bo = parseNk(lit("tio2_rutile_bond_o.csv"))
  const be = parseNk(lit("tio2_rutile_bond_e.csv"))
  const i = t.wl_um.findIndex((w) => w >= 0.45)
  expect(t.wl_um[i]).toBeCloseTo(0.45, 9)
  for (let j = i; j < t.wl_um.length; j++) expect(t.k[j]).toBe(0)
  expect(t.n[i]).toBeCloseTo(((bo.n[0] as number) + (be.n[0] as number)) / 2, 5)
  expect(t.k[0] as number).toBeGreaterThan(0)
  expect(t.wl_um[0] as number).toBeLessThan(0.31)
})

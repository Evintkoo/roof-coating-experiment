import { beforeAll, expect, test } from "bun:test"
import fc from "fast-check"
import {
  allocateRays,
  BandsError,
  bandSplit,
  isReflectedRay,
  rayQuota,
} from "../../../src/core/anim/bands"
import { solarWeighted } from "../../../src/core/models/optics"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { liveSimulate } from "../../../src/core/pipeline/live"
import { LIVE_SEED } from "../../../src/web/liveState"
import { testCtx } from "../../support/dayData"
import { twelveSettings } from "../../support/liveSettings"

// Frozen from the plan 09 spike (docs/spikes/plan-09.md), never edited.
const T_BAND_TOL = 1e-9
let ctx: ModelContext
beforeAll(async () => {
  ctx = await testCtx()
})

test("bandSharesSumToOneH5", () => {
  for (const inp of twelveSettings(ctx)) {
    const r = liveSimulate(inp, ctx, 2, LIVE_SEED)
    const b = bandSplit(ctx.wlUm, r.spectrum.nominal, ctx.g173)
    expect(b.map((x) => x.id)).toEqual(["uv", "visible", "nir"])
    expect(b.reduce((s, x) => s + x.share, 0)).toBeCloseTo(1, 12)
    for (const x of b) {
      expect(x.share).toBeGreaterThan(0)
      expect(x.reflected).toBeGreaterThanOrEqual(0)
      expect(x.reflected).toBeLessThanOrEqual(1)
    }
  }
})

test("bandWeightedEqualsSolarWeightedH5", () => {
  for (const inp of twelveSettings(ctx)) {
    const r = liveSimulate(inp, ctx, 2, LIVE_SEED)
    const b = bandSplit(ctx.wlUm, r.spectrum.nominal, ctx.g173)
    const sum = b.reduce((s, x) => s + x.share * x.reflected, 0)
    expect(
      Math.abs(sum - solarWeighted(ctx.wlUm, r.spectrum.nominal, ctx.g173)),
    ).toBeLessThan(T_BAND_TOL)
    expect(Math.abs(sum - r.nominal.r_solar)).toBeLessThan(T_BAND_TOL)
  }
})

test("flatRGivesFlatFractionH6", () => {
  const b = bandSplit(
    ctx.wlUm,
    new Float64Array(ctx.wlUm.length).fill(0.5),
    ctx.g173,
  )
  for (const x of b) expect(x.reflected).toBeCloseTo(0.5, 12)
})

test("raysFollowTheSpectrumNotAConstantH6", () => {
  // Thicker midcoat: the model says the NIR reflectance and r_solar move together; the NIR band's reflected fraction follows R.
  const base = twelveSettings(ctx)[0] as ReturnType<
    typeof twelveSettings
  >[number]
  const at = (d: number) => {
    const r = liveSimulate(
      { ...base, design: { ...base.design, midcoat_dft_um: d } },
      ctx,
      2,
      LIVE_SEED,
    )
    const nir = (
      bandSplit(ctx.wlUm, r.spectrum.nominal, ctx.g173)[2] as {
        reflected: number
      }
    ).reflected
    return { nir, rs: r.nominal.r_solar }
  }
  const thin = at(ctx.ranges.midcoat_dft_um.min)
  const thick = at(ctx.ranges.midcoat_dft_um.max)
  expect(Math.sign(thick.nir - thin.nir)).toBe(Math.sign(thick.rs - thin.rs))
  expect(Math.abs(thick.nir - thin.nir)).toBeGreaterThan(1e-4)
})

test("rayQuotaWithinOneRayH5", () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 400 }),
      fc.double({ min: 0, max: 1, noNaN: true }),
      (n, r) => {
        const q = rayQuota(
          { id: "nir", lo_um: 0.7, hi_um: 4, share: 0.5, reflected: r },
          n,
        )
        expect(q.reflected + q.absorbed).toBe(n)
        expect(Math.abs(q.reflected - n * r)).toBeLessThanOrEqual(0.5 + 1e-9)
        // the deterministic low-discrepancy order marks exactly that many rays, spread evenly
        let marked = 0
        for (let i = 0; i < n; i++)
          if (isReflectedRay(i, n, q.reflected)) marked++
        expect(marked).toBe(q.reflected)
      },
    ),
  )
})

test("allocateRaysSumsToTheTotalWithinOneRayH5", () => {
  const r = liveSimulate(
    twelveSettings(ctx)[0] as ReturnType<typeof twelveSettings>[number],
    ctx,
    2,
    LIVE_SEED,
  )
  const b = bandSplit(ctx.wlUm, r.spectrum.nominal, ctx.g173)
  for (const n of [30, 150, 151]) {
    const a = allocateRays(b, n)
    expect(a.reduce((s, x) => s + x, 0)).toBe(n)
    a.forEach((c, i) =>
      expect(Math.abs(c - n * (b[i] as { share: number }).share)).toBeLessThan(
        1,
      ),
    )
  }
})

test("rejectsUnequalGridsF2", () => {
  const err = (() => {
    try {
      bandSplit(
        ctx.wlUm,
        new Float64Array(ctx.wlUm.length - 1).fill(0.5),
        ctx.g173,
      )
    } catch (e) {
      return e
    }
  })()
  expect(err).toBeInstanceOf(BandsError)
  expect((err as BandsError).code).toBe(4)
  expect((err as BandsError).phase).toBe("physics")
})

test("noScatterElementIsExposedH9", async () => {
  // Q3: the scattering visual is dropped; the module exports no scatter function (the visual would have no model source).
  const m = await import("../../../src/core/anim/bands")
  expect(Object.keys(m).some((k) => /scatter/i.test(k))).toBe(false)
})

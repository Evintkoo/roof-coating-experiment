import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import type { ModelContext } from "../../../src/core/pipeline/context"
import {
  contextFromJson,
  contextToJson,
} from "../../../src/core/pipeline/contextJson"
import { loadContext } from "../../../src/node/context"
import { repoRoot } from "../../helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

test("contextRoundTripExact", () => {
  const back = contextFromJson(contextToJson(ctx))
  expect(back).toEqual(ctx)
  for (const [a, b] of [
    [back.wlUm, ctx.wlUm],
    [back.g173.wl_um, ctx.g173.wl_um],
    [back.g173.irradiance_w_m2_um, ctx.g173.irradiance_w_m2_um],
    [back.tio2.n, ctx.tio2.n],
    [back.tio2.k, ctx.tio2.k],
    [back.baso4.wl_um, ctx.baso4.wl_um],
  ] as const) {
    expect(a).toBeInstanceOf(Float64Array)
    expect(Array.from(a)).toEqual(Array.from(b))
  }
})

test("contextJsonIsDeterministic", () => {
  const a = contextToJson(ctx)
  expect(contextToJson(structuredClone(ctx))).toBe(a)
  // keys are sorted at every level
  const top = Object.keys(JSON.parse(a))
  expect(top).toEqual([...top].sort())
})

test("badContextJsonIsCode5", () => {
  const code = (f: () => unknown) => {
    try {
      f()
    } catch (e) {
      return (e as { code: number }).code
    }
    return 0
  }
  expect(code(() => contextFromJson("{"))).toBe(5)
  expect(code(() => contextFromJson("[]"))).toBe(5)
  expect(code(() => contextFromJson("{}"))).toBe(5)
  expect(
    code(() => contextToJson({ ...ctx, wlUm: Float64Array.of(Number.NaN) })),
  ).toBe(5)
})

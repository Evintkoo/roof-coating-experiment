import { expect, test } from "bun:test"
import fc from "fast-check"
import { mergeOrdered, screeningTasks } from "../../../src/core/anim/screening"
import { shuffleInPlace, Xoshiro128 } from "../../../src/core/rng"

test("screeningTasksCoverEveryCellOnceInRowMajorOrder", () => {
  const tasks = screeningTasks(96, 9)
  expect(tasks.length).toBe(864)
  expect(tasks.map((x) => x.index)).toEqual(
    Array.from({ length: 864 }, (_, i) => i),
  )
  expect(new Set(tasks.map((x) => `${x.candidate}:${x.scenario}`)).size).toBe(
    864,
  )
  expect(tasks[10]).toEqual({ index: 10, candidate: 1, scenario: 1 })
})

test("screeningTasksRejectBadSizes", () => {
  expect(() => screeningTasks(-1, 9)).toThrow()
  expect(() => screeningTasks(1.5, 9)).toThrow()
  expect(screeningTasks(0, 9)).toEqual([])
})

test("mergeIsOrderIndependent", () => {
  const tasks = screeningTasks(8, 9)
  const parts = tasks.map((t) => ({ index: t.index, value: `v${t.index * 7}` }))
  const base = mergeOrdered(parts, tasks.length)
  expect(base[5]).toBe("v35")
  for (const seed of [1, 2, 3]) {
    const p = [...parts]
    shuffleInPlace(new Xoshiro128(seed), p)
    expect(mergeOrdered(p, tasks.length)).toEqual(base)
  }
})

test("mergeIsOrderIndependentForAnyPermutation", () => {
  fc.assert(
    fc.property(
      fc.shuffledSubarray([...Array(20).keys()], { minLength: 20 }),
      (order) => {
        const out = mergeOrdered(
          order.map((i) => ({ index: i, value: i * 2 })),
          20,
        )
        expect(out).toEqual(Array.from({ length: 20 }, (_, i) => i * 2))
      },
    ),
  )
})

test("mergeRejectsMissingAndDuplicate", () => {
  expect(() => mergeOrdered([{ index: 0, value: 1 }], 2)).toThrow()
  expect(() =>
    mergeOrdered(
      [
        { index: 0, value: 1 },
        { index: 0, value: 2 },
      ],
      2,
    ),
  ).toThrow()
  expect(() => mergeOrdered([{ index: 2, value: 1 }], 2)).toThrow()
  expect(() => mergeOrdered([{ index: -1, value: 1 }], 1)).toThrow()
})

// ---- Task 4 (plan 07): the screening evaluator and its page data ----
import { beforeAll } from "bun:test"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import {
  buildScreeningData,
  designsOf,
  SCREEN_DRAWS,
  screenChunk,
} from "../../../src/core/anim/screening"
import { weatherL9 } from "../../../src/core/design"
import type { ModelContext } from "../../../src/core/pipeline/context"
import { parseResultsCsv, type ResultRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"
import { REPORT_FIXTURE, repoRoot } from "../../helpers"

let ctx: ModelContext
let rows: ResultRow[]
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  rows = parseResultsCsv(
    readFileSync(join(REPORT_FIXTURE, "results.csv"), "utf8"),
  )
})

test("screeningEqualsBatchNominalIn1e9", () => {
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  expect(data.nominal.length).toBe(864)
  const designs = designsOf(data)
  const tasks = screeningTasks(designs.length, data.scenarios.length)
  const got = screenChunk(ctx, designs, data.scenarios, tasks, null)
  expect(got.length).toBe(864)
  let compared = 0
  let max = 0
  for (const g of got) {
    const r = rows[g.index] as ResultRow
    for (const [a, b] of [
      [g.value[0], r.r_solar_pred],
      [g.value[1], r.t_max_pred],
      [g.value[2], r.q_in_mean_w_m2],
    ] as const) {
      max = Math.max(max, Math.abs(a - b))
      compared++
    }
  }
  expect(compared).toBe(2592)
  expect(max).toBeLessThan(1e-9)
}, 60000)

test("pageDataIsTheBatchNominalColumnsInRowOrder", () => {
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  expect(data.candidates.length).toBe(96)
  expect(data.scenarios.map((s) => s.scenario_id)).toEqual(
    Array.from({ length: 9 }, (_, i) => `W${i + 1}`),
  )
  const r = rows[10] as ResultRow
  expect(data.nominal[10]).toEqual([
    r.r_solar_pred,
    r.t_max_pred,
    r.q_in_mean_w_m2,
  ])
})

test("pageDataRefusesRowsOutOfOrderOrWithUnknownScenario", () => {
  const sc = weatherL9(ctx.weather)
  expect(() => buildScreeningData([...rows].reverse(), sc)).toThrow()
  expect(() => buildScreeningData(rows.slice(1), sc)).toThrow()
  expect(() => buildScreeningData(rows, sc.slice(0, 8))).toThrow()
})

test("drawsBandContainsNominalAndIsDeterministic", () => {
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  const designs = designsOf(data).slice(0, 2)
  const tasks = screeningTasks(2, 9)
  const mats = SCREEN_DRAWS
  const a = screenChunk(ctx, designs, data.scenarios, tasks, mats)
  const b = screenChunk(ctx, designs, data.scenarios, tasks, mats)
  expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  const nominalOnly = screenChunk(ctx, designs, data.scenarios, tasks, null)
  for (const [i, g] of a.entries()) {
    const v = g.value
    expect(v.length).toBe(5)
    // the nominal part is identical with and without draws
    expect([...v].slice(0, 3)).toEqual([
      ...(nominalOnly[i] as (typeof nominalOnly)[number]).value,
    ])
    expect(v[3] as number).toBeLessThanOrEqual(v[1])
    expect(v[4] as number).toBeGreaterThanOrEqual(v[1])
  }
  expect(
    a.some((g) => (g.value[4] as number) - (g.value[3] as number) > 1e-6),
  ).toBe(true)
}, 60000)

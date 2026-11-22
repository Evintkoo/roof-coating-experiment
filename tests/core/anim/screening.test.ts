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

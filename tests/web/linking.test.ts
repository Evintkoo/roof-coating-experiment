import { expect, test } from "bun:test"
import fc from "fast-check"
import { OBJECTIVE_COLUMNS, type ObjRow } from "../../src/core/pipeline/tables"
import { axisLabel, figParcoords } from "../../src/web/figures"
import {
  applyBrush,
  emptyBrush,
  normaliseRanges,
  readBrush,
  selectByRanges,
} from "../../src/web/linking"

const rowOf = (i: number, v: number[]): ObjRow => ({
  candidate_id: `SP-${String(i + 1).padStart(3, "0")}`,
  r_solar_pred: v[0] as number,
  t_max_pred: v[1] as number,
  corrosion_proxy: v[2] as number,
  delam_proxy: v[3] as number,
  cost_proxy: v[4] as number,
  t_max_worst: 50,
  on_front: false,
  pareto_freq: 0.5,
  role: "",
})

test("normaliseRangesHandlesAllThreeShapes", () => {
  expect(normaliseRanges(undefined)).toEqual([])
  expect(normaliseRanges(null)).toEqual([])
  expect(normaliseRanges([0.2, 0.5])).toEqual([[0.2, 0.5]])
  expect(
    normaliseRanges([
      [0.1, 0.2],
      [0.6, 0.9],
    ]),
  ).toEqual([
    [0.1, 0.2],
    [0.6, 0.9],
  ])
  expect(normaliseRanges([[0.3, 0.4]])).toEqual([[0.3, 0.4]])
  expect(normaliseRanges([0.5, 0.2])).toEqual([[0.2, 0.5]])
  for (const bad of [
    "x",
    3,
    [1],
    [1, 2, 3],
    [[1]],
    [["a", "b"]],
    [Number.NaN, 1],
    {},
  ])
    expect(() => normaliseRanges(bad)).toThrow()
})

test("selectByRangesMatchesPlainFilter", () => {
  const val = fc.double({ min: 0, max: 1, noNaN: true })
  const range = fc
    .tuple(val, val)
    .map(([a, b]) => [Math.min(a, b), Math.max(a, b)] as [number, number])
  const rows = fc.array(fc.array(val, { minLength: 5, maxLength: 5 }), {
    maxLength: 40,
  })
  const ranges = fc.dictionary(
    fc.constantFrom(...OBJECTIVE_COLUMNS),
    fc.array(range, { maxLength: 3 }),
  )
  fc.assert(
    fc.property(rows, ranges, (vs, rg) => {
      const data = vs.map((v, i) => rowOf(i, v))
      // the oracle: written independently, axis by axis
      const expected = new Set<string>()
      for (const r of data) {
        let ok = true
        for (const col of OBJECTIVE_COLUMNS) {
          const rs = rg[col] ?? []
          if (rs.length === 0) continue
          const x = r[col]
          let any = false
          for (const [lo, hi] of rs) if (lo <= x && x <= hi) any = true
          if (!any) ok = false
        }
        if (ok) expected.add(r.candidate_id)
      }
      expect(selectByRanges(data, rg)).toEqual(expected)
    }),
    { numRuns: 300 },
  )
})

test("selectionSemantics", () => {
  const data = [
    rowOf(0, [0.1, 30, 0.2, 0.2, 0.2]),
    rowOf(1, [0.9, 60, 0.8, 0.8, 0.8]),
  ]
  // AND across axes (an OR would select both here)
  expect([
    ...selectByRanges(data, {
      r_solar_pred: [[0, 0.2]],
      t_max_pred: [[50, 70]],
    }),
  ]).toEqual([])
  // OR across ranges on one axis, inclusive bounds
  expect(
    selectByRanges(data, {
      r_solar_pred: [
        [0.1, 0.1],
        [0.9, 0.9],
      ],
    }).size,
  ).toBe(2)
  // no ranges: everything; an empty list on an axis does not constrain
  expect(selectByRanges(data, {}).size).toBe(2)
  expect(selectByRanges(data, { t_max_pred: [] }).size).toBe(2)
})

test("emptySelectionIsEmptySet", () => {
  expect(selectByRanges([], { r_solar_pred: [[0, 1]] })).toEqual(new Set())
  expect(selectByRanges([], {})).toEqual(new Set())
  const data = [rowOf(0, [0.5, 40, 0.5, 0.5, 0.5])]
  const none = selectByRanges(data, { r_solar_pred: [[0.9, 1]] })
  expect(none.size).toBe(0)
  expect(none).toBeInstanceOf(Set)
})

test("brushIsReadByLabelAndReinjectedBeforeReact", () => {
  const rows = [0, 1, 2].map((i) => rowOf(i, [0.1 * i, 30 + i, 0.1, 0.1, 0.1]))
  const spec = figParcoords(rows, {})
  const specBefore = JSON.stringify(spec)
  // user brushes axis 1 (one range) and axis 3 (two ranges), then drags axis 0 to the end
  const dims = (spec.data[0] as { dimensions: Record<string, unknown>[] })
    .dimensions
  const live = structuredClone(dims)
  ;(live[1] as Record<string, unknown>).constraintrange = [31, 32]
  ;(live[3] as Record<string, unknown>).constraintrange = [
    [0, 0.1],
    [0.5, 0.6],
  ]
  const moved = [...live.slice(1), live[0] as Record<string, unknown>]
  const brush = readBrush(moved)
  expect(brush.ranges).toEqual({
    t_max_pred: [[31, 32]],
    delam_proxy: [
      [0, 0.1],
      [0.5, 0.6],
    ],
  })
  expect(brush.order).toEqual([
    ...OBJECTIVE_COLUMNS.slice(1),
    OBJECTIVE_COLUMNS[0],
  ])
  // a fresh spec (what Plotly.react receives) carries no brush; applyBrush puts it back and keeps the order
  const fresh = figParcoords(rows, {})
  const applied = applyBrush(fresh, brush)
  const out = (
    applied.data[0] as {
      dimensions: { label: string; constraintrange?: unknown }[]
    }
  ).dimensions
  expect(out.map((d) => d.label)).toEqual(brush.order.map(axisLabel))
  expect(
    out.find((d) => d.label === axisLabel("t_max_pred"))?.constraintrange,
  ).toEqual([31, 32])
  expect(
    out.find((d) => d.label === axisLabel("delam_proxy"))?.constraintrange,
  ).toEqual([
    [0, 0.1],
    [0.5, 0.6],
  ])
  expect(
    out.find((d) => d.label === axisLabel("cost_proxy"))?.constraintrange,
  ).toBeUndefined()
  // the input spec is not mutated, and an empty brush removes ranges
  expect(JSON.stringify(fresh)).toBe(specBefore)
  const cleared = applyBrush(applied, emptyBrush())
  expect(
    (
      cleared.data[0] as { dimensions: { constraintrange?: unknown }[] }
    ).dimensions.every((d) => d.constraintrange === undefined),
  ).toBe(true)
  // read -> apply -> read is the identity
  expect(
    readBrush(
      (applied.data[0] as { dimensions: { label: string }[] }).dimensions,
    ),
  ).toEqual(brush)
})

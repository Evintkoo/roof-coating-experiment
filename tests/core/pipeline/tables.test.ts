import { expect, test } from "bun:test"
import { parseCsv, toCsv } from "../../../src/core/csv"
import { ConfigError, DataError } from "../../../src/core/errors"
import {
  CONTROL_COLUMNS,
  CONTROL_NAN_COLUMNS,
  DRAW_COLUMNS,
  type DrawRow,
  PARETO_COLUMNS,
  type ParetoRow,
  parseControlsCsv,
  parseDrawsCsv,
  parseParetoCsv,
  parseSensCsv,
  SENS_COLUMNS,
  shortlistFromPareto,
  validateControls,
  validateCurves,
  validateDraws,
  validatePareto,
  validateSens,
  validateSpectra,
} from "../../../src/core/pipeline/tables"

const pareto = (): ParetoRow => ({
  candidate_id: "SP-001",
  r_solar_pred: 0.8,
  t_max_pred: 60,
  corrosion_proxy: 0.2,
  delam_proxy: 0.3,
  cost_proxy: 0.5,
  t_max_worst: 70,
  on_front: true,
  pareto_freq: 0.5,
  role: "",
})
const control = () => ({
  control_id: "C1",
  for_candidate: "-",
  scenario_id: "W1",
  r_solar_pred: 0.9,
  t_max_pred: 55,
  q_in_mean_w_m2: 10,
  corrosion_proxy: Number.NaN,
  wetting_proxy: Number.NaN,
  wetting_theta_pred: Number.NaN,
  delam_proxy: Number.NaN,
  cost_proxy: Number.NaN,
  gel_time_rel: Number.NaN,
  unmodelled:
    "corrosion_proxy;wetting_proxy;wetting_theta_pred;delam_proxy;cost_proxy;gel_time_rel",
})
const draw = (): DrawRow => ({
  draw: 0,
  candidate_id: "SP-001",
  r_solar_pred: 0.8,
  t_max_pred: 60,
  corrosion_proxy: 0.2,
  delam_proxy: 0.3,
  cost_proxy: 0.5,
})
const fails = (f: () => unknown, key?: string) => {
  try {
    f()
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    if (key) expect((e as ConfigError).key).toBe(key)
    return
  }
  throw new Error("expected ConfigError")
}

test("paretoRowValidates", () => {
  expect(validatePareto([pareto()])[0]).toEqual(pareto())
  expect(PARETO_COLUMNS).toEqual([
    "candidate_id",
    "r_solar_pred",
    "t_max_pred",
    "corrosion_proxy",
    "delam_proxy",
    "cost_proxy",
    "t_max_worst",
    "on_front",
    "pareto_freq",
    "role",
  ])
  fails(
    () => validatePareto([{ ...pareto(), pareto_freq: 1.2 }]),
    "pareto_freq",
  )
  fails(() => validatePareto([{ ...pareto(), role: "boss" }]), "role")
  fails(() => validatePareto([{ ...pareto(), cost_proxy: Number.NaN }]))
  fails(() => validatePareto([{ ...pareto(), extra: 1 }]), "extra")
  fails(() => validatePareto([{ ...pareto(), on_front: "yes" }]), "on_front")
})

test("controlRowAllowsNaNOnlyInUnmodelledColumns", () => {
  expect(validateControls([control()]).length).toBe(1)
  // NaN in a thermal column is never allowed
  fails(
    () => validateControls([{ ...control(), t_max_pred: Number.NaN }]),
    "t_max_pred",
  )
  // NaN outside the listed unmodelled columns is rejected
  fails(
    () => validateControls([{ ...control(), unmodelled: "gel_time_rel" }]),
    "corrosion_proxy",
  )
  // a C2-like row: everything modelled except gel is present, no NaN
  const full = {
    ...control(),
    control_id: "C4x",
    corrosion_proxy: 0.1,
    wetting_proxy: 0.5,
    wetting_theta_pred: 90,
    delam_proxy: 0.2,
    cost_proxy: 0.4,
    gel_time_rel: 1,
    unmodelled: "",
  }
  expect(validateControls([full]).length).toBe(1)
  // a listed column that is not NaN is rejected
  fails(
    () => validateControls([{ ...full, unmodelled: "corrosion_proxy" }]),
    "unmodelled",
  )
  // the CSV round trip: empty cell only in the declared columns
  const csv = toCsv(CONTROL_COLUMNS, [control()], {
    nanColumns: CONTROL_NAN_COLUMNS,
  })
  expect(parseCsv(csv)[0]?.corrosion_proxy).toBe("")
  expect(() =>
    toCsv(CONTROL_COLUMNS, [{ ...control(), t_max_pred: Number.NaN }], {
      nanColumns: CONTROL_NAN_COLUMNS,
    }),
  ).toThrow()
  expect(CONTROL_NAN_COLUMNS.has("t_max_pred")).toBe(false)
})

test("drawRowValidates", () => {
  expect(DRAW_COLUMNS).toEqual([
    "draw",
    "candidate_id",
    "r_solar_pred",
    "t_max_pred",
    "corrosion_proxy",
    "delam_proxy",
    "cost_proxy",
  ])
  expect(validateDraws([draw()])[0]).toEqual(draw())
  fails(() => validateDraws([{ ...draw(), draw: -1 }]), "draw")
  fails(() => validateDraws([{ ...draw(), draw: 1.5 }]), "draw")
  fails(
    () => validateDraws([{ ...draw(), t_max_pred: Number.NaN }]),
    "t_max_pred",
  )
  fails(() => validateDraws([{ ...draw(), candidate_id: "x" }]), "candidate_id")
  const csv = toCsv(DRAW_COLUMNS, [draw(), { ...draw(), draw: 1 }])
  expect(parseDrawsCsv(csv)).toEqual([draw(), { ...draw(), draw: 1 }])
  fails(() => parseDrawsCsv(csv.replace("0.8", "")))
})

test("sensRowHasIndexField", () => {
  expect(SENS_COLUMNS).toEqual([
    "output",
    "method",
    "variable",
    "index",
    "value",
    "conf",
  ])
  for (const index of ["S1", "ST", "mu_star", "sigma"]) {
    const method = index === "S1" || index === "ST" ? "sobol" : "morris"
    const r = validateSens([
      { output: "t_max_c", method, variable: "P1", index, value: 0.1, conf: 0 },
    ])
    expect(r[0]?.index as string).toBe(index)
  }
  fails(
    () =>
      validateSens([
        {
          output: "t_max_c",
          method: "sobol",
          variable: "P1",
          index: "mu_star",
          value: 0,
          conf: 0,
        },
      ]),
    "index",
  )
  fails(
    () =>
      validateSens([
        {
          output: "t_max_c",
          method: "sobol",
          variable: "P1",
          index: "S9",
          value: 0,
          conf: 0,
        },
      ]),
    "index",
  )
})

test("curvesAndSpectraValidators", () => {
  const curves = {
    time_s: [0, 600],
    n_mc: 4,
    series: [
      {
        id: "SP-001",
        kind: "candidate",
        scenario_id: "W1",
        nominal_only: false,
        t_c: [30, 40],
        t_lo_c: [29, 38],
        t_hi_c: [31, 42],
      },
      {
        id: "C0",
        kind: "control",
        scenario_id: "W1",
        nominal_only: true,
        t_c: [30, 50],
      },
    ],
  }
  expect(validateCurves(curves).series.length).toBe(2)
  fails(() =>
    validateCurves({
      ...curves,
      series: [{ ...curves.series[0], t_lo_c: [35, 38] }],
    }),
  )
  fails(() =>
    validateCurves({ ...curves, series: [{ ...curves.series[1], t_c: [30] }] }),
  )
  const spectra = {
    wl_um: [0.3, 0.31],
    n_mc: 4,
    series: [
      {
        id: "SP-001",
        kind: "candidate",
        nominal_only: false,
        r: [0.5, 0.6],
        r_lo: [0.4, 0.5],
        r_hi: [0.6, 0.7],
      },
      { id: "C0", kind: "control", nominal_only: true, r: [0.2, 0.2] },
    ],
  }
  expect(validateSpectra(spectra).series.length).toBe(2)
  fails(() =>
    validateSpectra({
      ...spectra,
      series: [
        {
          ...spectra.series[1],
          nominal_only: true,
          r_lo: [0, 0],
          r: [0.2, 0.2],
        },
      ],
    }),
  )
  fails(() =>
    validateSpectra({
      ...spectra,
      series: [{ ...spectra.series[1], r: [0.2, Number.NaN] }],
    }),
  )
})

test("parseParetoSensControlsCsvRoundTrip", () => {
  const paretoRows = [
    {
      candidate_id: "SP-001",
      r_solar_pred: 0.8,
      t_max_pred: 60,
      corrosion_proxy: 0.2,
      delam_proxy: 0.3,
      cost_proxy: 0.4,
      t_max_worst: 66,
      on_front: true,
      pareto_freq: 0.75,
      role: "balanced",
    },
  ]
  expect(parseParetoCsv(toCsv(PARETO_COLUMNS, paretoRows))).toEqual(
    validatePareto(paretoRows),
  )
  const sens = [
    {
      output: "t_max_c",
      method: "sobol",
      variable: "T1",
      index: "S1",
      value: 0.1,
      conf: 0.02,
    },
  ]
  expect(parseSensCsv(toCsv(SENS_COLUMNS, sens))).toEqual(validateSens(sens))
  const ctl = [
    {
      control_id: "C1",
      for_candidate: "-",
      scenario_id: "W1",
      r_solar_pred: 0.9,
      t_max_pred: 50,
      q_in_mean_w_m2: 10,
      corrosion_proxy: Number.NaN,
      wetting_proxy: Number.NaN,
      wetting_theta_pred: Number.NaN,
      delam_proxy: Number.NaN,
      cost_proxy: Number.NaN,
      gel_time_rel: Number.NaN,
      unmodelled:
        "corrosion_proxy;wetting_proxy;wetting_theta_pred;delam_proxy;cost_proxy;gel_time_rel",
    },
  ]
  const text = toCsv(CONTROL_COLUMNS, ctl, { nanColumns: CONTROL_NAN_COLUMNS })
  expect(parseControlsCsv(text)).toEqual(validateControls(ctl))
  expect(() => parseParetoCsv("a,b\n1,2\n")).toThrow(ConfigError)
})

test("shortlistFromParetoFindsThreeRoles", () => {
  const rows: ParetoRow[] = [
    { ...pareto(), candidate_id: "SP-001", role: "low_cost" },
    { ...pareto(), candidate_id: "SP-002", role: "" },
    { ...pareto(), candidate_id: "SP-003", role: "high_performing" },
    { ...pareto(), candidate_id: "SP-004", role: "balanced" },
  ]
  expect(shortlistFromPareto(rows)).toEqual({
    high_performing: "SP-003",
    balanced: "SP-004",
    low_cost: "SP-001",
  })
})

test("shortlistFromParetoMissingOrDuplicateRoleIsDataError", () => {
  const mk = (roles: ParetoRow["role"][]): ParetoRow[] =>
    roles.map((role, i) => ({
      ...pareto(),
      candidate_id: `SP-00${i + 1}`,
      role,
    }))
  for (const roles of [
    ["high_performing", "balanced", ""],
    ["high_performing", "balanced", "balanced"],
  ] as ParetoRow["role"][][]) {
    let err: unknown
    try {
      shortlistFromPareto(mk(roles))
    } catch (e) {
      err = e
    }
    expect(err).toBeInstanceOf(DataError)
    expect(err).toMatchObject({ code: 5 })
  }
})

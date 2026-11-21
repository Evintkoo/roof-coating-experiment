import { expect, test } from "bun:test"
import { toCsv } from "../../src/core/csv"
import { ConfigError } from "../../src/core/errors"
import {
  DESIGN_COLUMNS,
  parseResultsCsv,
  RESULT_COLUMNS,
  validateDesign,
  validateResults,
} from "../../src/core/schema"

const design = (id = "SP-001"): Record<string, unknown> => ({
  candidate_id: id,
  primer_gptes_molfrac: 0.1,
  primer_dft_um: 50,
  midcoat_pvc: 0.3,
  midcoat_tio2_fraction: 0.5,
  midcoat_dft_um: 100,
  topcoat_mtes_molfrac: 0.2,
  topcoat_dft_um: 40,
})

const result = (
  over: Record<string, unknown> = {},
): Record<string, unknown> => ({
  ...design(),
  scenario_id: "tropical",
  r_solar_pred: 0.8,
  r_solar_lo: 0.7,
  r_solar_hi: 0.9,
  t_max_pred: 60,
  t_max_lo: 55,
  t_max_hi: 65,
  corrosion_proxy: 0.2,
  corrosion_proxy_lo: 0.1,
  corrosion_proxy_hi: 0.3,
  wetting_proxy: 0.6,
  wetting_proxy_lo: 0.5,
  wetting_proxy_hi: 0.7,
  wetting_theta_pred: 110,
  wetting_theta_lo: 100,
  wetting_theta_hi: 120,
  q_in_mean_w_m2: 300,
  q_in_mean_w_m2_lo: 280,
  q_in_mean_w_m2_hi: 320,
  delam_proxy: 0.1,
  delam_proxy_lo: 0.05,
  delam_proxy_hi: 0.2,
  cost_proxy: 0.4,
  gel_time_rel: 1.5,
  feasible: true,
  ...over,
})

const keyOf = (fn: () => unknown): string | undefined => {
  try {
    fn()
  } catch (e) {
    expect(e).toBeInstanceOf(ConfigError)
    return (e as ConfigError).key
  }
  throw new Error("expected ConfigError")
}

test("designOk", () => {
  expect(validateDesign([design("SP-001"), design("SP-002")])).toHaveLength(2)
  expect(DESIGN_COLUMNS).toHaveLength(8)
  const f = validateDesign(
    [{ ...design(), feasible: false, violations: "x" }],
    true,
  )
  expect(f[0]).toMatchObject({ feasible: false, violations: "x" })
})

test("missingColumnNamesColumn", () => {
  const d = design()
  delete d.midcoat_pvc
  expect(keyOf(() => validateDesign([d]))).toBe("midcoat_pvc")
  expect(keyOf(() => validateDesign([{ ...design(), extra: 1 }]))).toBe("extra")
  expect(
    keyOf(() => validateDesign([{ ...design(), midcoat_pvc: "0.3" }])),
  ).toBe("midcoat_pvc")
  expect(
    keyOf(() => validateDesign([{ ...design(), midcoat_pvc: Number.NaN }])),
  ).toBe("midcoat_pvc")
})

test("duplicateIdRejected", () => {
  expect(
    keyOf(() => validateDesign([design("SP-001"), design("SP-001")])),
  ).toBe("candidate_id")
})

test("badIdPatternRejected", () => {
  expect(keyOf(() => validateDesign([design("SP-01")]))).toBe("candidate_id")
  expect(keyOf(() => validateDesign([design("SP-0012")]))).toBe("candidate_id")
  expect(keyOf(() => validateDesign([design("xSP-001")]))).toBe("candidate_id")
})

test("withFlagsRequiresFlagColumns", () => {
  expect(keyOf(() => validateDesign([design()], true))).toBe("feasible")
  expect(
    keyOf(() => validateDesign([{ ...design(), feasible: true }], true)),
  ).toBe("violations")
  expect(
    keyOf(() =>
      validateDesign([{ ...design(), feasible: "yes", violations: "" }], true),
    ),
  ).toBe("feasible")
  expect(
    keyOf(() =>
      validateDesign([{ ...design(), feasible: true, violations: "" }]),
    ),
  ).toBe("feasible")
})

test("thetaBoundedInDegreesNotUnitInterval", () => {
  expect(
    validateResults([
      result({ wetting_theta_pred: 150, wetting_theta_hi: 180 }),
    ]),
  ).toHaveLength(1)
  expect(
    keyOf(() => validateResults([result({ wetting_theta_hi: 181 })])),
  ).toBe("wetting_theta_hi")
  expect(keyOf(() => validateResults([result({ wetting_theta_lo: -1 })]))).toBe(
    "wetting_theta_lo",
  )
})

test("validateResultsThrowsConfigErrorWithColumnKey", () => {
  const r = result()
  delete r.cost_proxy
  expect(keyOf(() => validateResults([r]))).toBe("cost_proxy")
  expect(keyOf(() => validateResults([result({ scenario_id: 3 })]))).toBe(
    "scenario_id",
  )
  expect(keyOf(() => validateResults([result({ feasible: "true" })]))).toBe(
    "feasible",
  )
  expect(keyOf(() => validateResults([result({ zzz: 1 })]))).toBe("zzz")
  expect(
    keyOf(() =>
      validateResults([result({ gel_time_rel: Number.NEGATIVE_INFINITY })]),
    ),
  ).toBe("gel_time_rel")
})

test("resultsIntervalOrderEnforced", () => {
  expect(keyOf(() => validateResults([result({ r_solar_lo: 0.85 })]))).toBe(
    "r_solar_lo",
  )
  expect(keyOf(() => validateResults([result({ t_max_hi: 50 })]))).toBe(
    "t_max_hi",
  )
  expect(
    keyOf(() => validateResults([result({ q_in_mean_w_m2_lo: 400 })])),
  ).toBe("q_in_mean_w_m2_lo")
})

test("proxyOutsideUnitIntervalRejected", () => {
  expect(
    keyOf(() => validateResults([result({ corrosion_proxy_hi: 1.2 })])),
  ).toBe("corrosion_proxy_hi")
  expect(
    keyOf(() => validateResults([result({ wetting_proxy_lo: -0.1 })])),
  ).toBe("wetting_proxy_lo")
  expect(keyOf(() => validateResults([result({ delam_proxy_hi: 2 })]))).toBe(
    "delam_proxy_hi",
  )
  expect(keyOf(() => validateResults([result({ cost_proxy: 1.1 })]))).toBe(
    "cost_proxy",
  )
  expect(keyOf(() => validateResults([result({ r_solar_hi: 1.1 })]))).toBe(
    "r_solar_hi",
  )
})

test("nanAllowedOnlyWhenInfeasible", () => {
  const nan = Number.NaN
  const bad = {
    r_solar_pred: nan,
    r_solar_lo: nan,
    r_solar_hi: nan,
    gel_time_rel: nan,
    cost_proxy: nan,
  }
  expect(validateResults([result({ ...bad, feasible: false })])).toHaveLength(1)
  expect(keyOf(() => validateResults([result({ r_solar_pred: nan })]))).toBe(
    "r_solar_pred",
  )
  expect(keyOf(() => validateResults([result({ gel_time_rel: nan })]))).toBe(
    "gel_time_rel",
  )
  expect(
    keyOf(() =>
      validateResults([
        result({ scenario_id: "a", candidate_id: "SP-01", feasible: false }),
      ]),
    ),
  ).toBe("candidate_id")
})

test("nanInIntervalBoundsOnlyWhenInfeasible", () => {
  const nan = Number.NaN
  expect(keyOf(() => validateResults([result({ r_solar_lo: nan })]))).toBe(
    "r_solar_lo",
  )
  expect(keyOf(() => validateResults([result({ r_solar_hi: nan })]))).toBe(
    "r_solar_hi",
  )
  expect(
    validateResults([result({ r_solar_lo: nan, feasible: false })]),
  ).toHaveLength(1)
})

test("infGelTimeAllowedOnFeasible", () => {
  const rows = validateResults([
    result({ gel_time_rel: Number.POSITIVE_INFINITY }),
  ])
  expect(rows[0]?.gel_time_rel).toBe(Number.POSITIVE_INFINITY)
})

test("parseResultsCsvRoundTrip", () => {
  const ok = result()
  const bad = result({
    candidate_id: "SP-002",
    r_solar_pred: Number.NaN,
    r_solar_lo: Number.NaN,
    r_solar_hi: Number.NaN,
    gel_time_rel: Number.POSITIVE_INFINITY,
    feasible: false,
  })
  const text = toCsv(RESULT_COLUMNS, [ok, bad] as never)
  const out = parseResultsCsv(text)
  expect(out).toHaveLength(2)
  expect(out[0]).toEqual(ok as never)
  expect(out[1]?.r_solar_pred).toBeNaN()
  expect(out[1]?.gel_time_rel).toBe(Number.POSITIVE_INFINITY)
  expect(out[1]?.feasible).toBe(false)
  expect(RESULT_COLUMNS).toHaveLength(33)
  expect(keyOf(() => parseResultsCsv(text.replace("true", "maybe")))).toBe(
    "feasible",
  )
})

test("resultsHeaderValidation", () => {
  const text = toCsv(RESULT_COLUMNS, [result()] as never)
  expect(parseResultsCsv(`\uFEFF${text}`)).toHaveLength(1)
  expect(parseResultsCsv(text.replaceAll("\n", "\r\n"))).toHaveLength(1)
  const header = text.split("\n")[0] as string
  expect(parseResultsCsv(`${header}\n`)).toEqual([])
  expect(
    keyOf(() =>
      parseResultsCsv(
        text.replace("\n", ",zzz\n").replace(/\n(.*)\n$/, "\n$1,x\n"),
      ),
    ),
  ).toBe("zzz")
  expect(
    keyOf(() => parseResultsCsv(text.replace("cost_proxy", "r_solar_pred"))),
  ).toBe("r_solar_pred")
  expect(keyOf(() => parseResultsCsv("candidate_id,scenario_id\n"))).toBe(
    "primer_gptes_molfrac",
  )
  expect(keyOf(() => parseResultsCsv(""))).toBe("candidate_id")
})

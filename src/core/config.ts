import { z } from "zod"
import { ConfigError } from "./errors"

const STATUS = z.enum(["literature", "vendor", "scenario"])

export const Sourced = z.strictObject({
  value: z.number(),
  unit: z.string(),
  source: z.string().trim().min(1),
  status: STATUS,
})

export const RangeSchema = z
  .strictObject({
    min: z.number(),
    max: z.number(),
    unit: z.string(),
    source: z.string().trim().min(1),
    status: STATUS,
  })
  .refine((r) => r.min < r.max, {
    path: ["min"],
    message: "min must be below max",
  })

export const MaterialRangesSchema = z.strictObject({
  primer_gptes_molfrac: RangeSchema,
  primer_dft_um: RangeSchema,
  midcoat_pvc: RangeSchema,
  midcoat_tio2_fraction: RangeSchema,
  midcoat_dft_um: RangeSchema,
  topcoat_mtes_molfrac: RangeSchema,
  topcoat_dft_um: RangeSchema,
  sol_gel_ph: RangeSchema,
  sol_gel_water_ratio: RangeSchema,
  cpvc: Sourced,
  max_total_dft_um: Sourced,
})

export const LevelsSchema = z
  .strictObject({
    values: z.tuple([z.number(), z.number(), z.number()]),
    unit: z.string(),
    source: z.string().trim().min(1),
    status: STATUS,
  })
  .refine((l) => l.values[0] < l.values[1] && l.values[1] < l.values[2], {
    path: ["values"],
    message: "values must be strictly ascending",
  })

const Positive = Sourced.extend({ value: z.number().positive() })

export const WeatherSchema = z.strictObject({
  irradiance_w_m2: LevelsSchema,
  t_air_c: LevelsSchema,
  wind_m_s: LevelsSchema,
  h_conv_a: Sourced,
  h_conv_b: Sourced,
  roof: z.strictObject({
    c_substrate_j_m2k: Positive,
    rho_c_coating_j_m3k: Positive,
    r_total_m2k_w: Positive,
    t_inside_c: Positive,
  }),
})

const num = (v: z.ZodNumber) => Sourced.extend({ value: v })
const pos = num(z.number().gt(0))
const nonNeg = num(z.number().gte(0))
const unit01 = num(z.number().gte(0).lte(1))
const emissivity = num(z.number().gt(0).lte(1))
const angle = num(z.number().gte(0).lte(180))
const diameter = num(z.number().gt(0).lte(50))
const refractive = num(z.number().gte(1))

/** Domain table D9 of plan 02; every field carries value, unit, source and status. */
export const MaterialsSchema = z.strictObject({
  tio2: z.strictObject({ diameter_um: diameter }),
  baso4: z.strictObject({ diameter_um: diameter, n: refractive }),
  binder: z.strictObject({ n: refractive }),
  substrate: z.strictObject({
    r_solar: unit01,
    emissivity,
    c_j_m2k: pos,
  }),
  coating: z.strictObject({ emissivity }),
  topcoat: z.strictObject({ mu_per_um: nonNeg }),
  wetting: z.strictObject({
    theta_silica_deg: angle,
    theta_mtes_deg: angle,
    theta_binder_deg: angle,
    r_max: num(z.number().gte(1)),
    f_solid_min: emissivity,
  }),
  barrier: z
    .strictObject({
      eps_lo: num(z.number().gt(0).lt(1)),
      eps_hi: num(z.number().gt(0).lt(1)),
      h_c0_primer_um: pos,
      h_c0_top_um: pos,
      crack_exponent: pos,
      t_ref_rel: pos,
    })
    .refine((b) => b.eps_lo.value < b.eps_hi.value, {
      path: ["eps_lo"],
      message: "eps_lo must be below eps_hi",
    }),
  sol_gel: z.strictObject({ k_h: pos, k_c: pos, t_end_s: pos }),
  cost: z.strictObject({ rc_primer: nonNeg, rc_mid: nonNeg, rc_top: nonNeg }),
  baseline_corrosion_risk: unit01,
  unc: z.strictObject({
    diameter_rel: nonNeg,
    n_rel: nonNeg,
    mu_rel: nonNeg,
    eps_rel: nonNeg,
    h_c0_rel: nonNeg,
    substrate_r_abs: nonNeg,
    theta_deg: nonNeg,
  }),
})

export type Materials = z.infer<typeof MaterialsSchema>
export type MaterialRanges = z.infer<typeof MaterialRangesSchema>
export type WeatherConfig = z.infer<typeof WeatherSchema>

function parseWith<T>(schema: z.ZodType<T>, raw: unknown): T {
  const res = schema.safeParse(raw)
  if (res.success) return res.data
  const issue = res.error.issues[0]
  if (!issue) throw new ConfigError("(root)", "invalid config")
  const path = issue.path.map(String)
  if (issue.code === "unrecognized_keys") path.push(String(issue.keys[0]))
  const key = path.length === 0 ? "(root)" : path.join(".")
  throw new ConfigError(key, issue.message)
}

export const parseMaterialRanges = (raw: unknown): MaterialRanges =>
  parseWith(MaterialRangesSchema, raw)

export const parseWeather = (raw: unknown): WeatherConfig =>
  parseWith(WeatherSchema, raw)

export const parseMaterials = (raw: unknown): Materials =>
  parseWith(MaterialsSchema, raw)

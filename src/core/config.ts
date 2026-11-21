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

import { z } from "zod"
import { ConfigError } from "../errors"
import { OBJECTIVE_NAMES } from "./scalarize"
import { checkInBox, VARS } from "./vars"

const STATUS = z.enum(["literature", "vendor", "scenario"])

const VarSchema = z
  .strictObject({
    id: z.string(),
    label: z.string(),
    lo: z.number(),
    hi: z.number(),
    h: z.number().gt(0).lt(0.5),
    unit: z.string(),
    source: z.string().trim().min(1),
    status: STATUS,
  })
  .refine((v) => v.lo < v.hi, { path: ["lo"], message: "lo must be below hi" })

/** One weight vector keyed by exactly the plan-3 objective names, non-negative, summing to 1 (F1). */
const Weights = z
  .record(z.string(), z.number().min(0))
  .superRefine((w, ctx) => {
    const keys = Object.keys(w).sort()
    const want = [...OBJECTIVE_NAMES].sort()
    if (keys.join() !== want.join()) {
      ctx.addIssue({
        code: "custom",
        message: `weights must be keyed by exactly ${OBJECTIVE_NAMES.join(", ")}`,
      })
      return
    }
    const sum = Object.values(w).reduce((a, b) => a + b, 0)
    if (Math.abs(sum - 1) > 1e-9)
      ctx.addIssue({
        code: "custom",
        message: `weights sum to ${sum}, must sum to 1`,
      })
  })

const PosInt = z.number().int().min(1)

export const OptimizeSchema = z
  .strictObject({
    vars: z.array(VarSchema),
    scalarisation: z.strictObject({
      beta: z.number().gt(0),
      rho: z.number().gte(0),
    }),
    weights: z.record(z.string(), Weights),
    profiles: z.strictObject({
      cooling_first: Weights,
      balanced: Weights,
      durability_first: Weights,
    }),
    tol_loss: z.number().gt(0).lt(1),
    t_grad_rel: z.number().gt(0).lte(1e-3),
    t_kkt: z.number().gt(0).lte(1e-4),
    max_iter: PosInt,
    robust_draws: PosInt,
    interval_draws: PosInt,
    budget_levels: z.number().int().min(2),
    starts: z.strictObject({ pareto: PosInt, sobol: PosInt, corner: PosInt }),
    extra_starts: z.array(z.array(z.number())),
  })
  .superRefine((c, ctx) => {
    if (c.vars.length !== VARS.length)
      ctx.addIssue({
        code: "custom",
        path: ["vars"],
        message: `needs ${VARS.length} variables, got ${c.vars.length}`,
      })
    else
      c.vars.forEach((v, i) => {
        if (v.id !== (VARS[i] as (typeof VARS)[number]).id)
          ctx.addIssue({
            code: "custom",
            path: ["vars", i, "id"],
            message: `variable ${i} must be ${(VARS[i] as (typeof VARS)[number]).id}, got ${v.id}`,
          })
      })
    if (!("balanced" in c.weights))
      ctx.addIssue({
        code: "custom",
        path: ["weights"],
        message: "weights.balanced is required",
      })
    c.extra_starts.forEach((x, i) => {
      try {
        checkInBox(x)
      } catch (e) {
        ctx.addIssue({
          code: "custom",
          path: ["extra_starts", i],
          message: (e as Error).message,
        })
      }
    })
  })

export type OptimizeConfig = z.infer<typeof OptimizeSchema>

/** Same error mapping as src/core/config.ts: first issue becomes a ConfigError (exit 2). */
export function parseOptimize(raw: unknown): OptimizeConfig {
  const res = OptimizeSchema.safeParse(raw)
  if (res.success) return res.data
  const issue = res.error.issues[0]
  if (!issue) throw new ConfigError("(root)", "invalid config")
  const path = issue.path.map(String)
  if (issue.code === "unrecognized_keys") path.push(String(issue.keys[0]))
  throw new ConfigError(
    path.length === 0 ? "(root)" : path.join("."),
    issue.message,
  )
}

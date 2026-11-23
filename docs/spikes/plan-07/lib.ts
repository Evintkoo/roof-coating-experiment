// Shared loading for the plan 07 spike scripts: the committed fixture run, the real context, one cell evaluator.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { coerceCell, parseCsv } from "../../../src/core/csv"
import type { Scenario } from "../../../src/core/design"
import type { ModelContext } from "../../../src/core/pipeline/context"
import {
  CONTROL_LAYERS,
  type Outcome,
  stackProps,
  thermalOutcomes,
} from "../../../src/core/pipeline/stackProps"
import type { FlaggedDesignRow } from "../../../src/core/schema"
import { loadContext } from "../../../src/node/context"

export const root = join(import.meta.dir, "..", "..", "..")
export const fixture = join(root, "tests", "fixtures", "report-run")

export async function ctx(): Promise<ModelContext> {
  return loadContext(join(root, "configs"), join(root, "data", "literature"))
}

export function designs(): FlaggedDesignRow[] {
  return parseCsv(readFileSync(join(fixture, "candidates.csv"), "utf8")).map(
    (r) => {
      const o: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(r))
        o[k] =
          k === "candidate_id" || k === "violations"
            ? v
            : k === "feasible"
              ? v === "true"
              : Number(v)
      return o as unknown as FlaggedDesignRow
    },
  )
}

export function scenarios(): Scenario[] {
  return parseCsv(readFileSync(join(fixture, "weather.csv"), "utf8")).map(
    (r) => ({
      scenario_id: r.scenario_id as string,
      irradiance_w_m2: Number(r.irradiance_w_m2),
      t_air_c: Number(r.t_air_c),
      wind_m_s: Number(r.wind_m_s),
      h_conv_w_m2k: Number(r.h_conv_w_m2k),
      t_sky_k: Number(r.t_sky_k),
    }),
  )
}

/** Same pure functions as the batch (simWorker: C4 layers, nominal material). */
export function evalCell(
  c: ModelContext,
  d: FlaggedDesignRow,
  s: Scenario,
): Outcome {
  const sp = stackProps(d, CONTROL_LAYERS.C4, c)
  return thermalOutcomes([{ sp, s }], c)[0] as Outcome
}

export const batchRows = () =>
  parseCsv(readFileSync(join(fixture, "results.csv"), "utf8"))
export { coerceCell }

let fails = 0
export function expectOk(name: string, ok: boolean, detail = ""): void {
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`)
  if (!ok) fails++
}
export const finish = (): never => process.exit(fails === 0 ? 0 : 1)

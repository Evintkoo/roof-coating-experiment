// Reads the files of a finished run directory into the typed input of `findings()` (plan 06 Task 5).
// Optional parts (refine, budget table, Indonesia) are absent when their files are. This reader does not check the run
// manifest hashes; the report builder's verified readers do, and Task 6 feeds `findings()` from those.
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { coerceCell, parseCsv } from "../../core/csv"
import { DataError } from "../../core/errors"
import type {
  BudgetTables,
  ControlRow,
  FindingsInput,
  IndonesiaSummary,
  RefineRecipes,
  Shortlist,
} from "../../core/report/findings"
import { parseResultsCsv } from "../../core/schema"

const OPT = new Set<string>()
const read = (p: string): string => readFileSync(p, "utf8")
const num = (column: string, text: string): number =>
  coerceCell(column, text, { nanColumns: OPT })
const locate = (dir: string, name: string): string | null => {
  for (const sub of ["", "refine", "indonesia"]) {
    const p = join(dir, sub, name)
    if (existsSync(p)) return p
  }
  return null
}

/** The shortlist from candidate_cards/<role>_<id>.md file names (the plan 03 output). */
export function shortlistFromCards(dir: string): Shortlist {
  const out: Record<string, string> = {}
  const cards = join(dir, "candidate_cards")
  if (!existsSync(cards)) return out
  for (const f of readdirSync(cards)) {
    const m = /^(.*)_(SP-\d{3})\.md$/.exec(f)
    if (m) out[m[1] as string] = m[2] as string
  }
  return out
}

export function loadFindingsInput(dir: string): FindingsInput {
  const resultsPath = join(dir, "results.csv")
  const controlsPath = join(dir, "controls.csv")
  if (!existsSync(resultsPath) || !existsSync(controlsPath))
    throw new DataError(
      "results.csv",
      "results.csv and controls.csv are required",
    )
  const controls: ControlRow[] = parseCsv(read(controlsPath)).map((r) => ({
    control_id: r.control_id as string,
    scenario_id: r.scenario_id as string,
    t_max_pred: num("t_max_pred", r.t_max_pred as string),
  }))
  const input: FindingsInput = {
    shortlist: shortlistFromCards(dir),
    results: parseResultsCsv(read(resultsPath)),
    controls,
  }
  const rp = locate(dir, "refine_recipes.csv")
  if (rp !== null) {
    const refine: RefineRecipes = parseCsv(read(rp)).map((r) => ({
      role: r.role as string,
      screened_id: r.screened_id as string,
      r_solar_pred: num("r_solar_pred", r.r_solar_pred as string),
      t_max_pred: num("t_max_pred", r.t_max_pred as string),
      cost_proxy: num("cost_proxy", r.cost_proxy as string),
      status: r.status as string,
    }))
    input.refine = refine
  }
  const bp = locate(dir, "budget_table.json")
  if (bp !== null) {
    const b = JSON.parse(read(bp)) as BudgetTables
    input.budget = { cost_unit: b.cost_unit, tables: b.tables }
  }
  const sp = locate(dir, "indonesia_summary.csv")
  const dp = locate(dir, "indonesia_days.json")
  if (sp !== null && dp !== null) {
    const days = JSON.parse(read(dp)) as { loss_lo: number; loss_hi: number }
    const ind: IndonesiaSummary = {
      loss_lo: days.loss_lo,
      loss_hi: days.loss_hi,
      summary: parseCsv(read(sp)).map((r) => ({
        site: r.site as string,
        bin: r.bin as string,
        subject: r.subject as string,
        state: r.state as string,
        dq_w_m2: num("dq_w_m2", r.dq_w_m2 as string),
        dq_lo: num("dq_lo", r.dq_lo as string),
        dq_hi: num("dq_hi", r.dq_hi as string),
      })),
    }
    input.indonesia = ind
  }
  return input
}

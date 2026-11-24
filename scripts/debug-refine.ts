// TEMPORARY (branch debug/linux-numerics only): the delam-active solve of tests/node/refine.test.ts with its trace dumped.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { weatherL9 } from "../src/core/design"
import { makeModel } from "../src/core/opt/objective"
import { minimise } from "../src/core/opt/projectedBfgs"
import { gradient } from "../src/core/opt/gradient"
import { normaliseObjectives, OBJECTIVE_NAMES } from "../src/core/opt/scalarize"
import { VARS } from "../src/core/opt/vars"
import { parseResultsCsv } from "../src/core/schema"
import { loadContext } from "../src/node/context"
import { buildPlan3 } from "../tests/helpers"

const root = join(import.meta.dir, "..")
const out = process.argv[2] ?? ".dbg/refine"
mkdirSync(out, { recursive: true })
const dv = new DataView(new ArrayBuffer(8))
const bits = (x: number) => {
  dv.setFloat64(0, x)
  return dv.getBigUint64(0).toString(16).padStart(16, "0")
}
const plan3 = mkdtempSync(join(tmpdir(), "spandek-p3-"))
await buildPlan3(plan3)
copyFileSync(join(plan3, "results.csv"), join(out, "results.csv"))
const ctx = await loadContext(join(root, "configs"), join(root, "data/literature"))
const tight = structuredClone(ctx)
tight.mat.barrier.h_c0_top_um.value = 7
const results = parseResultsCsv(readFileSync(join(plan3, "results.csv"), "utf8"))
const norm = normaliseObjectives(results)
const model = makeModel(
  tight,
  weatherL9(tight.weather),
  norm,
  tight.ranges.cpvc.value,
  tight.ranges.max_total_dft_um.value,
  tight.mat,
)
const W: Record<string, number> = { r_solar_pred: 0.1, t_max_pred: 0.1, corrosion_proxy: 0.8 }
const w = OBJECTIVE_NAMES.map((n) => W[n] ?? 0)
const hs = VARS.map((v) => v.h)
const f = (u: Float64Array) => model.scalar(u, w)
const g = (u: Float64Array) => gradient(f, u, hs)
const cons = ([0, 1, 2] as const).map((j) => (u: Float64Array) => model.constraint(u, j))
const u0 = new Float64Array(VARS.length).fill(0.5)
const r = minimise(f, g, u0, cons, {})
const info = {
  norm: JSON.stringify(norm),
  status: r.status,
  iters: r.iters,
  kkt: r.kkt,
  f: r.f,
  u: Array.from(r.u, bits),
  uNum: Array.from(r.u),
  trace: r.trace.map(bits),
  traceNum: r.trace,
  rounds: r.rounds,
  c2: model.constraint(r.u, 2),
  delam: model.delam(r.u),
  f0: bits(f(u0)),
  g0: Array.from(g(u0), bits),
  cons0: cons.map((c) => bits(c(u0))),
}
writeFileSync(join(out, "refine.json"), JSON.stringify(info, null, 1))
console.log("status", r.status, "iters", r.iters, "c2", info.c2, "delam", info.delam, "trace len", r.trace.length)

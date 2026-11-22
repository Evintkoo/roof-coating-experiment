// Q1 (Bun side) + Q5 data + H7 preview: cost of one cell, the 864-cell screening on 1, 2, 4 workers with an
// index-ordered merge (dynamic dispatch, so arrival order varies), byte-identity across worker counts and equality
// with the batch results.csv. Chrome worker timing is NOT measured here (see docs/spikes/plan-07.md).
import { cpus, loadavg } from "node:os"
import { mergeOrdered, screeningTasks } from "../../../src/core/anim/screening"
import { contextToJson } from "../../../src/core/pipeline/contextJson"
import {
  batchRows,
  ctx,
  designs,
  evalCell,
  expectOk,
  finish,
  scenarios,
} from "./lib"

const c = await ctx()
const D = designs()
const S = scenarios()
expectOk(
  "96 designs and 9 scenarios in the fixture",
  D.length === 96 && S.length === 9,
)
const tasks = screeningTasks(D.length, S.length)
const ctxJson = contextToJson(c)
console.log(
  `cores=${cpus().length} load1=${loadavg()[0]?.toFixed(1)} ctxJson=${(ctxJson.length / 1024).toFixed(0)} KiB`,
)

// per-cell cost, single thread, inline
const t0 = performance.now()
const inline = tasks.map((t) => evalCell(c, D[t.candidate]!, S[t.scenario]!))
const inlineMs = performance.now() - t0
console.log(
  `inline 864 cells (stackProps per cell): ${inlineMs.toFixed(0)} ms, ${(inlineMs / 864).toFixed(2)} ms/cell`,
)

// equality with the batch nominal columns
const rows = batchRows()
let maxd = 0
let n = 0
for (const t of tasks) {
  const r = rows[t.index]!
  const o = inline[t.index]!
  if (
    r.candidate_id !== D[t.candidate]!.candidate_id ||
    r.scenario_id !== S[t.scenario]!.scenario_id
  ) {
    expectOk(`row order matches task order at ${t.index}`, false)
    break
  }
  for (const [col, v] of [
    ["r_solar_pred", o.r_solar],
    ["t_max_pred", o.t_max_c],
    ["q_in_mean_w_m2", o.q_in_mean_w_m2],
  ] as const) {
    maxd = Math.max(maxd, Math.abs(Number(r[col]) - v))
    n++
  }
}
expectOk(
  "batch results.csv rows are candidate-major, scenario-minor (task index = row index)",
  true,
)
expectOk(
  `inline equals batch nominal columns, ${n} values`,
  maxd < 1e-9,
  `max diff ${maxd.toExponential(2)}`,
)

// worker pool with dynamic dispatch and ordered merge
async function screen(
  nWorkers: number,
  perCandidate: boolean,
): Promise<{ ms: number; json: string }> {
  const chunks: (typeof tasks)[] = []
  if (perCandidate)
    for (let i = 0; i < tasks.length; i += S.length)
      chunks.push(tasks.slice(i, i + S.length))
  else for (const t of tasks) chunks.push([t])
  const t = performance.now()
  const parts: { index: number; value: number[] }[] = []
  let next = 0
  await Promise.all(
    Array.from({ length: nWorkers }, async () => {
      const w = new Worker(new URL("./q1_worker.ts", import.meta.url))
      try {
        while (next < chunks.length) {
          const chunk = chunks[next++]!
          const r: { out: { index: number; v: number[] }[] } =
            await new Promise((res, rej) => {
              w.onmessage = (e) => res(e.data)
              w.onerror = (e) => rej(e)
              w.postMessage({
                ctxJson,
                designs: D,
                scenarios: S,
                chunk,
                shareStack: perCandidate,
              })
            })
          for (const o of r.out) parts.push({ index: o.index, value: o.v })
        }
      } finally {
        w.terminate()
      }
    }),
  )
  const merged = mergeOrdered(parts, tasks.length)
  return { ms: performance.now() - t, json: JSON.stringify(merged) }
}

const inlineJson = JSON.stringify(
  inline.map((o) => [o.r_solar, o.t_max_c, o.q_in_mean_w_m2]),
)
const res: Record<string, { ms: number; json: string }> = {}
for (const per of [true, false])
  for (const w of [1, 2, 4]) {
    const r = await screen(w, per)
    res[`${per ? "cand" : "cell"}-${w}`] = r
    console.log(
      `${per ? "per-candidate" : "per-cell     "} chunks, ${w} worker(s): ${r.ms.toFixed(0)} ms (includes worker start and ctx parse), load1=${loadavg()[0]?.toFixed(1)}`,
    )
  }
expectOk(
  "1, 2 and 4 workers return byte-identical JSON (per-candidate chunks)",
  res["cand-1"]!.json === res["cand-2"]!.json &&
    res["cand-2"]!.json === res["cand-4"]!.json,
)
expectOk(
  "1, 2 and 4 workers return byte-identical JSON (per-cell chunks)",
  res["cell-1"]!.json === res["cell-2"]!.json &&
    res["cell-2"]!.json === res["cell-4"]!.json,
)
expectOk(
  "pool output equals the inline evaluation byte for byte",
  res["cand-4"]!.json === inlineJson && res["cell-4"]!.json === inlineJson,
)
console.log(
  `speedup 4 vs 1 (per-candidate): ${(res["cand-1"]!.ms / res["cand-4"]!.ms).toFixed(2)}x; (per-cell): ${(res["cell-1"]!.ms / res["cell-4"]!.ms).toFixed(2)}x (indicative only: machine is shared and loaded)`,
)
finish()

// T-HON: the report must not look more certain than the models are. Figure part (plan 00 Task 3);
// the page part (Limits section, forbidden phrases in the built HTML) is added with the builder.
import { beforeAll, expect, test } from "bun:test"
import { join } from "node:path"
import type { ModelContext } from "../src/core/pipeline/context"
import { liveSimulate } from "../src/core/pipeline/live"
import { loadContext } from "../src/node/context"
import {
  figLiveSpectrum,
  figLiveTofT,
  figParcoords,
  figSplom,
} from "../src/web/figures"
import { defaultLiveState } from "../src/web/liveState"
import { repoRoot } from "./helpers"

let ctx: ModelContext
beforeAll(async () => {
  ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
})

test("liveFiguresShowTheBandAndSayHowManyDraws", () => {
  const r = liveSimulate(
    defaultLiveState(ctx.ranges, ctx.weather).inputs,
    ctx,
    32,
    20261121,
  )
  const f = figLiveTofT(r)
  const kinds = (f.data as { meta: { kind: string } }[]).map((t) => t.meta.kind)
  expect(kinds.filter((k) => k === "predicted").length).toBe(1)
  expect(kinds.filter((k) => k === "band").length).toBe(2)
  const y = (f.layout as { yaxis: { title: { text: string } } }).yaxis.title
    .text
  expect(y).toContain("p5-p95")
  expect(y).toContain("32 draws")
  expect(JSON.stringify(figLiveSpectrum(r, ctx.g173).data)).toContain("tonexty")
})

test("proxyAxesSaySoInEveryExplorerFigure", () => {
  const rows = [0, 1].map((i) => ({
    candidate_id: `SP-00${i + 1}`,
    r_solar_pred: 0.8,
    t_max_pred: 40,
    corrosion_proxy: 0.2,
    delam_proxy: 0.2,
    cost_proxy: 0.2,
    t_max_worst: 50,
    on_front: true,
    pareto_freq: 1,
    role: "" as const,
  }))
  for (const f of [figParcoords(rows, {}), figSplom(rows, {})]) {
    const labels = (
      f.data[0] as { dimensions: { label: string }[] }
    ).dimensions.map((d) => d.label)
    for (const l of labels)
      if (/Corrosion|Delamination|Cost/.test(l)) expect(l).toContain("(PROXY)")
  }
})

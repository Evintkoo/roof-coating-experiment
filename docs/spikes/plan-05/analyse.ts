// Reads the JSON written by gradient-study.ts and prints, per variable and h, the Richardson difference
// R(h) = |G(h) - G(h/2)| / |G(h/2)| (median and max over 20 points x objectives with a non-trivial gradient).
// Run: bun run docs/spikes/plan-05/analyse.ts study.json
import { readFileSync } from "node:fs"

const d = JSON.parse(readFileSync(process.argv[2] as string, "utf8"))
const med = (a: number[]) =>
  [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] as number
const q = (a: number[], p: number) =>
  [...a].sort((x, y) => x - y)[
    Math.min(a.length - 1, Math.floor(a.length * p))
  ] as number
const sci = (v: number) => v.toExponential(1)
console.log(`objectives: ${d.objectives.join(", ")}`)
for (const v of d.data) {
  console.log(`\n== ${v.id}`)
  const nObj = d.objectives.length
  // per-(objective) scale: max |G| at h=1e-4 over points; objective skipped if the gradient is identically ~0
  const scale = Array.from({ length: nObj }, (_, k) =>
    Math.max(...v.G[3].map((g: number[]) => Math.abs(g[k]))),
  )
  console.log(
    `scale |G| per objective (max over points): ${scale.map(sci).join("  ")}`,
  )
  console.log(`h      R_med   R_p90   R_max   | per-objective R_p90`)
  d.hs.forEach((h: number, j: number) => {
    const all: number[] = []
    const per: string[] = []
    for (let k = 0; k < nObj; k++) {
      if (scale[k] < 1e-8) {
        per.push("  zero ")
        continue
      }
      const floor = 1e-3 * scale[k] // points whose gradient is < 0.1 % of the largest are judged against the floor
      const r = v.G[j].map(
        (g: number[], p: number) =>
          Math.abs(g[k] - v.G2[j][p][k]) /
          Math.max(Math.abs(v.G2[j][p][k]), floor),
      )
      all.push(...r)
      per.push(sci(q(r, 0.9)))
    }
    console.log(
      `${sci(h)}  ${sci(med(all))}  ${sci(q(all, 0.9))}  ${sci(Math.max(...all))}  | ${per.join(" ")}`,
    )
  })
}

// ---- summary: a (variable, objective) pair is relevant when its largest |G| is >= 1e-3 of the largest over all variables
console.log(
  "\n== SUMMARY (relevant pairs only; R = Richardson difference over 20 points x relevant objectives)",
)
const nObj = d.objectives.length
const gscale = Array.from({ length: nObj }, (_, k) =>
  Math.max(
    ...d.data.map((v: { G: number[][][] }) =>
      Math.max(...v.G[3].map((g) => Math.abs(g[k] as number))),
    ),
  ),
)
console.log(`global scale per objective: ${gscale.map(sci).join("  ")}`)
console.log(
  "id          h_chosen  R_p90(h)  R_max(h)  plateau[R_p90<=1e-4]  decades  R_p90 at h/10 and 10h",
)
for (const v of d.data) {
  const rel: number[] = []
  for (let k = 0; k < nObj; k++) {
    const sc = Math.max(...v.G[3].map((g: number[]) => Math.abs(g[k])))
    if (sc >= 1e-3 * (gscale[k] as number)) rel.push(k)
  }
  const R = d.hs.map((_: number, j: number) => {
    const r: number[] = []
    for (const k of rel) {
      const sc = Math.max(...v.G[3].map((g: number[]) => Math.abs(g[k])))
      for (let p = 0; p < v.G[j].length; p++)
        r.push(
          Math.abs(v.G[j][p][k] - v.G2[j][p][k]) /
            Math.max(Math.abs(v.G2[j][p][k]), 1e-3 * sc),
        )
    }
    return r
  }) as number[][]
  const p90 = R.map((r) => q(r, 0.9))
  const mx = R.map((r) => Math.max(...r))
  let best = 0
  p90.forEach((x, j) => {
    if (x < (p90[best] as number)) best = j
  })
  const ok = p90.map((x) => x <= 1e-4)
  const idx = ok.map((b, j) => (b ? j : -1)).filter((j) => j >= 0)
  const lo = idx.length ? d.hs[idx[0] as number] : NaN
  const hi = idx.length ? d.hs[idx[idx.length - 1] as number] : NaN
  const contiguous =
    idx.length > 0 &&
    (idx[idx.length - 1] as number) - (idx[0] as number) + 1 === idx.length
  console.log(
    `${String(v.id).padEnd(11)} ${sci(d.hs[best])}   ${sci(p90[best] as number)}   ${sci(mx[best] as number)}   [${sci(hi)} .. ${sci(lo)}] ${contiguous ? "contiguous" : "NOT contiguous"}  ${idx.length}   ${sci((p90[best + 1] ?? NaN) as number)} / ${sci((p90[best - 1] ?? NaN) as number)}   rel objs: ${rel.map((k) => d.objectives[k]).join(",")}`,
  )
}

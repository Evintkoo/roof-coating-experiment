// Plan 06 spike Q1: page budget. Measures the current report section by section, builds a skeleton of the closed-by-default
// structure from the real text and real numbers of the plan-00 run, renders it in Chrome at 1280 px with every <details>
// closed, and checks the height against T_page_px. Also checks that the first screen (1280x800) holds the verdict, the three
// recipes, the honesty statement and the limits link (H2).
// Run: bun docs/spikes/plan-06/q1_page_budget.ts   (exit 0 only when every expectation holds; writes skeleton.html,
// skeleton-closed.jpg, skeleton-first-screen.png, q1-page-budget.json next to this file)

import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { chromium } from "playwright"
import { parseCsv } from "./lib/csv"

const HERE = dirname(new URL(import.meta.url).pathname)
const ROOT = join(HERE, "..", "..", "..")
const RUN = join(ROOT, "reports/plan-00-run")
const T_PAGE_PX = 9000 // frozen by this spike (the plan's stated value); never edited afterwards
const BASELINE_PX = 30240
const BASELINE_SECTIONS = {
  overview: 528,
  live: 1289,
  summary: 356,
  explorer: 4950,
  cards: 9366,
  sensitivity: 2888,
  optimisation: 3679,
  indonesia: 4736,
  limits: 1750,
  manifest: 597,
}

const fails: string[] = []
const expect = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`)
  if (!cond) fails.push(msg)
}

const csv = (p: string) => parseCsv(readFileSync(join(RUN, p), "utf8"))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const f = (x: number, d: number) => x.toFixed(d)

// ---- real numbers from the run ----
const results = csv("results.csv")
const controls = csv("controls.csv")
const cards = (await import("node:fs"))
  .readdirSync(join(RUN, "candidate_cards"))
  .filter((n) => n.endsWith(".md"))
  .sort()
const ROLE_LABEL: Record<string, string> = {
  high_performing: "Best cooling",
  balanced: "Balanced",
  low_cost: "Lowest cost",
}
const c0 = mean(
  controls
    .filter((r) => r.control_id === "C0")
    .map((r) => Number(r.t_max_pred)),
)
const recipes = cards
  .map((n) => {
    const m = /^(.*)_(SP-\d+)\.md$/.exec(n) as RegExpExecArray
    const rows = results.filter((r) => r.candidate_id === m[2])
    const text = readFileSync(join(RUN, "candidate_cards", n), "utf8")
    const layer = (h: string) =>
      (
        (
          new RegExp(`### ${h}\\s+([^\\n]+)`).exec(text) as RegExpExecArray
        )[1] as string
      ).replace(/,? target.*$/, "")
    const col = (k: string) => mean(rows.map((r) => Number(r[k])))
    return {
      role: ROLE_LABEL[m[1] as string] as string,
      id: m[2] as string,
      cool: c0 - col("t_max_pred"),
      coolLo: c0 - col("t_max_hi"),
      coolHi: c0 - col("t_max_lo"),
      r: col("r_solar_pred"),
      corr: col("corrosion_proxy"),
      delam: col("delam_proxy"),
      cost: col("cost_proxy"),
      decision: (
        /### Decision\s+(\w+)/.exec(text) as RegExpExecArray
      )[1] as string,
      layers: [layer("Primer chemistry"), layer("Midcoat"), layer("Topcoat")],
    }
  })
  .sort((a, b) => b.cool - a.cool)
const sites = csv("indonesia/indonesia_summary.csv")
  .filter(
    (r) =>
      r.subject === "card_high" &&
      r.state === "initial" &&
      r.bin === "weighted",
  )
  .map((r) => ({
    site: r.site as string,
    dq: Number(r.dq_w_m2),
    t: Number(r.t_max_c),
  }))
  .sort((a, b) => b.dq - a.dq)
const budget = JSON.parse(
  readFileSync(join(RUN, "refine/budget_table.json"), "utf8"),
) as { tables: { profile: string; knee_budget: number }[] }
const knee = (
  budget.tables.find((t) => t.profile === "balanced") as { knee_budget: number }
).knee_budget

// ---- 1. baseline ----
const browser = await chromium.launch({ channel: "chrome", headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
await page.goto(`file://${join(ROOT, "reports/report.html")}`)
await page.waitForTimeout(1500)
const base = await page.evaluate(() => ({
  height: document.documentElement.scrollHeight,
  sections: Object.fromEntries(
    [...document.querySelectorAll("section")].map((s) => [
      s.id,
      Math.round(s.getBoundingClientRect().height),
    ]),
  ),
  blocks: Object.fromEntries(
    [...document.querySelectorAll("section")].map((s) => [
      s.id,
      [...s.querySelectorAll("h2,h3,p,li,caption")].map((e) =>
        (e as HTMLElement).innerText.replace(/\s+/g, " ").trim(),
      ),
    ]),
  ),
}))
expect(
  Math.abs(base.height - BASELINE_PX) <= BASELINE_PX * 0.01,
  `baseline height ${base.height} px matches the plan's 30,240 px within 1 %`,
)
expect(
  Object.keys(BASELINE_SECTIONS).every(
    (k) =>
      Math.abs(
        (base.sections[k] as number) -
          (BASELINE_SECTIONS as Record<string, number>)[k]!,
      ) <= 40,
  ),
  "every baseline section height is within 40 px of the plan's measurement",
)
const b = base.blocks as Record<string, string[]>
const blk = (sec: string, i: number): string =>
  (b[sec] as string[])[i] as string
expect(
  blk("limits", 4).startsWith("Optics assume") &&
    blk("indonesia", 1).startsWith("PROXY results on aluminium") &&
    blk("overview", 0).startsWith("PROXY results."),
  "the real text blocks used below are the ones expected",
)
await page.close()

// ---- 2. skeleton ----
const q3 = JSON.parse(readFileSync(join(HERE, "q3-contrast.json"), "utf8")) as {
  tokens: Record<"dark" | "light", Record<string, string>>
}
const q4 = JSON.parse(readFileSync(join(HERE, "q4-palette.json"), "utf8")) as {
  dark: { categorical: string[]; baseline: string }
  light: { categorical: string[]; baseline: string }
}
const vars = (t: "dark" | "light") =>
  Object.entries(q3.tokens[t])
    .map(([k, v]) => `--${k}:${v};`)
    .join("")
const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
const fig = (h: number, title: string, note: string) =>
  `<figure class="fig" style="height:${h}px"><figcaption>${esc(title)}</figcaption><div class="plot"><span>${esc(note)}</span></div></figure>`
const det = (summary: string, body = "Closed by default.") =>
  `<details><summary>${esc(summary)}</summary><div class="inner">${esc(body)}</div></details>`
const badge = (t: string, tone: string) =>
  `<span class="badge ${tone}">${esc(t)}</span>`
const pick = recipes[0] as (typeof recipes)[number]
const spread = `${f(Math.min(...recipes.map((r) => r.cool)), 1)} to ${f(Math.max(...recipes.map((r) => r.cool)), 1)}`
const recipeCard = (
  r: (typeof recipes)[number],
  i: number,
) => `<article class="recipe${i === 0 ? " rec" : ""}" data-recipe>
<header>${badge(r.role, i === 0 ? "go" : "nominal")}<span class="id mono">${esc(r.id)}</span></header>
<p class="big mono">${f(r.cool, 1)} K <small>cooler than bare aluminium</small></p>
<p class="small">parameter uncertainty only: ${f(r.coolLo, 1)} to ${f(r.coolHi, 1)} K</p>
<div class="bar"><i style="left:${(r.coolLo / 20) * 100}%;width:${((r.coolHi - r.coolLo) / 20) * 100}%"></i></div>
<p class="small">Cost position ${f(r.cost, 2)} (relative) ${badge("PROXY", "proxy")}</p>
<p class="small">${esc(r.layers.map((l) => l.split(" ")[0]).join(" · "))} on aluminium</p></article>`

const rows96 = csv("pareto.csv")
  .sort((a, c) => Number(c.pareto_freq) - Number(a.pareto_freq))
  .slice(0, 10)
const table = (head: string[], body: string[][]) =>
  `<div class="tw"><table><thead><tr>${head.map((h) => `<th>${esc(h)}</th>`).join("")}</tr></thead><tbody>${body.map((r) => `<tr>${r.map((c, i) => `<td${i ? ' class="n mono"' : ""}>${esc(c)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`
const ctrl = (id: string) => controls.filter((r) => r.control_id === id)
const c1 = mean(ctrl("C1").map((r) => Number(r.t_max_pred)))
const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Plan 06 page budget skeleton</title>
<style>
@font-face{font-family:Inter;font-weight:400;src:url(fonts/Inter-Regular-subset.woff2) format("woff2")}
@font-face{font-family:Inter;font-weight:600;src:url(fonts/Inter-SemiBold-subset.woff2) format("woff2")}
@font-face{font-family:"JetBrains Mono";font-weight:400;src:url(fonts/JetBrainsMono-Regular-subset.woff2) format("woff2")}
:root{color-scheme:dark;${vars("dark")}--s1:4px;--s2:8px;--s3:12px;--s4:16px;--s6:24px;--s8:32px;--s12:48px;--s16:64px;--c1:${q4.dark.categorical[0]};--base:${q4.dark.baseline}}
:root[data-theme=light]{color-scheme:light;${vars("light")}--c1:${q4.light.categorical[0]};--base:${q4.light.baseline}}
*{box-sizing:border-box}body{margin:0;background:var(--surface-base);color:var(--text-primary);font:400 16px/1.6 Inter,-apple-system,"Segoe UI",sans-serif}
.mono{font-family:"JetBrains Mono",SFMono-Regular,Consolas,monospace}
.shell{display:grid;grid-template-columns:208px minmax(0,1fr);max-width:1280px;margin:0 auto}
nav.rail{position:sticky;top:0;align-self:start;height:100vh;padding:var(--s8) var(--s4);display:flex;flex-direction:column;gap:var(--s2);border-right:1px solid var(--border-panel)}
nav.rail a{color:var(--text-muted);text-decoration:none;min-height:44px;display:flex;align-items:center;font-size:14px}
main{padding:0 var(--s12) var(--s12);min-width:0}
section{padding-top:var(--s12)}h1{font:600 36px/1.15 Inter,sans-serif;margin:0 0 var(--s4);max-width:24ch}h2{font:600 28px/1.2 Inter,sans-serif;margin:0 0 var(--s4)}h3{font:600 16px/1.4 Inter,sans-serif;margin:0 0 var(--s2)}
p{margin:0 0 var(--s3);max-width:70ch;overflow-wrap:anywhere}.small{font-size:13px;color:var(--text-muted);margin:0 0 var(--s2)}.lead{font-size:18px}
.eyebrow{font-size:10px;letter-spacing:3.2px;text-transform:uppercase;color:var(--text-muted);margin:0 0 var(--s3)}
.recipes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s4);margin:var(--s6) 0}
.recipe{background:var(--surface-glass);border:1px solid var(--border-glass);border-radius:16px;padding:var(--s4)}.recipe.rec{border-color:var(--viz-recommended)}
.recipe header{display:flex;justify-content:space-between;align-items:center;margin-bottom:var(--s2)}.big{font-size:30px;line-height:1.2;margin:0}.big small{display:block;font:400 13px/1.4 Inter;color:var(--text-muted)}
.bar{position:relative;height:8px;background:var(--surface-raised);border-radius:4px;margin:var(--s2) 0}.bar i{position:absolute;top:0;height:8px;background:var(--viz-recommended);border-radius:4px}
.badge{display:inline-block;font-size:11px;padding:2px 8px;border-radius:999px;border:1px solid var(--border-control);min-height:20px}.badge.proxy{color:var(--status-proxy)}.badge.go{color:var(--status-go)}
.honesty{border-left:3px solid var(--status-proxy);padding:var(--s2) var(--s4);background:var(--surface-glass);max-width:none;margin:var(--s4) 0}
a{color:var(--link)}.cta{display:inline-flex;align-items:center;min-height:44px;font-weight:600}
.tw{overflow-x:auto;margin:var(--s4) 0}table{border-collapse:collapse;width:100%;font-size:14px}th,td{text-align:left;padding:10px var(--s3);border-bottom:1px solid var(--border-panel);min-height:44px;line-height:24px}th{color:var(--text-muted);font-weight:600;font-size:12px}td.n{text-align:right}
details{border:1px solid var(--border-glass);border-radius:12px;margin:var(--s2) 0}summary{min-height:56px;display:flex;align-items:center;padding:0 var(--s4);cursor:pointer;font-weight:600}.inner{padding:var(--s4)}
.fig{margin:var(--s4) 0;border:1px solid var(--border-panel);border-radius:12px;padding:var(--s4);display:flex;flex-direction:column}.fig figcaption{font-weight:600;margin-bottom:var(--s2)}.plot{flex:1;border-radius:8px;background:repeating-linear-gradient(135deg,transparent 0 10px,var(--border-panel) 10px 11px);display:flex;align-items:center;justify-content:center;color:var(--text-muted);font-size:13px}
.cols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:var(--s6)}.cols p{max-width:none}
.stack{display:flex;flex-direction:column;gap:2px;max-width:420px}.stack div{background:var(--c1);opacity:.85;border-radius:3px}
.ctrls{display:flex;gap:var(--s4);align-items:center;min-height:64px;flex-wrap:wrap}.tile{background:var(--surface-glass);border:1px solid var(--border-glass);border-radius:12px;padding:var(--s3) var(--s4)}.tiles{display:grid;grid-template-columns:repeat(3,1fr);gap:var(--s4);margin:var(--s4) 0}
footer{padding:var(--s8) 0;color:var(--text-muted);font-size:13px}
@media(max-width:1023px){.shell{display:block}nav.rail{position:static;height:auto;flex-direction:row;overflow-x:auto;padding:var(--s2) var(--s4);border:0}main{padding:0 var(--s4) var(--s8)}.recipes,.cols,.tiles{grid-template-columns:1fr}h1{font-size:30px}}
</style></head><body><div class="shell">
<nav class="rail" aria-label="Sections"><strong style="margin-bottom:var(--s4)">Spandek report</strong><a href="#verdict">Verdict</a><a href="#recipes">Recipes</a><a href="#why">Why it works</a><a href="#climate">Climate</a><a href="#budget">Budget</a><a href="#explore">Explore all 96</a><a href="#limits">Method and limits</a><a href="#provenance">Provenance</a></nav>
<main>
<section id="verdict" style="padding-top:var(--s8)"><p class="eyebrow">Spandek aluminium roof coating, digital screening</p>
<h1 data-hero-verdict>Three coatings cool aluminium by ${spread} K in the models; none is measured yet</h1>
<p class="lead">${esc(`${pick.role}: ${pick.id} lowers the peak surface temperature by ${f(pick.cool, 1)} K against bare aluminium (scenario mean over 9 weather scenarios), ranked above 95 other candidates by physical models.`)}</p>
<div class="recipes">${recipes.map(recipeCard).join("")}</div>
<p class="honesty" data-honesty>${esc(blk("overview", 0))}</p>
<a class="cta" href="#limits">Read the limits</a></section>
<section id="recipes"><h2>Recipes</h2><p>${esc(blk("overview", 3))}</p>
${table(["Recipe", "Cooling vs bare Al (K)", "Solar reflectance", "Corrosion (PROXY)", "Delamination (PROXY)", "Cost (PROXY)", "Decision"], [...recipes.map((r) => [`${r.role} ${r.id}`, `${f(r.cool, 1)} [${f(r.coolLo, 1)}, ${f(r.coolHi, 1)}]`, f(r.r, 3), f(r.corr, 3), f(r.delam, 3), f(r.cost, 3), r.decision]), ["Bare aluminium C0", "0.0 (reference)", "0.650", "1.000", "n/a", "0.000", "control"], ["Commercial datasheet C1", `${f(c0 - c1, 1)} (nominal only)`, "0.900", "n/a", "n/a", "n/a", "control"]])}
${recipes.map((r) => det(`Layers and every number of ${r.id}`, r.layers.join(" | "))).join("")}</section>
<section id="why"><h2>Why it works: three layers, three jobs</h2>
<div class="cols"><div><h3>Primer</h3><p>${esc(pick.layers[0] as string)}. Bonds to aluminium and blocks water and ions.</p></div><div><h3>Midcoat</h3><p>${esc(pick.layers[1] as string)}. White pigment scatters sunlight back out; this is where most of the cooling comes from.</p></div><div><h3>Topcoat</h3><p>${esc(pick.layers[2] as string)}. Sheds water and keeps the midcoat clean.</p></div></div>
${fig(260, "Layer thickness of each recipe (micrometres, schematic drawn from the recipe values)", "stack of three layers per recipe")}
${fig(340, `Every recipe peaks ${f(Math.min(...recipes.map((r) => r.cool)), 0)} to ${f(Math.max(...recipes.map((r) => r.cool)), 0)} K cooler than bare aluminium on day 2`, "surface temperature through the day, three recipes against bare aluminium, shared axes")}</section>
<section id="climate"><h2>Indonesian climate: five sites</h2><p>${esc(blk("indonesia", 1).slice(0, 560))}</p>
${fig(400, `${sites[0]?.site} gains most: ${f(sites[0]?.dq ?? 0, 1)} W/m² less heat enters than with bare aluminium (PROXY)`, "five small multiples, benefit by site with p5 to p95 whiskers, shared axis")}
${table(
  [
    "Site",
    "Peak temperature bare Al (°C)",
    "Peak temperature recipe (°C)",
    "Heat-flux benefit (W/m², PROXY)",
  ],
  sites.map((s) => [s.site, f(s.t + s.dq / 1.2, 1), f(s.t, 1), f(s.dq, 1)]),
)}
${det("How the weather was modelled")}${det("Check against the TMYx typical-year files")}${det("Ageing scenario (aged state)")}</section>
<section id="budget"><h2>Budget: what a given spend buys</h2><p>${esc(blk("optimisation", 16))}</p>
<div class="ctrls"><strong>Priority</strong><span class="badge nominal">Cooling first</span><span class="badge go">Balanced</span><span class="badge nominal">Durability first</span><label>Budget <input type="range" min="0" max="1" step="0.01" value="0.42" style="width:240px"></label></div>
<div class="tiles"><div class="tile"><p class="small">Cost (relative units, not IDR)</p><p class="big mono">${f(knee, 2)}</p></div><div class="tile"><p class="small">Cooling vs bare aluminium</p><p class="big mono">${f(pick.cool, 1)} K</p></div><div class="tile"><p class="small">Corrosion index ${badge("PROXY", "proxy")}</p><p class="big mono">${f(pick.corr, 2)}</p></div></div>
${fig(340, `Past a relative cost of ${f(knee, 2)} extra spend buys little cooling (balanced priority)`, "cooling against budget, knee marked")}
<p>${esc(blk("optimisation", 17))}</p>${det("Recipe layers at this budget")}</section>
<section id="explore"><h2>Explore all 96 candidates</h2><p>${esc(blk("explorer", 1))}</p>
<div class="ctrls"><span class="badge nominal">Sort: Pareto frequency</span><span class="badge nominal">Filter: feasible</span><span class="small">Showing 10 of 96</span></div>
${table(
  [
    "Candidate",
    "r_solar",
    "Peak T (°C)",
    "Corrosion (PROXY)",
    "Delam. (PROXY)",
    "Cost (PROXY)",
    "Pareto freq.",
  ],
  rows96.map((r) => [
    r.candidate_id as string,
    f(Number(r.r_solar_pred), 3),
    f(Number(r.t_max_pred), 1),
    f(Number(r.corrosion_proxy), 3),
    f(Number(r.delam_proxy), 3),
    f(Number(r.cost_proxy), 3),
    f(Number(r.pareto_freq), 2),
  ]),
)}
<a class="cta" href="#explore">Show all 96 (card view per row on demand)</a>
${det("Parallel coordinates and scatter matrix (brush to filter)")}${det("Live simulator")}${det("Sensitivity: Sobol and Morris")}${det("Optimisation details: front, tolerance, robust optimum")}</section>
<section id="limits"><h2>Method and limits</h2><p>${esc(blk("limits", 2))}</p>
<div class="cols"><div><h3>What the models cannot say</h3>${[4, 5, 6].map((i) => `<p>${esc(blk("limits", i))}</p>`).join("")}</div><div><h3>Uncertainty</h3>${[7, 8, 9, 10].map((i) => `<p>${esc(blk("limits", i))}</p>`).join("")}</div><div><h3>Not known or not modelled</h3>${[11, 12].map((i) => `<p>${esc(blk("limits", i))}</p>`).join("")}</div></div>
${det("Assumed constants (status: scenario)")}${det("Glossary")}</section>
<section id="provenance"><h2>Provenance</h2><p class="mono small" style="max-width:none">${esc(blk("manifest", 1))}</p>${det("Manifest and file hashes")}</section>
<footer>One offline file. Fonts: Inter and JetBrains Mono (SIL OFL 1.1).</footer>
</main></div></body></html>`
writeFileSync(join(HERE, "skeleton.html"), html)

// ---- 3. measure ----
const measure = async (w: number, theme: "dark" | "light") => {
  const p = await browser.newPage({ viewport: { width: w, height: 800 } })
  await p.goto(`file://${join(HERE, "skeleton.html")}`)
  await p.evaluate(
    (t) => document.documentElement.setAttribute("data-theme", t),
    theme,
  )
  await p.evaluate(() => document.fonts.ready)
  const r = await p.evaluate(() => ({
    h: document.documentElement.scrollHeight,
    sw: document.documentElement.scrollWidth,
    open: document.querySelectorAll("details[open]").length,
    sections: Object.fromEntries(
      [...document.querySelectorAll("section")].map((s) => [
        s.id,
        Math.round(s.getBoundingClientRect().height),
      ]),
    ),
    fonts: [...document.fonts]
      .filter((x) => x.status === "loaded")
      .map((x) => x.family),
  }))
  return { p, r }
}
const dark = await measure(1280, "dark")
expect(dark.r.open === 0, "every <details> is closed in the measured render")
expect(
  dark.r.fonts.includes("Inter") &&
    dark.r.fonts.some((x) => x.includes("JetBrains")),
  "the embedded Inter and JetBrains Mono subsets load in Chrome",
)
expect(
  dark.r.h <= T_PAGE_PX,
  `skeleton height at 1280 px: ${dark.r.h} px <= T_page_px ${T_PAGE_PX} (${Math.round((dark.r.h / T_PAGE_PX) * 100)} % of the budget, ${Math.round((1 - dark.r.h / BASELINE_PX) * 100)} % below the 30,240 px baseline)`,
)
expect(dark.r.h <= BASELINE_PX * 0.3, "H1: at least 70 % below the baseline")
const sectionHeights = dark.r.sections as Record<string, number>
const tall = Object.entries(sectionHeights).filter(([, h]) => h > 1600)
expect(
  tall.length === 0,
  `R9: no section taller than two viewports of 800 px (tallest ${Math.max(...Object.values(sectionHeights))} px)`,
)
const light = await measure(1280, "light")
expect(
  light.r.h === dark.r.h,
  `the light theme renders the same height (${light.r.h} px)`,
)
await light.p.close()
// H2: the first screen
const first = await dark.p.evaluate(() => {
  const vis = (sel: string) => {
    const e = document.querySelector(sel) as HTMLElement | null
    if (!e) return false
    const r = e.getBoundingClientRect()
    return (
      r.top >= 0 &&
      r.bottom <= innerHeight &&
      r.left >= 0 &&
      r.right <= innerWidth
    )
  }
  const recipes = [...document.querySelectorAll("[data-recipe]")]
  return {
    verdict: vis("[data-hero-verdict]"),
    recipes: recipes.length,
    recipesVisible: recipes.filter((e) => {
      const r = e.getBoundingClientRect()
      return r.bottom <= innerHeight && r.top >= 0
    }).length,
    honesty: vis("[data-honesty]"),
    limits: vis("a[href='#limits'].cta"),
  }
})
expect(
  first.verdict &&
    first.recipes === 3 &&
    first.recipesVisible === 3 &&
    first.honesty &&
    first.limits,
  `H2: the verdict, three recipes, honesty statement and limits link all sit in the 1280x800 first screen (${JSON.stringify(first)})`,
)
await dark.p.screenshot({ path: join(HERE, "skeleton-first-screen.png") })
await dark.p.screenshot({
  path: join(HERE, "skeleton-closed.jpg"),
  fullPage: true,
  type: "jpeg",
  quality: 60,
})
await dark.p.close()
const other: Record<string, number> = {}
for (const w of [768, 390]) {
  const m = await measure(w, "dark")
  other[String(w)] = m.r.h
  expect(
    m.r.sw <= w,
    `no horizontal overflow at ${w} px (scrollWidth ${m.r.sw})`,
  )
  await m.p.close()
}
await browser.close()

// ---- 4. the negative control: the same check on the baseline must fail ----
expect(
  base.height > T_PAGE_PX,
  `negative control: the current report (${base.height} px) is over ${T_PAGE_PX} px, so the gate can fail`,
)

const headroom = T_PAGE_PX - dark.r.h
writeFileSync(
  join(HERE, "q1-page-budget.json"),
  `${JSON.stringify({ t_page_px_frozen: T_PAGE_PX, baseline: { height: base.height, sections: base.sections }, skeleton: { height_1280: dark.r.h, height_768: other["768"], height_390: other["390"], sections: sectionHeights, headroom_px: headroom, headroom_pct: Math.round((headroom / T_PAGE_PX) * 100), reduction_vs_baseline_pct: Math.round((1 - dark.r.h / BASELINE_PX) * 100) } }, null, 2)}\n`,
)
console.log(
  JSON.stringify({ skeleton: dark.r.h, sections: sectionHeights, other }),
)
process.exit(fails.length ? 1 : 0)

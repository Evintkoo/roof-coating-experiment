import { createHash } from "node:crypto"
import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { ConfigError, DataError, SpandekError } from "../../core/errors"
import type { ModelContext } from "../../core/pipeline/context"
import { contextToJson } from "../../core/pipeline/contextJson"
import {
  type CurvesJson,
  type ObjRow,
  PARETO_COLUMNS,
  parseParetoCsv,
  parseSensCsv,
  type SensRow,
  type SpectraJson,
  shortlistFromPareto,
  validateCurves,
  validateSpectra,
} from "../../core/pipeline/tables"
import { parseResultsCsv, type ResultRow } from "../../core/schema"
import { axisLabel } from "../../web/figures"
import { fmtValue } from "../../web/fmt"
import { loadContext } from "../context"
import { emit } from "../logging"
import { STATIC_LIMITS, scenarioConstants } from "./cards"
import { indonesiaSection } from "./indonesia"
import { optimisationSection } from "./optimisation"

/** T_size_mb: the page must stay well under the 16 MB artifact limit. */
export const T_SIZE_MB = 8
const WEB = join(import.meta.dir, "..", "..", "web")
const REPO = join(import.meta.dir, "..", "..", "..")

export type BuildOpts = { runId: string; configDir: string; dataDir: string }

/** Everything a section renderer may read: the validated files of the run directory plus the loaded model context. */
export type ReportInput = {
  dir: string
  runId: string
  meta: { seed: number; n_mc: number; run_id: string }
  manifest: Record<string, unknown>
  results: ResultRow[]
  pareto: ObjRow[]
  sens: SensRow[]
  curves: CurvesJson
  spectra: SpectraJson
  cards: { name: string; text: string }[]
  ctx: ModelContext
  shortlist: Record<string, string>
}

/**
 * Extension point (plans 4 and 5): a section is a function of the input. `render` returns the section's HTML (or null to omit the
 * section: absent optional files are never an error) and `data` the JSON the page script reads from window.__SPANDEK__.ext[id].
 * Sections are placed by `order`; the built-in ones use 10, 20, ..., 90, so a later plan picks a number in between.
 */
export type ReportSection = {
  id: string
  title: string
  order: number
  render: (input: ReportInput) => string | null
  data?: (input: ReportInput) => unknown
  /** false: no link in the top bar (default true). */
  nav?: boolean
}

// ---- small helpers ----

export const esc = (s: string): string =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

const sha = (b: Uint8Array | string) =>
  createHash("sha256").update(b).digest("hex")

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys)
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) out[k] = sortKeys(o[k])
    return out
  }
  return v
}

import { safeJson } from "../../core/json"

/** JSON for a script block: sorted keys, safeJson (no NaN or Infinity), and "<" as < so no tag or comment can start inside it. */
export function dataJson(v: unknown): string {
  return safeJson(sortKeys(v)).replaceAll("<", "\\u003c")
}

/** JavaScript for a script block: "</script" can never close the element. */
const scriptSafe = (js: string): string =>
  js.replace(/<\/(script)/gi, "<\\/$1").replaceAll("<!--", "<\\!--")

function refuse(code: string, key: string, e: SpandekError): never {
  emit("report.refused", "error", { code, key })
  throw e
}

function readFile(dir: string, name: string): string {
  const p = join(dir, name)
  if (!existsSync(p))
    refuse(
      "missing_input",
      name,
      new DataError(name, `${name} not found in the report input directory`),
    )
  return readFileSync(p, "utf8")
}

function parseJson(text: string, name: string): unknown {
  try {
    return JSON.parse(text)
  } catch {
    return refuse(
      "invalid_input",
      name,
      new ConfigError(name, "not valid JSON"),
    )
  }
}

// ---- a deliberately small Markdown renderer for the candidate cards (headings, paragraphs, lists, tables) ----

export function renderMarkdown(md: string): string {
  const out: string[] = []
  const lines = md.split("\n")
  let i = 0
  const cells = (l: string) =>
    l
      .trim()
      .replace(/^\||\|$/g, "")
      .split("|")
      .map((c) => c.trim())
  while (i < lines.length) {
    const l = lines[i] as string
    if (l.trim() === "") {
      i++
    } else if (/^#{1,6} /.test(l)) {
      const n = Math.min(6, (l.match(/^#+/) as RegExpMatchArray)[0].length + 1)
      out.push(`<h${n}>${esc(l.replace(/^#+ /, ""))}</h${n}>`)
      i++
    } else if (l.startsWith("|")) {
      const rows: string[][] = []
      while (i < lines.length && (lines[i] as string).startsWith("|")) {
        const r = cells(lines[i] as string)
        if (!r.every((c) => /^:?-{3,}:?$/.test(c))) rows.push(r)
        i++
      }
      const [head, ...body] = rows
      out.push(
        `<div class="scroll"><table><thead><tr>${(head ?? []).map((c) => `<th>${esc(c)}</th>`).join("")}</tr></thead><tbody>${body
          .map(
            (r) =>
              `<tr>${r.map((c, k) => `<td${k === 0 ? "" : ' class="txt"'}>${esc(c)}</td>`).join("")}</tr>`,
          )
          .join("")}</tbody></table></div>`,
      )
    } else if (l.startsWith("- ")) {
      const items: string[] = []
      while (i < lines.length && (lines[i] as string).startsWith("- ")) {
        items.push(`<li>${esc((lines[i] as string).slice(2))}</li>`)
        i++
      }
      out.push(`<ul>${items.join("")}</ul>`)
    } else {
      const para: string[] = []
      while (
        i < lines.length &&
        (lines[i] as string).trim() !== "" &&
        !/^(#{1,6} |\||- )/.test(lines[i] as string)
      ) {
        para.push(lines[i] as string)
        i++
      }
      out.push(`<p>${esc(para.join(" "))}</p>`)
    }
  }
  return out.join("\n")
}

// ---- built-in sections ----

const mean = (xs: readonly number[]): number =>
  xs.reduce((a, b) => a + b, 0) / xs.length

function scenarioMean(
  rows: readonly ResultRow[],
  col: "r_solar" | "t_max" | "corrosion_proxy" | "delam_proxy",
): [number, number, number] {
  const p =
    col === "corrosion_proxy" || col === "delam_proxy" ? col : `${col}_pred`
  const lo =
    col === "corrosion_proxy" || col === "delam_proxy"
      ? `${col}_lo`
      : `${col}_lo`
  const hi = `${col}_hi`
  const g = (k: string) =>
    mean(rows.map((r) => (r as unknown as Record<string, number>)[k] as number))
  return [g(p), g(lo), g(hi)]
}

const interval = (t: [number, number, number], d = 3): string =>
  `${fmtValue(t[0], d)} [${fmtValue(t[1], d)}, ${fmtValue(t[2], d)}]`

const ROLE_NAME: Record<string, string> = {
  high_performing: "High performing",
  balanced: "Balanced",
  low_cost: "Low cost",
}

function decisionOf(cardText: string): string {
  const m = /### Decision\s+(\w+)/.exec(cardText)
  return m ? (m[1] as string) : "not stated"
}

const sec = (id: string, title: string, body: string): string =>
  `<section id="${id}" aria-labelledby="h-${id}">\n<h2 id="h-${id}">${esc(title)}</h2>\n${body}\n</section>`

const overview: ReportSection = {
  id: "overview",
  title: "Overview",
  order: 10,
  render: (i) =>
    `<section id="overview" aria-labelledby="h-overview">
<h1 id="h-overview">Spandek coating experiment: digital screening report</h1>
<div class="banner" role="note">
<p><strong>PROXY results.</strong> Every number here is a prediction from uncalibrated scenario models of the initial, as-applied state. Indices marked PROXY are relative rankings, not measurements. Intervals show parameter uncertainty only (p5 to p95 over ${i.meta.n_mc} uncertainty draws); they leave out model-form error and are not prediction intervals for a real roof.</p>
</div>
<p class="meta">Run <code>${esc(i.runId)}</code> · seed ${i.meta.seed} · ${i.meta.n_mc} draws · manifest core hash <code>${esc(String(i.manifest.core_sha256 ?? "unavailable"))}</code></p>
<div class="cols">
<div class="card"><h3>What this is</h3><p>A screening of 96 candidate coating stacks (primer, midcoat, topcoat on aluminium) by physical models, a live simulator that re-runs the same models in your browser, and a results explorer. It ranks candidates for the next laboratory step.</p></div>
<div class="card"><h3>What this is not</h3><p>It is not a laboratory result and it does not show that any coating works on a roof. A "go" decision means a candidate is worth a coupon test, nothing more. Weathering, ageing and adhesion are not modelled.</p></div>
</div>
</section>`,
}

const live: ReportSection = {
  id: "live",
  title: "Live simulator",
  order: 20,
  render: (i) =>
    `<section id="live" aria-labelledby="h-live">
<h2 id="h-live">Live simulator</h2>
<p>Move a slider and the models run again in your browser. Bands are p5 to p95 over 32 uncertainty draws (this run's batch used ${i.meta.n_mc}); controls C0 and C1 are nominal only. Every index marked PROXY is a relative ranking, not a measurement.</p>
<div id="live-root" class="live" data-requested="0" data-shown="0">
<div id="live-controls" class="live-controls"></div>
<div class="live-out">
<p id="live-status" class="hint" role="status" aria-live="polite"></p>
<div id="live-tiles" class="tiles"></div>
<div id="fig-live-tofT" class="fig" role="img" aria-label="Live day-2 surface temperature with p5 to p95 band and controls"></div>
<div id="fig-live-spectrum" class="fig" role="img" aria-label="Live reflectance spectrum with p5 to p95 band"></div>
</div>
</div>
<details id="debug"><summary>Debug: last events and timings</summary>
<p id="debug-timing" class="hint">No live update yet.</p>
<pre id="debug-events"></pre>
</details>
</section>`,
}

const summary: ReportSection = {
  id: "summary",
  title: "Summary",
  order: 30,
  render: (i) => {
    const rows = Object.entries(i.shortlist)
      .map(([role, id]) => {
        const rs = i.results.filter((r) => r.candidate_id === id)
        const p = i.pareto.find((q) => q.candidate_id === id)
        const card = i.cards.find((c) => c.name.includes(id))
        return `<tr><td class="txt">${esc(ROLE_NAME[role] ?? role)}</td><td class="txt">${esc(id)}</td><td>${interval(scenarioMean(rs, "r_solar"))}</td><td>${interval(scenarioMean(rs, "t_max"), 1)}</td><td>${interval(scenarioMean(rs, "corrosion_proxy"))}</td><td>${interval(scenarioMean(rs, "delam_proxy"))}</td><td>${fmtValue(p?.cost_proxy ?? Number.NaN)}</td><td>${fmtValue(p?.pareto_freq ?? Number.NaN, 2)}</td><td class="txt">${esc(decisionOf(card?.text ?? ""))}</td></tr>`
      })
      .join("\n")
    return sec(
      "summary",
      "Summary: three shortlisted candidates",
      `<p class="hint">Scenario means over the weather scenarios with the p5 to p95 interval in brackets. Cost is nominal only.</p>
<div class="scroll"><table><thead><tr><th>Role</th><th>Candidate</th><th>${esc(axisLabel("r_solar_pred"))}</th><th>${esc(axisLabel("t_max_pred"))}</th><th>${esc(axisLabel("corrosion_proxy"))}</th><th>${esc(axisLabel("delam_proxy"))}</th><th>${esc(axisLabel("cost_proxy"))}</th><th>${esc(axisLabel("pareto_freq"))}</th><th>Decision</th></tr></thead><tbody>
${rows}
</tbody></table></div>`,
    )
  },
}

const explorer: ReportSection = {
  id: "explorer",
  title: "Explorer",
  order: 40,
  render: (i) => {
    const scen = [...new Set(i.curves.series.map((s) => s.scenario_id))].sort()
    const head = PARETO_COLUMNS.map(
      (c) => `<th scope="col">${esc(axisLabel(c))}</th>`,
    ).join("")
    const body = i.pareto
      .map((r) => {
        const cells = PARETO_COLUMNS.map((c) => {
          const v = (r as unknown as Record<string, string | number | boolean>)[
            c
          ]
          if (typeof v === "number")
            return `<td data-col="${c}">${fmtValue(v, 4)}</td>`
          return `<td class="txt" data-col="${c}">${esc(String(v))}</td>`
        }).join("")
        return `<tr data-id="${esc(r.candidate_id)}">${cells}</tr>`
      })
      .join("\n")
    return sec(
      "explorer",
      "Explorer",
      `<p>Drag on an axis of the parallel-coordinates plot to select candidates; the scatter matrix dims the rest and the table lists exactly the selected ones. Line colour is the share of uncertainty draws in which the candidate is on the Pareto front.</p>
<div id="fig-parcoords" class="fig tall" role="img" aria-label="Parallel coordinates of the five objectives"></div>
<div id="fig-splom" class="fig tall" role="img" aria-label="Scatter matrix of the five objectives"></div>
<p id="tbl-count" class="hint" aria-live="polite">${i.pareto.length} of ${i.pareto.length} candidates</p>
<div class="scroll"><table id="tbl-explorer"><thead><tr>${head}</tr></thead><tbody>
${body}
<tr id="tbl-empty" hidden><td class="txt" colspan="${PARETO_COLUMNS.length}">No candidates match the current selection.</td></tr>
</tbody></table></div>
<h3>Temperature and reflectance of the shortlist</h3>
<div class="controls"><label for="sel-scenario">Weather scenario</label><select id="sel-scenario">${scen.map((s) => `<option>${esc(s)}</option>`).join("")}</select></div>
<div id="fig-tofT" class="fig" role="img" aria-label="Day-2 surface temperature with p5 to p95 bands"></div>
<div id="fig-spectrum" class="fig" role="img" aria-label="Reflectance spectra with p5 to p95 bands"></div>`,
    )
  },
}

const cards: ReportSection = {
  id: "cards",
  title: "Candidate cards",
  order: 50,
  render: (i) =>
    sec(
      "cards",
      "Candidate cards",
      i.cards
        .map(
          (c) =>
            `<article id="card-${esc(c.name.replace(/\.md$/, ""))}">\n${renderMarkdown(c.text)}\n</article>`,
        )
        .join("\n"),
    ),
}

const sensitivity: ReportSection = {
  id: "sensitivity",
  title: "Sensitivity",
  order: 60,
  render: (i) => {
    const outs = [...new Set(i.sens.map((s) => s.output))].sort()
    return sec(
      "sensitivity",
      "Sensitivity",
      `<p>Sobol indices (error bars: 95 % confidence half-width of the estimate) and Morris screening for the full stack over eleven inputs.</p>
${outs
  .map(
    (o) =>
      `<h3>${esc(axisLabel(o))}</h3>\n<div id="fig-sobol-${esc(o)}" class="fig" role="img" aria-label="Sobol indices for ${esc(o)}"></div>\n<div id="fig-morris-${esc(o)}" class="fig" role="img" aria-label="Morris screening for ${esc(o)}"></div>`,
  )
  .join("\n")}`,
    )
  },
}

const limits: ReportSection = {
  id: "limits",
  title: "Methods and limits",
  order: 80,
  render: (i) =>
    sec(
      "limits",
      "Methods and limits",
      `<h3>Methods</h3>
<p>Optics: Mie scattering of TiO2 and BaSO4 pigments in a binder, a two-flux film model and the ASTM G173 spectrum. Heat: a one-dimensional surface balance (radiation, convection, conduction into the building) over two simulated days; the second day is shown. Indices for corrosion, water repellence, delamination and cost are PROXY numbers from simple relations, not calibrated against experiments. Uncertainty: ${i.meta.n_mc} Latin-hypercube draws of the uncertain material constants; intervals are p5 to p95 widened to include the nominal value.</p>
<h3>Limits</h3>
<ul>${STATIC_LIMITS.map((l) => `<li>${esc(l)}</li>`).join("")}</ul>
<h3>Assumed constants (status: scenario)</h3>
<ul>${scenarioConstants(i.ctx)
        .map(
          (k) =>
            `<li><code>${esc(k.path)}</code> = ${esc(k.value)}${k.unit ? ` ${esc(k.unit)}` : ""}</li>`,
        )
        .join("")}</ul>`,
    ),
}

const manifestSection: ReportSection = {
  id: "manifest",
  title: "Manifest",
  order: 90,
  render: (i) => {
    const files = (i.manifest.files ?? []) as {
      path: string
      sha256: string
      bytes: number
    }[]
    const v = (i.manifest.versions ?? {}) as Record<string, string>
    return sec(
      "manifest",
      "Manifest",
      `<p class="meta">Run <code>${esc(i.runId)}</code> · core hash <code>${esc(String(i.manifest.core_sha256 ?? ""))}</code> · commit <code>${esc(String(i.manifest.git_commit ?? ""))}</code> · Bun ${esc(String(v.bun ?? ""))}</p>
<div class="scroll"><table><thead><tr><th>File</th><th>Bytes</th><th>SHA-256</th></tr></thead><tbody>
${files.map((f) => `<tr><td class="txt">${esc(f.path)}</td><td>${f.bytes}</td><td class="txt"><code>${esc(f.sha256)}</code></td></tr>`).join("\n")}
</tbody></table></div>`,
    )
  },
}

/** The built-in sections; later plans append to this list (or pass their own to buildReport). */
export const BUILTIN_SECTIONS: readonly ReportSection[] = [
  overview,
  live,
  summary,
  explorer,
  cards,
  sensitivity,
  limits,
  manifestSection,
]

/**
 * Sections that later plans add (for example Indonesia, plan 4): push a ReportSection here before calling buildReport.
 * The Optimisation (plan 5) and Indonesia (plan 4) sections are always offered; each renders only when its outputs are in the input directory.
 */
export const EXTRA_SECTIONS: ReportSection[] = []

// ---- bundling ----

async function bundle(entry: string): Promise<string> {
  const out = await Bun.build({
    entrypoints: [join(WEB, entry)],
    target: "browser",
    format: "iife",
    minify: false,
    root: REPO,
  })
  if (!out.success)
    throw new SpandekError(
      4,
      "report.bundle",
      entry,
      `bundling ${entry} failed: ${out.logs.map(String).join("; ")}`,
    )
  const text = await (out.outputs[0] as Blob).text()
  emit("report.bundle_built", "debug", {
    entry,
    bytes: Buffer.byteLength(text),
  })
  if (/\bconsole\./.test(text))
    throw new SpandekError(
      4,
      "report.bundle",
      entry,
      `${entry} bundle contains console.*`,
    )
  return text
}

const fill = (tpl: string, vars: Record<string, string>): string =>
  tpl.replace(
    /\{\{(raw:)?(\w+)\}\}/g,
    (_m, raw: string | undefined, k: string) => {
      const v = vars[k]
      if (v === undefined)
        throw new Error(`template placeholder ${k} has no value`)
      return raw ? v : esc(v)
    },
  )

/**
 * Plan 00 Task 4: validate the run directory, bundle the page script and the worker, and write one self-contained HTML file
 * (Plotly, CSS, data and model context inlined; no network). Refuses with a SpandekError before writing anything:
 * missing input (5), interval order or any invalid table (2), a page over T_SIZE_MB (2). The write is atomic; returns the file's sha256.
 */
export async function buildReport(
  inDir: string,
  outPath: string,
  opts: BuildOpts,
): Promise<string> {
  const names = [
    "run_meta.json",
    "results.csv",
    "pareto.csv",
    "sensitivity.csv",
    "curves.json",
    "spectra.json",
    "run_manifest.json",
  ]
  const text: Record<string, string> = {}
  for (const n of names) text[n] = readFile(inDir, n)
  emit("report.build_start", "info", {
    inputs: names.join(","),
    ...Object.fromEntries(
      names.map((n) => [
        `sha_${n.replace(/\W/g, "_")}`,
        sha(text[n] as string),
      ]),
    ),
  })

  const cardDir = join(inDir, "candidate_cards")
  const cardFiles = existsSync(cardDir)
    ? readdirSync(cardDir)
        .filter((f) => f.endsWith(".md"))
        .sort()
    : []
  if (cardFiles.length === 0)
    refuse(
      "missing_input",
      "candidate_cards",
      new DataError(
        "candidate_cards",
        "no candidate cards in the input directory",
      ),
    )
  const cards = cardFiles.map((name) => ({
    name,
    text: readFileSync(join(cardDir, name), "utf8"),
  }))

  let input: ReportInput
  try {
    const meta = parseJson(
      text["run_meta.json"] as string,
      "run_meta.json",
    ) as ReportInput["meta"]
    const results = parseResultsCsv(text["results.csv"] as string)
    const pareto = parseParetoCsv(text["pareto.csv"] as string)
    const sens = parseSensCsv(text["sensitivity.csv"] as string)
    const curves = validateCurves(
      parseJson(text["curves.json"] as string, "curves.json"),
    )
    const spectra = validateSpectra(
      parseJson(text["spectra.json"] as string, "spectra.json"),
    )
    const manifest = parseJson(
      text["run_manifest.json"] as string,
      "run_manifest.json",
    ) as Record<string, unknown>
    const ctx = await loadContext(opts.configDir, opts.dataDir)
    input = {
      dir: inDir,
      runId: opts.runId,
      meta,
      manifest,
      results,
      pareto,
      sens,
      curves,
      spectra,
      cards,
      ctx,
      shortlist: shortlistFromPareto(pareto),
    }
  } catch (e) {
    if (e instanceof SpandekError) {
      emit("report.refused", "error", {
        code: /_(lo|hi)$/.test(e.key ?? "")
          ? "interval_order"
          : "invalid_input",
        key: e.key ?? "",
      })
    }
    throw e
  }

  const sections = [
    ...BUILTIN_SECTIONS,
    optimisationSection,
    indonesiaSection,
    ...EXTRA_SECTIONS,
  ]
    .map((s) => ({ s, html: s.render(input) }))
    .filter((x): x is { s: ReportSection; html: string } => x.html !== null)
    .sort((a, b) => a.s.order - b.s.order || (a.s.id < b.s.id ? -1 : 1))
  const nav = sections
    .filter(({ s }) => s.nav !== false)
    .map(
      ({ s }) =>
        `<a href="#${s.id}">${esc(s.id === "limits" ? "Limits" : s.title)}</a>`,
    )
    .join("\n")
  const ext: Record<string, unknown> = {}
  for (const { s } of sections) if (s.data) ext[s.id] = s.data(input)

  const [mainJs, workerJs] = [
    await bundle("main.ts"),
    await bundle("worker.ts"),
  ]
  const plotly = readFileSync(
    join(REPO, "node_modules", "plotly.js-dist-min", "plotly.min.js"),
    "utf8",
  )
  const css = readFileSync(join(WEB, "theme.css"), "utf8")
  const tpl = readFileSync(join(WEB, "template.html"), "utf8")
  const g = input.ctx.g173
  const data = {
    meta: {
      run_id: input.runId,
      core_sha256: String(input.manifest.core_sha256 ?? ""),
      n_mc: input.meta.n_mc,
      seed: input.meta.seed,
    },
    pareto: input.pareto,
    shortlist: input.shortlist,
    curves: input.curves,
    spectra: input.spectra,
    sens: input.sens,
    outputs: [...new Set(input.sens.map((s) => s.output))].sort(),
    g173: {
      wl_um: Array.from(g.wl_um),
      irradiance_w_m2_um: Array.from(g.irradiance_w_m2_um),
    },
    ctxJson: contextToJson(input.ctx),
    workerSrc: scriptSafe(workerJs),
    ext,
  }
  let dataText: string
  try {
    dataText = dataJson(data)
  } catch (e) {
    if (e instanceof SpandekError)
      emit("report.refused", "error", {
        code: "nonfinite_json",
        key: e.key ?? "",
      })
    throw e
  }
  const html = fill(tpl, {
    title: `Spandek screening report ${input.runId}`,
    css,
    nav,
    sections: sections.map((x) => x.html).join("\n"),
    data: dataText,
    plotly: scriptSafe(plotly),
    main: scriptSafe(mainJs),
  })
  const bytes = Buffer.byteLength(html)
  if (bytes > T_SIZE_MB * 1024 * 1024)
    refuse(
      "size_over_limit",
      "report.html",
      new ConfigError(
        "size_over_limit",
        `report would be ${(bytes / 1048576).toFixed(1)} MB, limit ${T_SIZE_MB} MB`,
      ),
    )
  const tmp = `${outPath}.tmp`
  try {
    writeFileSync(tmp, html)
    renameSync(tmp, outPath)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  const digest = sha(html)
  emit("report.html_written", "info", {
    path:
      dirname(outPath) === "."
        ? outPath
        : (outPath.split("/").pop() ?? outPath),
    bytes,
    sha256: digest,
  })
  return digest
}

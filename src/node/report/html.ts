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
import { buildScreeningData } from "../../core/anim/screening"
import { weatherL9 } from "../../core/design"
import { ConfigError, DataError, SpandekError } from "../../core/errors"
import type { ModelContext } from "../../core/pipeline/context"
import { contextToJson } from "../../core/pipeline/contextJson"
import {
  type ControlRow,
  type CurvesJson,
  type ObjRow,
  parseControlsCsv,
  parseParetoCsv,
  parseSensCsv,
  type SensRow,
  type SpectraJson,
  shortlistFromPareto,
  validateCurves,
  validateSpectra,
} from "../../core/pipeline/tables"
import { parseResultsCsv, type ResultRow } from "../../core/schema"
import { PAGE_CSS } from "../../web/design/pageCss"
import { COMPONENT_SCRIPT } from "../../web/design/scripts"
import { reportDocument } from "../../web/design/templates/reportPage"
import { loadContext } from "../context"
import { emit } from "../logging"
import { READING_PATH, SECTION_LABEL } from "./content"
import { buildDesignAssets } from "./design"
import { indonesiaSection } from "./indonesia"
import { lintPage, registeredHooks } from "./lint"
import { optimisationSection } from "./optimisation"
import { watchSection } from "./watch"

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
  /** controls.csv (C0 to C3, nominal only), read after its hash was checked against the manifest. */
  controls: ControlRow[]
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
  /** false: no link in the rail (default true). */
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

export function renderMarkdown(
  md: string,
  o: { levels?: (hashes: number) => number } = {},
): string {
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
      const hashes = (l.match(/^#+/) as RegExpMatchArray)[0].length
      const n = Math.min(6, o.levels ? o.levels(hashes) : hashes + 1)
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

/** The built-in reading path (Verdict, Recipes, How the layers work, Explore, Method and limits, Provenance); later plans add sections between. */
export const BUILTIN_SECTIONS: readonly ReportSection[] = READING_PATH

/**
 * Sections that later plans add (for example Indonesia, plan 4): push a ReportSection here before calling buildReport.
 * The Budget (plan 5) and Indonesian climate (plan 4) sections are always offered; each renders only when its outputs are in the input directory.
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
    "controls.csv",
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
    const controlsText = text["controls.csv"] as string
    const listed = (
      (manifest.files ?? []) as { path: string; sha256: string }[]
    ).find((f) => f.path === "controls.csv")
    if (listed && listed.sha256 !== sha(controlsText))
      refuse(
        "tampered_input",
        "controls.csv",
        new DataError(
          "controls.csv",
          "controls.csv does not match the hash in run_manifest.json",
        ),
      )
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
      controls: parseControlsCsv(controlsText),
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
    watchSection,
    optimisationSection,
    indonesiaSection,
    ...EXTRA_SECTIONS,
  ]
    .map((s) => ({ s, html: s.render(input) }))
    .filter((x): x is { s: ReportSection; html: string } => x.html !== null)
    .sort((a, b) => a.s.order - b.s.order || (a.s.id < b.s.id ? -1 : 1))
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
  const design = buildDesignAssets({
    vendorRoot: join(REPO, "vendor"),
    fontsDir: join(REPO, "src", "node", "report", "fonts"),
    componentCount: sections.length,
  })
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
    /** plan 07 Task 4: designs, scenarios and the batch nominal values the live screening runs on and is checked against (H7). */
    screening: buildScreeningData(input.results, weatherL9(input.ctx.weather)),
    workerSrc: scriptSafe(workerJs),
    ext,
    plotThemes: design.plotThemes,
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
  const html = reportDocument({
    title: `Spandek screening report ${input.runId}`,
    core: String(input.manifest.core_sha256 ?? "").replace(/[^0-9a-f]/g, ""),
    css: `${design.fontCss}\n${design.css}${PAGE_CSS}`,
    brand: "Spandek screening",
    sections: sections.map(({ s, html }) => ({
      id: s.id,
      label: SECTION_LABEL[s.id] ?? s.title,
      html,
      ...(s.nav === false ? { nav: false } : {}),
    })),
    scripts: [
      `window.__SPANDEK__ = ${dataText}`,
      scriptSafe(plotly),
      scriptSafe(`${COMPONENT_SCRIPT}\n${mainJs}`),
    ],
  })
  const issues = lintPage(html, registeredHooks(COMPONENT_SCRIPT, mainJs))
  for (const x of issues)
    emit("page.lint.failed", "error", { rule: x.rule, id: x.id })
  if (issues.length > 0) {
    const first = issues[0] as (typeof issues)[number]
    throw new SpandekError(
      4,
      "report.lint",
      first.rule,
      `the generated page has ${issues.length} lint issue(s); first: ${first.rule} ${first.id}`,
    )
  }
  const bytes = Buffer.byteLength(html)
  design.done(bytes)
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

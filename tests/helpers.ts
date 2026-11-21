// Shared test helpers; later tasks add to this file.
import {
  cpSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join, relative } from "node:path"
import { parse, stringify } from "yaml"

export const repoRoot = join(import.meta.dir, "..")

/** Recursively list files under dir (relative POSIX paths), [] if dir is missing. */
export function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(dir, p).split("\\").join("/"))
    }
  }
  try {
    statSync(dir)
  } catch {
    return out
  }
  walk(dir)
  return out.sort()
}

export const mirrorOf = (src: string) => src.replace(/\.ts$/, ".test.ts")

/** Source files lacking a mirror test (tests/<path>.test.ts). */
export function missingMirrors(
  srcFiles: string[],
  testFiles: string[],
  noMirrorNeeded: Set<string>,
): string[] {
  return srcFiles
    .filter((f) => !noMirrorNeeded.has(f))
    .filter((f) => !testFiles.includes(mirrorOf(f)))
}

/** `X.proof.test.ts` is the full-size twin of `X.test.ts`; it is judged by the fast file it pairs with. */
export const PROOF_SUFFIX = ".proof.test.ts"
export const fastTwinOf = (t: string) =>
  t.endsWith(PROOF_SUFFIX) ? `${t.slice(0, -PROOF_SUFFIX.length)}.test.ts` : t

/** Test files that neither mirror a source file nor are whitelisted (a proof file is judged as its fast twin). */
export function orphanTests(
  srcFiles: string[],
  testFiles: string[],
  nonMirror: Set<string>,
): string[] {
  const srcSet = new Set(srcFiles.map(mirrorOf))
  return testFiles.filter((t) => {
    const f = fastTwinOf(t)
    return !nonMirror.has(f) && !srcSet.has(f)
  })
}

/** Proof files without a fast twin in the same directory. */
export function proofWithoutFastTwin(testFiles: string[]): string[] {
  const all = new Set(testFiles)
  return testFiles.filter(
    (t) => t.endsWith(PROOF_SUFFIX) && !all.has(fastTwinOf(t)),
  )
}

// ---- CLI helpers (Task 8) ----
const DESIGN_NUM = [
  "primer_gptes_molfrac",
  "primer_dft_um",
  "midcoat_pvc",
  "midcoat_tio2_fraction",
  "midcoat_dft_um",
  "topcoat_mtes_molfrac",
  "topcoat_dft_um",
] as const

const ymlOf = (f: string) =>
  parse(readFileSync(join(repoRoot, "configs", f), "utf8"))

/** The seven design ranges, read from the real YAML. */
export const RANGE_COLUMNS: [string, { min: number; max: number }][] =
  DESIGN_NUM.map((c) => {
    const r = ymlOf("material_ranges.yaml")[c]
    return [c, { min: r.min as number, max: r.max as number }]
  })

/** Copy configs/ to a temp dir and set (or delete, when value is undefined) exactly one dotted key. */
export async function copyConfigWith(
  dotKey: string,
  value: unknown,
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "spandek-cfg-"))
  cpSync(join(repoRoot, "configs"), dir, { recursive: true })
  const path = dotKey.split(".")
  const first = path[0] as string
  const file =
    first in ymlOf("weather_scenarios.yaml")
      ? "weather_scenarios.yaml"
      : "material_ranges.yaml"
  const doc = parse(readFileSync(join(dir, file), "utf8"))
  let node = doc
  for (const k of path.slice(0, -1)) node = node[k]
  const last = path[path.length - 1] as string
  if (value === undefined) delete node[last]
  else node[last] = value
  writeFileSync(join(dir, file), stringify(doc))
  return dir
}

export type RunResult = {
  exitCode: number
  stdout: string
  stderr: string
  runDir: string
}

/** Run the real CLI in a subprocess; logs go to a fresh reports dir (SPANDEK_REPORTS_DIR). */
export async function run(
  args: string[],
  env: Record<string, string> = {},
): Promise<RunResult> {
  const reports = mkdtempSync(join(tmpdir(), "spandek-rep-"))
  const p = Bun.spawn(["bun", "run", "src/node/cli.ts", ...args], {
    cwd: repoRoot,
    env: { ...process.env, SPANDEK_REPORTS_DIR: reports, ...env },
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, exitCode] = await Promise.all([
    new Response(p.stdout).text(),
    new Response(p.stderr).text(),
    p.exited,
  ])
  const sub = readdirSync(reports)[0]
  return { exitCode, stdout, stderr, runDir: sub ? join(reports, sub) : "" }
}

export function events(r: { runDir: string }): Record<string, unknown>[] {
  if (!r.runDir) return []
  return readFileSync(join(r.runDir, "run.jsonl"), "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
    .map((l) => JSON.parse(l) as Record<string, unknown>)
}

/** Last event with this name in run.jsonl; throws when absent. */
export function lastEvent(
  r: { runDir: string },
  name: string,
): Record<string, unknown> {
  const hit = events(r).filter((e) => e.event === name)
  const e = hit[hit.length - 1]
  if (!e) throw new Error(`no ${name} event`)
  return e
}

/** Relative error |a - b| / |b| (absolute when b = 0). */
export function relErr(a: number, b: number): number {
  return b === 0 ? Math.abs(a) : Math.abs(a - b) / Math.abs(b)
}

/**
 * A real plan-3 output directory (design, simulate, optimize) for seed `seed` with `nMc` draws, built by the real CLI.
 * Not the whole `run` pipeline: refine needs only run_meta.json, results.csv, draws.csv and pareto.csv.
 */
export async function buildPlan3(
  out: string,
  seed = "20261121",
  nMc = "16",
): Promise<void> {
  const base = ["--max-load", "1000"]
  for (const args of [
    ["design", "--seed", seed, "--out", out],
    ["simulate", "--design", out, "--out", out, "--seed", seed, "--n-mc", nMc],
    ["optimize", "--in", out],
  ]) {
    const r = await run([...args, ...base])
    if (r.exitCode !== 0) throw new Error(`${args[0]} failed: ${r.stderr}`)
  }
}

// ---- report helpers (plan 00 Task 4) ----

let testRun: Promise<string> | undefined

/** A finished real `run` (4 draws) in a temp dir, built once per test file by the real CLI. Never mutate it: use copyRun. */
export function buildTestRun(): Promise<string> {
  testRun ??= (async () => {
    const out = mkdtempSync(join(tmpdir(), "spandek-run-"))
    const r = await run([
      "run",
      "--seed",
      "20261121",
      "--out",
      out,
      "--n-mc",
      "4",
      "--max-load",
      "1000",
    ])
    if (r.exitCode !== 0) throw new Error(`run failed: ${r.stderr}`)
    return out
  })()
  return testRun
}

/** A private copy of the test run, for tests that edit one input. */
export async function copyRun(): Promise<string> {
  const src = await buildTestRun()
  const dst = mkdtempSync(join(tmpdir(), "spandek-run-copy-"))
  cpSync(src, dst, { recursive: true })
  return dst
}

export const reportOpts = () => ({
  runId: "test-run",
  configDir: join(repoRoot, "configs"),
  dataDir: join(repoRoot, "data", "literature"),
})

let testReport: Promise<{ dir: string; path: string; html: string }> | undefined

/** The report built from the shared test run (once per test file). */
export function buildTestReport(): Promise<{
  dir: string
  path: string
  html: string
}> {
  testReport ??= (async () => {
    const { buildReport } = await import("../src/node/report/html")
    const dir = await buildTestRun()
    const path = join(
      mkdtempSync(join(tmpdir(), "spandek-html-")),
      "report.html",
    )
    await buildReport(dir, path, reportOpts())
    return { dir, path, html: readFileSync(path, "utf8") }
  })()
  return testReport
}

/** The visible text of a page: scripts and styles removed, tags stripped, entities decoded. */
export function visibleText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")
}

/** The contents of the page's <script> blocks in order: [data, plotly, main]. */
export function scriptBlocks(html: string): string[] {
  return [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(
    (m) => m[1] as string,
  )
}

/**
 * Put real `refine` and `budget-table` outputs (tests/fixtures/report/refine, captured from the real CLI on the seed 20261121,
 * 4-draw run with 2 starts and a 3-level, 2-draw table) into dir/refine and register the table in the manifest with the
 * real registerInManifest, so readVerifiedTable accepts it. Regenerate with `refine --starts 2` and `budget-table` on a 3 x 2 config.
 */
export async function addRefineOutputs(dir: string): Promise<void> {
  const { registerInManifest } = await import("../src/node/budget")
  const { createHash } = await import("node:crypto")
  const src = join(repoRoot, "tests", "fixtures", "report", "refine")
  const dst = join(dir, "refine")
  mkdirSync(dst, { recursive: true })
  for (const f of readdirSync(src)) cpSync(join(src, f), join(dst, f))
  const bytes = readFileSync(join(dst, "budget_table.json"))
  registerInManifest(join(dir, "run_manifest.json"), {
    path: "refine/budget_table.json",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
    kind: "budget_table",
  })
}

import { createHash } from "node:crypto"
import {
  existsSync,
  readFileSync,
  renameSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { isAbsolute, join, normalize, relative, resolve } from "node:path"
import { ConfigError, DataError } from "../../core/errors"
import type { ModelContext } from "../../core/pipeline/context"
import { configSha256 } from "../config"
import { listDataFiles, sha256Hex } from "../data"
import { emit } from "../logging"

export const MANIFEST_FILE = "run_manifest.json"
const CONFIG_FILES = [
  "controls.yaml",
  "material_ranges.yaml",
  "materials.yaml",
  "weather_scenarios.yaml",
] as const
const REPO_ROOT = join(import.meta.dir, "..", "..", "..")

/** An entry of `extra[]`: an output of a later command (path relative to the run directory, its hash, size and kind). */
export type ManifestExtraEntry = {
  path: string
  sha256: string
  bytes: number
  kind: string
}

export type ManifestSource = {
  runId: string
  configDir: string
  dataDir: string
}

/** JSON with object keys sorted at every level: the byte form that is hashed. */
function canonical(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`
  if (typeof v === "object" && v !== null)
    return `{${Object.keys(v)
      .sort()
      .map(
        (k) =>
          `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`,
      )
      .join(",")}}`
  return JSON.stringify(v)
}

/** FR-8: sha256 of the manifest without `report_sha256` (and without the hash field itself). */
export function manifestCoreHash(m: Record<string, unknown>): string {
  const { report_sha256: _r, core_sha256: _c, ...core } = m
  return createHash("sha256").update(canonical(core)).digest("hex")
}

function gitCommit(): string {
  try {
    const p = Bun.spawnSync(["git", "rev-parse", "HEAD"], { cwd: REPO_ROOT })
    const out = p.stdout.toString().trim()
    return p.exitCode === 0 && /^[0-9a-f]{40}$/.test(out) ? out : "unavailable"
  } catch {
    return "unavailable"
  }
}

/**
 * run_manifest.json (plan 03 FR-8): run id, seed, n_mc, git commit, Bun version and bun.lock hash, sha256 of every config
 * file and of the constants the models actually used (the parsed context), sha256 and size of each listed output file (paths
 * relative to outDir), `extra[]` for the outputs of later commands (empty unless the caller passes the entries to keep), and
 * `core_sha256`. `setReportHash` appends `report_sha256` last; it is excluded from the core hash. Written atomically; returns its path.
 */
export async function writeManifest(
  outDir: string,
  ctx: ModelContext,
  seed: number,
  nMc: number,
  files: readonly string[],
  src: ManifestSource,
  extra: readonly ManifestExtraEntry[] = [],
): Promise<string> {
  const entries = [...new Set(files)]
    .filter((f) => f !== MANIFEST_FILE)
    .sort()
    .map((rel) => {
      const n = normalize(rel)
      if (
        isAbsolute(n) ||
        n.startsWith("..") ||
        n.split(/[\\/]/).includes("..")
      )
        throw new ConfigError(
          "files",
          `manifest path must be relative to the output directory: ${rel}`,
        )
      const path = join(outDir, n)
      if (!existsSync(path))
        throw new DataError(rel, "listed output file is missing")
      const bytes = readFileSync(path)
      return {
        path: n.split("\\").join("/"),
        sha256: sha256Hex(bytes),
        bytes: statSync(path).size,
      }
    })
  const configFiles: Record<string, string> = {}
  for (const f of CONFIG_FILES)
    configFiles[f] = await configSha256([join(src.configDir, f)])
  const dataFiles: Record<string, string> = {}
  for (const f of listDataFiles(src.dataDir))
    dataFiles[f] = sha256Hex(readFileSync(join(src.dataDir, f)))
  const lock = join(REPO_ROOT, "bun.lock")
  const configHash = await configSha256(
    CONFIG_FILES.map((f) => join(src.configDir, f)),
  )
  const manifest: Record<string, unknown> = {
    run_id: src.runId,
    seed,
    n_mc: nMc,
    git_commit: gitCommit(),
    versions: { bun: Bun.version },
    bun_lock_sha256: existsSync(lock)
      ? sha256Hex(readFileSync(lock))
      : "unavailable",
    config_sha256: configHash,
    config_files: configFiles,
    constants_sha256: sha256Hex(
      canonical({
        mat: ctx.mat,
        weather: ctx.weather,
        ranges: ctx.ranges,
        controls: ctx.controls,
      }),
    ),
    data_sha256: dataFiles,
    files: entries,
    extra: [...extra].sort((a, b) =>
      a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
    ),
  }
  manifest.core_sha256 = manifestCoreHash(manifest)
  const path = join(outDir, MANIFEST_FILE)
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(manifest, null, 2)}\n`)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
  emit("manifest.written", "info", {
    path: MANIFEST_FILE,
    config_sha256: configHash,
  })
  return path
}

/**
 * Plan 00 D12: record the sha256 of report.html as the manifest's last field. The core hash does not change (it excludes this
 * field), which is why the page can show the core hash without depending on its own hash. Written atomically.
 */
export function setReportHash(outDir: string, sha256: string): void {
  const path = join(outDir, MANIFEST_FILE)
  const m = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>
  delete m.report_sha256
  m.report_sha256 = sha256
  const tmp = `${path}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, path)
}

/** The `extra[]` entries of a parsed manifest (empty when absent or malformed). */
export function extraEntries(m: Record<string, unknown>): ManifestExtraEntry[] {
  return Array.isArray(m.extra) ? (m.extra as ManifestExtraEntry[]) : []
}

/** Path of `file` relative to `dir`, with forward slashes (the form `extra[]` uses). */
export const relInRun = (dir: string, file: string): string =>
  relative(dir, file).split("\\").join("/")

/**
 * The text of a run-directory file whose hash equals its `extra[]` entry; the manifest must match its own core hash.
 * A file that is not listed, or whose bytes changed, is refused (DataError, exit 5) and report.refused is logged with `code`.
 */
export function readListed(
  m: Record<string, unknown>,
  dir: string,
  file: string,
  code: string,
  hint: string,
): string {
  const rel = relInRun(dir, file)
  const refuse = (message: string): never => {
    emit("report.refused", "error", { code, key: rel })
    throw new DataError(rel, message)
  }
  if (manifestCoreHash(m) !== m.core_sha256) {
    emit("report.refused", "error", { code, key: MANIFEST_FILE })
    throw new DataError(
      MANIFEST_FILE,
      "the manifest does not match its own core hash",
    )
  }
  const entry = extraEntries(m).find((e) => e.path === rel)
  if (!entry)
    return refuse(`${rel} is not listed in run_manifest.json (${hint})`)
  const text = readFileSync(file, "utf8")
  if (sha256Hex(text) !== entry.sha256)
    return refuse(`${rel} does not match the hash in run_manifest.json`)
  return text
}

export type ReportCheck = {
  status: "ok" | "stale" | "tampered" | "missing"
  message: string
}

/**
 * S2: does report.html in `dir` belong to the manifest next to it? The page embeds the core hash it was built against
 * (<meta name="spandek-core-sha256">); `report_sha256` is the hash of the file itself. A `refine`, `budget-table` or `indonesia`
 * run after the page was built changes the core hash, so the old page is reported as stale with the instruction to rebuild.
 */
export function checkReport(dir: string): ReportCheck {
  const mp = join(dir, MANIFEST_FILE)
  const hp = join(dir, "report.html")
  if (!existsSync(mp))
    return { status: "missing", message: `${MANIFEST_FILE} is missing` }
  if (!existsSync(hp))
    return { status: "missing", message: "report.html is missing" }
  let m: Record<string, unknown>
  try {
    m = JSON.parse(readFileSync(mp, "utf8")) as Record<string, unknown>
  } catch {
    return { status: "tampered", message: `${MANIFEST_FILE} is not valid JSON` }
  }
  if (manifestCoreHash(m) !== m.core_sha256)
    return {
      status: "tampered",
      message: `${MANIFEST_FILE} does not match its own core hash`,
    }
  const html = readFileSync(hp, "utf8")
  const embedded =
    /<meta name="spandek-core-sha256" content="([0-9a-f]{64})">/.exec(html)?.[1]
  if (embedded === undefined)
    return {
      status: "stale",
      message:
        "report.html does not record the manifest core hash it was built against; rebuild it with `report`",
    }
  if (embedded !== m.core_sha256)
    return {
      status: "stale",
      message: `report.html was built against core hash ${embedded}, the manifest now has ${String(m.core_sha256)}; a later command changed the run outputs, rebuild it with \`report --in ${dir}\``,
    }
  if (m.report_sha256 !== undefined && sha256Hex(html) !== m.report_sha256)
    return {
      status: "tampered",
      message: "report.html does not match report_sha256 in the manifest",
    }
  return { status: "ok", message: "report.html matches the manifest" }
}

/** D11/FR-12: appends (or replaces) the table's hash in extra[] of the manifest and rewrites the core hash. */
export function registerInManifest(
  manifestPath: string,
  extra: ManifestExtraEntry,
): void {
  const m = JSON.parse(readFileSync(manifestPath, "utf8")) as Record<
    string,
    unknown
  >
  const list = (Array.isArray(m.extra) ? m.extra : []) as ManifestExtraEntry[]
  m.extra = [...list.filter((e) => e.path !== extra.path), extra].sort(
    (a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0),
  )
  m.core_sha256 = manifestCoreHash(m)
  const tmp = `${manifestPath}.tmp`
  try {
    writeFileSync(tmp, `${JSON.stringify(m, null, 2)}\n`)
  } catch (e) {
    rmSync(tmp, { force: true })
    throw e
  }
  renameSync(tmp, manifestPath)
}

/**
 * Registers the files a later command wrote (`name`, text) in the manifest's extra[], so the report can refuse a changed file.
 * Skipped when `dir` holds no manifest or `out` does not lie inside `dir`.
 */
export function registerOutputs(
  dir: string,
  out: string,
  files: readonly (readonly [string, string])[],
  kind: string,
): void {
  const mp = join(dir, MANIFEST_FILE)
  if (!existsSync(mp)) return
  const rel = relative(resolve(dir), resolve(out))
  if (rel.startsWith("..") || isAbsolute(rel)) return
  for (const [name, text] of files)
    registerInManifest(mp, {
      path: join(rel, name).split("\\").join("/"),
      sha256: sha256Hex(text),
      bytes: Buffer.byteLength(text),
      kind,
    })
}

import { beforeAll, expect, test } from "bun:test"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { ConfigError, SpandekError } from "../../src/core/errors"
import type { OptimizeConfig } from "../../src/core/opt/optConfig"
import { toScaled, VARS } from "../../src/core/opt/vars"
import type { ModelContext } from "../../src/core/pipeline/context"
import {
  BUDGET_FILE,
  type BudgetFile,
  PROFILES,
  polish,
  queryTable,
  readVerifiedTable,
  registerInManifest,
  runBudgetTable,
  validateQuery,
} from "../../src/node/budget"
import { loadOptimize } from "../../src/node/config"
import { loadContext } from "../../src/node/context"
import { configureLogging } from "../../src/node/logging"
import { manifestCoreHash } from "../../src/node/report/manifest"
import { events, repoRoot, run } from "../helpers"

const cfgDir = join(repoRoot, "configs")
const dataDir = join(repoRoot, "data", "literature")
const SEED = 20261121
const LONG = 300_000
const LEVELS = 12
const DRAWS = 8
const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
const sha = (p: string) =>
  new Bun.CryptoHasher("sha256").update(readFileSync(p)).digest("hex")

let plan3: string
let ctx: ModelContext
let cfg: OptimizeConfig
let tabA: string // two workers
let tabB: string // one worker
let logDir: { runDir: string }

beforeAll(async () => {
  plan3 = tmp("spandek-budp3-")
  const r = await run([
    "run",
    "--seed",
    String(SEED),
    "--out",
    plan3,
    "--n-mc",
    "16",
    "--max-load",
    "1000",
  ])
  if (r.exitCode !== 0) throw new Error(`run failed: ${r.stderr}`)
  ctx = await loadContext(cfgDir, dataDir)
  cfg = await loadOptimize(join(cfgDir, "optimize.yaml"))
  const dir = tmp("spandek-budlog-")
  configureLogging({ runId: "budget-test", level: "info", runDir: dir })
  logDir = { runDir: dir }
  const small = { cfg, levels: LEVELS, intervalDraws: DRAWS, runId: "test" }
  tabA = await runBudgetTable(ctx, SEED, plan3, {
    ...small,
    out: join(plan3, "a"),
    workers: 2,
  })
  tabB = await runBudgetTable(ctx, SEED, plan3, {
    ...small,
    out: join(plan3, "b"),
    workers: 1,
  })
}, LONG)

test("sameTableOneAndTwoWorkers", () => {
  // H10: byte-identical files, hence identical sha256
  expect(readFileSync(tabA, "utf8")).toBe(readFileSync(tabB, "utf8"))
  expect(sha(tabA)).toBe(sha(tabB))
})

test("tableFileIsValidAndCarriesThreeProfiles", () => {
  const f = readVerifiedTable(tabA)
  expect(f.tables.map((t) => t.profile)).toEqual([...PROFILES])
  expect(f.interval_draws).toBe(DRAWS)
  expect(f.seed).toBe(SEED)
  for (const t of f.tables) {
    expect(t.entries.length).toBe(LEVELS)
    for (const e of t.entries) {
      expect(e.cost).toBeLessThanOrEqual(e.budget)
      expect(e.x.length).toBe(VARS.length)
    }
  }
  expect(f.note).toContain("PROXY")
})

test("manifestListsTheTableHashAndRewritesTheCoreHash", () => {
  const m = JSON.parse(readFileSync(join(plan3, "run_manifest.json"), "utf8"))
  expect(m.extra.map((e: { path: string }) => e.path)).toEqual([
    `a/${BUDGET_FILE}`,
    `b/${BUDGET_FILE}`,
  ])
  const a = m.extra[0]
  expect(a.sha256).toBe(sha(tabA))
  expect(a.bytes).toBe(readFileSync(tabA).length)
  expect(a.kind).toBe("budget_table")
  expect(m.core_sha256).toBe(manifestCoreHash(m))
  // the core hash really covers extra[]: dropping an entry changes it
  const dropped = { ...m, extra: m.extra.slice(1) }
  expect(manifestCoreHash(dropped)).not.toBe(m.core_sha256)
})

test("registerInManifestReplacesAnEntryOfTheSamePath", () => {
  const d = tmp("spandek-manifest-")
  const p = join(d, "run_manifest.json")
  const base = { run_id: "x", files: [], extra: [] as unknown[] }
  writeFileSync(p, JSON.stringify({ ...base, core_sha256: "stale" }))
  const e = {
    path: "t/budget_table.json",
    sha256: "aa",
    bytes: 1,
    kind: "budget_table",
  }
  registerInManifest(p, e)
  registerInManifest(p, { ...e, sha256: "bb" })
  const m = JSON.parse(readFileSync(p, "utf8"))
  expect(m.extra).toEqual([{ ...e, sha256: "bb" }])
  expect(m.core_sha256).toBe(manifestCoreHash(m))
  // a manifest without extra[] gets one
  writeFileSync(p, JSON.stringify({ run_id: "y" }))
  registerInManifest(p, e)
  expect(JSON.parse(readFileSync(p, "utf8")).extra).toEqual([e])
})

test("tableOutsideTheInputDirectoryIsExit2AndMissingManifestIsExit5", async () => {
  const small = { cfg, levels: 2, intervalDraws: 1 }
  const outside = join(tmp("spandek-budout-"), "t")
  await expect(
    runBudgetTable(ctx, SEED, plan3, { ...small, out: outside }),
  ).rejects.toBeInstanceOf(ConfigError)
  // a plan-3 directory without run_manifest.json (no `report` yet)
  const d = tmp("spandek-budnoman-")
  cpSync(plan3, d, { recursive: true })
  const { rmSync } = await import("node:fs")
  rmSync(join(d, "run_manifest.json"))
  try {
    await runBudgetTable(ctx, SEED, d, { ...small, out: join(d, "t") })
    throw new Error("expected a throw")
  } catch (e) {
    expect(e).toBeInstanceOf(SpandekError)
    expect((e as SpandekError).code).toBe(5)
    expect((e as SpandekError).phase).toBe("budget.load")
  }
  expect(existsSync(join(d, "t", BUDGET_FILE))).toBe(false)
})

test("unlistedOrMissingTableIsExit5", () => {
  const d = tmp("spandek-budunlisted-")
  mkdirSync(join(d, "t"))
  const p = join(d, "t", BUDGET_FILE)
  writeFileSync(p, readFileSync(tabA))
  for (const [setup, why] of [
    [() => {}, "no manifest"],
    [
      () =>
        writeFileSync(
          join(d, "run_manifest.json"),
          JSON.stringify({ extra: [], core_sha256: "x" }),
        ),
      "not listed",
    ],
  ] as const) {
    setup()
    try {
      readVerifiedTable(p)
      throw new Error(`expected a throw: ${why}`)
    } catch (e) {
      expect(e).toBeInstanceOf(SpandekError)
      expect((e as SpandekError).code).toBe(5)
      expect((e as SpandekError).phase).toBe("budget.verify")
    }
  }
  expect(() => readVerifiedTable(join(d, "nope.json"))).toThrow(SpandekError)
})

test("validateQueryRejectsNegativeNonNumericAndUnknownProfile", () => {
  // F11 at the library level
  expect(validateQuery("0.5", "balanced")).toBe(0.5)
  expect(validateQuery("0", "cooling_first")).toBe(0)
  for (const [a, p] of [
    ["-5", "balanced"],
    ["abc", "balanced"],
    ["", "balanced"],
    ["NaN", "balanced"],
    ["Infinity", "balanced"],
    ["0.5", "luxury"],
  ] as const) {
    try {
      validateQuery(a, p)
      throw new Error("expected a throw")
    } catch (e) {
      expect(e).toBeInstanceOf(ConfigError)
      expect((e as ConfigError).code).toBe(2)
    }
  }
})

test("queryBelowCMinIsExit3WithTheMinimum", () => {
  const f = readVerifiedTable(tabA)
  const t = f.tables[1]
  if (!t) throw new Error("no table")
  const errors: string[] = []
  const orig = console.error
  console.error = (...a: unknown[]) => {
    errors.push(a.join(" "))
  }
  try {
    queryTable(f, "balanced", t.c_min * 0.9)
    throw new Error("expected a throw")
  } catch (e) {
    expect((e as SpandekError).code).toBe(3)
    expect((e as SpandekError).phase).toBe("budget.lookup")
  } finally {
    console.error = orig
  }
  expect(errors.join()).toContain(`c_min = ${t.c_min}`)
  const ok = queryTable(f, "balanced", t.c_min)
  expect(ok.result.entry_budget).toBe(t.c_min)
  expect(ok.result.headroom).toBeCloseTo(t.c_min - ok.entry.cost, 15)
  expect(Object.keys(ok.result.recipe)).toEqual(VARS.map((v) => v.id))
})

test(
  "polishKeepsTheEntryOrImprovesIt",
  () => {
    const f: BudgetFile = readVerifiedTable(tabA)
    for (const p of PROFILES) {
      const t = f.tables.find((x) => x.profile === p)
      if (!t) throw new Error("no table")
      const lo = t.entries[3]?.budget as number
      const hi = t.entries[4]?.budget as number
      const b = lo + 0.5 * (hi - lo)
      const q = queryTable(f, p, b)
      const r = polish(ctx, cfg, f, q, b)
      expect(r.scalar).toBeLessThanOrEqual(q.entry.scalar)
      expect(r.cost).toBeLessThanOrEqual(b)
      if (!r.polished) expect(r.recipe).toEqual(q.result.recipe)
      else {
        expect(r.lo).toBeNull()
        const u = toScaled(VARS.map((v) => r.recipe[v.id] as number))
        expect(u.every((x) => x >= -1e-12 && x <= 1 + 1e-12)).toBe(true)
      }
    }
  },
  LONG,
)

test("everyBudgetEventIsEmittedWithItsFields", () => {
  const ev = events(logDir)
  const by = (n: string) => ev.filter((e) => e.event === n)
  // two builds in this log, three profiles each
  expect(by("refine.budget.done").length).toBe(2 * PROFILES.length)
  for (const e of by("refine.budget.done"))
    for (const k of ["profile", "n_levels", "cmin", "cmax", "knee_budget"])
      expect(e).toHaveProperty(k)
  expect(by("refine.budget.cmin").length).toBe(2)
  expect(by("refine.budget.cmin")[0]?.cmin as number).toBeGreaterThan(0)
})

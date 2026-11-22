import { beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse, stringify } from "yaml"
import { parseCsv } from "../../src/core/csv"
import {
  dailyGhiKwhM2,
  localDays,
  monthlyPrecipMm,
  pickDays,
} from "../../src/core/indonesia/days"
import { readSiteYear, writeSums } from "../../src/node/power"
import { MANIFEST_FILE } from "../../src/node/report/manifest"
import {
  events,
  indonesiaConfigCopy,
  listFiles,
  repoRoot,
  run,
  WEATHER_DIR,
  weatherSubset,
} from "../helpers"
import type { Tier } from "./scale"

export type IndonesiaE2eScale = {
  tier: Tier
  /** Extra arguments of the plan-3 `run` (the proof tier keeps the 256-draw default). */
  runExtra: string[]
  /** Site ids; empty = the five sites. */
  sites: string[]
  years: [number, number]
  /** --n-mc of `indonesia`; null = the run's own n_mc (256). */
  nMc: string | null
  /** The fault matrix is size independent and runs in the fast tier only. */
  faults: boolean
}

/** Full size: five sites, ten years, the 256 draws of the plan-3 run; the runtime limit means something here. */
export const INDONESIA_E2E_PROOF: IndonesiaE2eScale = {
  tier: "proof",
  runExtra: [],
  sites: [],
  years: [2015, 2024],
  nMc: null,
  faults: false,
}
/** Jakarta, 2023-2024, 4 draws; the fault matrix included. */
export const INDONESIA_E2E_FAST: IndonesiaE2eScale = {
  tier: "fast",
  runExtra: ["--n-mc", "4"],
  sites: ["jakarta"],
  years: [2023, 2024],
  nMc: "4",
  faults: true,
}

const T_NRT_S = 600 // plan 04 H11
const FILES = [
  "indonesia_days.json",
  "indonesia_results.csv",
  "indonesia_summary.csv",
  "indonesia_crosscheck.csv",
] as const

export function indonesiaE2eSuite(S: IndonesiaE2eScale): void {
  const LONG = 900_000
  const SEED = "20261121"
  const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
  const sha = (p: string) =>
    createHash("sha256").update(readFileSync(p)).digest("hex")
  const noTrace = (stderr: string) =>
    expect(stderr).not.toMatch(/(^|\n)\s+at \S/)
  const full = S.sites.length === 0
  const base = ["--max-load", "1000"]

  let out: string
  let wx: string
  let cfg: string
  let seconds = 0
  let ind: Awaited<ReturnType<typeof run>>
  let rep: Awaited<ReturnType<typeof run>>

  const siteArgs = S.sites.length === 1 ? ["--site", S.sites[0] as string] : []
  const indArgs = (to: string, extra: string[] = []) => [
    "indonesia",
    "--in",
    out,
    "--out",
    to,
    "--config-dir",
    cfg,
    "--weather-dir",
    wx,
    ...siteArgs,
    ...(S.nMc ? ["--n-mc", S.nMc] : []),
    ...base,
    ...extra,
  ]

  beforeAll(async () => {
    out = join(tmp("spandek-ind-e2e-"), "out")
    const r = await run([
      "run",
      "--seed",
      SEED,
      "--out",
      out,
      ...base,
      ...S.runExtra,
    ])
    if (r.exitCode !== 0) throw new Error(`run failed: ${r.stderr}`)
    wx = full
      ? WEATHER_DIR
      : await weatherSubset(S.sites, S.years[0], S.years[1])
    cfg = full
      ? join(repoRoot, "configs")
      : indonesiaConfigCopy(S.years[0], S.years[1])
    // sequential (the machine-load rule): indonesia, then report
    const t0 = performance.now()
    ind = await run(indArgs(join(out, "indonesia")))
    seconds = (performance.now() - t0) / 1000
    rep = await run(["report", "--in", out, ...base])
  }, 3 * LONG)

  test("e2eRunsUnderBudget", () => {
    expect(ind.exitCode).toBe(0)
    expect(ind.stderr).not.toMatch(/"level":"error"/)
    console.log(
      `indonesia (${S.tier}): ${seconds.toFixed(1)} s, limit ${T_NRT_S} s`,
    )
    expect(seconds).toBeLessThan(T_NRT_S) // H11
    const files = listFiles(join(out, "indonesia"))
    for (const f of FILES) expect(files).toContain(f)
    const days = JSON.parse(
      readFileSync(join(out, "indonesia", "indonesia_days.json"), "utf8"),
    )
    const scenarios = days.sites.reduce(
      (n: number, s: { days: unknown[] }) => n + s.days.length,
      0,
    )
    const rows = parseCsv(
      readFileSync(join(out, "indonesia", "indonesia_results.csv"), "utf8"),
    )
    expect(rows.length).toBe(scenarios * (96 + 5) * 2)
    if (full) expect(rows.length).toBe(6060) // 30 scenarios x 101 subjects x 2 states
    // the report: exit 0, includes the section, manifest lists the four files and the report hash
    expect(rep.exitCode).toBe(0)
    const html = readFileSync(join(out, "report.html"), "utf8")
    expect(html).toContain('<section id="climate"')
    expect(html).toContain('href="#climate"')
    const man = JSON.parse(readFileSync(join(out, MANIFEST_FILE), "utf8"))
    const listed = man.extra.map((e: { path: string }) => e.path)
    for (const f of FILES) expect(listed).toContain(`indonesia/${f}`)
    expect(man.report_sha256).toBe(sha(join(out, "report.html")))
    // an events trail: 12 cross-check events per site, one per month
    expect(
      events(ind).filter((e) => e.event === "indonesia.epw.crosscheck").length,
    ).toBe(12 * (full ? 5 : S.sites.length))
    expect(
      events(ind).filter((e) => e.event === "indonesia.days.selected").length,
    ).toBe(scenarios)
    noTrace(ind.stderr)
  })

  test("reportIsRebuiltWithTheSameBytes", async () => {
    const before = sha(join(out, "report.html"))
    const again = await run(["report", "--in", out, ...base])
    expect(again.exitCode).toBe(0)
    expect(sha(join(out, "report.html"))).toBe(before)
  })

  test("sameCsvOneAndTwoWorkers", async () => {
    const one = join(tmp("spandek-ind-w1-"), "o")
    const r = await run(indArgs(one, ["--workers", "1"]))
    expect(r.exitCode).toBe(0)
    for (const f of FILES)
      expect(sha(join(one, f))).toBe(sha(join(out, "indonesia", f))) // H10
  })

  test("daySelectionIsIdenticalUnderBunAndNode", async () => {
    if (!Bun.which("node")) throw new Error("preflight: node is not installed")
    const sites = S.sites.length
      ? S.sites
      : ["jakarta", "surabaya", "medan", "makassar", "bandung"]
    const doc = parse(readFileSync(join(cfg, "indonesia.yaml"), "utf8"))
    const wet = doc.scenario.wet_month_mm.value as number
    const offset: Record<string, number> = { makassar: 8 }
    const sets = sites.map((id) => {
      const hours = []
      for (let y = S.years[0]; y <= S.years[1]; y++)
        hours.push(...readSiteYear(wx, id, y))
      const days = localDays(hours, offset[id] ?? 7)
      return {
        ghi: days.map((d) => dailyGhiKwhM2(d.series)),
        months: days.map((d) => Number(d.date.slice(5, 7))),
        precip: monthlyPrecipMm(days),
        wet,
      }
    })
    const here = sets.map((s) => pickDays(s.ghi, s.months, s.precip, s.wet))
    const dir = tmp("spandek-node-")
    const built = await Bun.build({
      entrypoints: [join(repoRoot, "tests/support/pickDaysEntry.ts")],
      target: "node",
      format: "esm",
      outdir: dir,
    })
    expect(built.success).toBe(true)
    const input = join(dir, "input.json")
    writeFileSync(input, JSON.stringify({ sets }))
    const p = Bun.spawn(["node", join(dir, "pickDaysEntry.js"), input], {
      stdout: "pipe",
      stderr: "pipe",
    })
    const [text, code] = [await new Response(p.stdout).text(), await p.exited]
    expect(code).toBe(0)
    expect(JSON.stringify(JSON.parse(text))).toBe(JSON.stringify(here)) // H10 (selection step)
    expect(here.every((h) => h.length >= 3)).toBe(true)
  })

  if (!S.faults) return

  // ---- the fault matrix F1..F9: one real edit of one input, expected phase and exit, never a stack trace ----

  type Raw = {
    properties: { parameter: Record<string, Record<string, number>> }
  }
  type Yaml = {
    sites: Record<string, Record<string, unknown>>
    ageing: { loss_lo: { value: number } }
    roof: { c_substrate_j_m2k: { value: number } }
  }
  async function fault(
    id: string,
    edit: (w: string, c: string) => void,
    expected: { exit: number; phase: string; key?: string },
    args: string[] = [],
  ): Promise<void> {
    const w = await weatherSubset(S.sites, S.years[0], S.years[1])
    const c = indonesiaConfigCopy(S.years[0], S.years[1])
    edit(w, c)
    const r = await run([
      "indonesia",
      "--in",
      out,
      "--out",
      join(tmp("spandek-ind-f-"), "o"),
      "--config-dir",
      c,
      "--weather-dir",
      w,
      "--n-mc",
      "2",
      ...base,
      ...siteArgs,
      ...args,
    ])
    expect({ id, exit: r.exitCode }).toEqual({ id, exit: expected.exit })
    const e = events(r).find((x) => x.event === "error.raised")
    expect({ id, phase: e?.phase }).toEqual({ id, phase: expected.phase })
    if (expected.key)
      expect({ id, key: e?.key }).toEqual({ id, key: expected.key })
    noTrace(r.stderr)
    expect(existsSync(join(out, "indonesia", "nope"))).toBe(false)
  }
  /** Edit one raw site-year as JSON and rewrite SHA256SUMS, so the edit is seen by the loader and not by the hash check. */
  const editRaw = (w: string, f: (doc: Raw) => void) => {
    const p = join(w, "raw", `${S.sites[0]}_${S.years[0]}.json`)
    const doc = JSON.parse(readFileSync(p, "utf8"))
    f(doc)
    writeFileSync(p, JSON.stringify(doc))
    writeSums(w)
  }
  const yamlEdit = (c: string, file: string, f: (d: Yaml) => void) => {
    const p = join(c, file)
    const d = parse(readFileSync(p, "utf8"))
    f(d)
    writeFileSync(p, stringify(d))
  }

  test(
    "faultMatrixF1toF9",
    async () => {
      const site = S.sites[0] as string
      const kHour = "2023060112" // an interior hour of the first year (its stamp, YYYYMMDDHH)
      const hour = `${S.years[0]}0601${"12"}`
      expect(hour.length).toBe(10)
      void kHour
      await fault(
        "F1",
        (w) =>
          editRaw(w, (d) => {
            ;(
              d.properties.parameter.ALLSKY_SFC_SW_DWN as Record<string, number>
            )[hour] = -999
          }),
        { exit: 5, phase: "indonesia.load" },
      )
      await fault(
        "F2",
        (w) =>
          editRaw(w, (d) => {
            for (const v of Object.values(d.properties.parameter))
              delete v[hour]
          }),
        { exit: 5, phase: "indonesia.load" },
      )
      await fault(
        "F3",
        (w) => {
          const p = join(w, "raw", `${site}_${S.years[0]}.json`)
          const b = readFileSync(p)
          const i = b.indexOf(0x30, b.length >> 1) // an ASCII zero in the middle of the file
          b[i] = 0x31
          writeFileSync(p, b)
        },
        { exit: 5, phase: "indonesia.verify" },
      )
      await fault(
        "F4",
        (_w, c) =>
          yamlEdit(c, "sites.yaml", (d) => {
            delete (d.sites[site] as Record<string, unknown>).lat
          }),
        { exit: 2, phase: "config" },
      )
      await fault(
        "F5",
        (_w, c) =>
          yamlEdit(c, "indonesia.yaml", (d) => {
            d.ageing.loss_lo.value = 0.3
          }),
        { exit: 2, phase: "config", key: "ageing.loss_lo" },
      )
      await fault("F7", () => {}, { exit: 2, phase: "config", key: "site" }, [
        "--site",
        "Atlantis",
      ])
      await fault(
        "F8",
        (w) =>
          editRaw(w, (d) => {
            ;(d.properties.parameter.RH2M as Record<string, number>)[hour] = 140
          }),
        { exit: 5, phase: "indonesia.load" },
      )
      await fault(
        "F9",
        (_w, c) =>
          yamlEdit(c, "weather_scenarios.yaml", (d) => {
            d.roof.c_substrate_j_m2k.value = 1540
          }),
        { exit: 2, phase: "config", key: "substrate.c_j_m2k" },
      )
      // F6: fetch-data against a dead port, a real refused connection
      const probe = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Response(""),
      })
      const dead = probe.port
      probe.stop(true)
      const r = await run([
        "fetch-data",
        "--indonesia",
        "--weather-dir",
        tmp("spandek-ind-f6-"),
        "--config-dir",
        cfg,
        "--base-url",
        `http://127.0.0.1:${dead}/api`,
        "--tmyx-url",
        `http://127.0.0.1:${dead}/z`,
        "--sleep-ms",
        "0",
        ...base,
        ...siteArgs,
      ])
      expect(r.exitCode).toBe(6)
      expect(events(r).find((x) => x.event === "error.raised")?.phase).toBe(
        "indonesia.fetch",
      )
      noTrace(r.stderr)
    },
    10 * 60_000,
  )
}

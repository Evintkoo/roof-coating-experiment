import { beforeAll, expect, test } from "bun:test"
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parse, stringify } from "yaml"
import { parseCsv, toCsv } from "../../src/core/csv"
import { MANIFEST_FILE } from "../../src/node/report/manifest"
import { events, lastEvent, listFiles, repoRoot, run } from "../helpers"
import type { Tier } from "./scale"

export type PipelineE2eScale = {
  tier: Tier
  /** Extra arguments of the three full `run`s (the proof tier keeps the plan-3 default of 256 draws). */
  runExtra: string[]
  /** n_mc of the debug-log run and the sim.draw_complete count it must emit (n_mc + 1). */
  debugNMc: string
  /** The stepwise fault matrix F1..F9 is small by construction; it runs in the fast tier only. */
  faults: boolean
}

export const PIPELINE_E2E_PROOF: PipelineE2eScale = {
  tier: "proof",
  runExtra: [],
  debugNMc: "16",
  faults: false,
}

/** Three real full runs with 4 draws each; the fault matrix included. */
export const PIPELINE_E2E_FAST: PipelineE2eScale = {
  tier: "fast",
  runExtra: ["--n-mc", "4"],
  debugNMc: "4",
  faults: true,
}

export function pipelineE2eSuite(S: PipelineE2eScale): void {
  const SEED = "20261121"
  const LONG = 600_000
  const sha = (p: string) =>
    createHash("sha256").update(readFileSync(p)).digest("hex")
  const tmp = (p: string) => mkdtempSync(join(tmpdir(), p))
  const noTrace = (stderr: string) =>
    expect(stderr).not.toMatch(/(^|\n)\s+at \S/)
  const T_RUNTIME_S = Number(
    readFileSync(join(repoRoot, "tests/fixtures/frozen_runtime.txt"), "utf8"),
  )
  const HASHED = [
    "results.csv",
    "draws.csv",
    "pareto.csv",
    "sensitivity.csv",
    "controls.csv",
    "curves.json",
  ]
  const runArgs = (out: string, seed = SEED, extra: string[] = []) => [
    "run",
    "--seed",
    seed,
    "--out",
    out,
    "--max-load",
    "1000",
    ...extra,
  ]

  type Full = {
    out: string
    seconds: number
    r: Awaited<ReturnType<typeof run>>
  }
  async function fullRun(seed = SEED): Promise<Full> {
    const out = join(tmp("spandek-e2e-"), "out")
    const t0 = performance.now()
    const r = await run(runArgs(out, seed, S.runExtra))
    return { out, seconds: (performance.now() - t0) / 1000, r }
  }

  let a: Full
  let b: Full
  let c: Full
  beforeAll(async () => {
    // sequential: the machine-load rule forbids overlapping heavy runs
    a = await fullRun()
    b = await fullRun()
    c = await fullRun("7")
  }, 3 * LONG)

  test("runEndToEndArtifactsExist", () => {
    expect(a.r.exitCode).toBe(0)
    expect(a.r.stderr).not.toMatch(/"level":"error"/)
    const files = listFiles(a.out)
    for (const f of [
      "candidates.csv",
      "weather.csv",
      "results.csv",
      "draws.csv",
      "pareto.csv",
      "sensitivity.csv",
      "controls.csv",
      "curves.json",
      "spectra.json",
      "run_meta.json",
      MANIFEST_FILE,
    ])
      expect(files).toContain(f)
    expect(files.filter((f) => f.startsWith("candidate_cards/")).length).toBe(3)
    // one run id across run_meta.json, the manifest and the log
    const meta = JSON.parse(readFileSync(join(a.out, "run_meta.json"), "utf8"))
    const man = JSON.parse(readFileSync(join(a.out, MANIFEST_FILE), "utf8"))
    expect(meta.run_id).toBe(man.run_id)
    expect(lastEvent(a.r, "run.complete").run_id).toBe(meta.run_id)
    expect(lastEvent(a.r, "run.complete").exit_code).toBe(0)
    // the manifest lists every produced file (all but itself) and every hash is true
    const listed = man.files.map((f: { path: string }) => f.path).sort()
    expect(listed).toEqual(files.filter((f) => f !== MANIFEST_FILE).sort())
    for (const f of man.files as { path: string; sha256: string }[])
      expect(sha(join(a.out, f.path))).toBe(f.sha256)
    expect(
      parseCsv(readFileSync(join(a.out, "results.csv"), "utf8")).length,
    ).toBe(864)
  })

  test("runTwiceSameSeedSameResultsHash", () => {
    expect(b.r.exitCode).toBe(0)
    for (const f of HASHED)
      expect(sha(join(b.out, f))).toBe(sha(join(a.out, f)))
    // R6: the manifest core hash includes run_id and git_commit, which are the only fields that may differ
    const ma = JSON.parse(readFileSync(join(a.out, MANIFEST_FILE), "utf8"))
    const mb = JSON.parse(readFileSync(join(b.out, MANIFEST_FILE), "utf8"))
    // run_meta.json carries the run id, so its own manifest entry differs too; every other file entry is identical
    const strip = (m: { files: { path: string }[] }) =>
      m.files.filter((f) => f.path !== "run_meta.json")
    expect(strip(mb)).toEqual(strip(ma))
    const diff = Object.keys(ma).filter(
      (k) => k !== "files" && JSON.stringify(ma[k]) !== JSON.stringify(mb[k]),
    )
    expect(diff.sort()).toEqual(["core_sha256", "run_id"])
  })

  test("differentSeedDifferentHash", () => {
    expect(c.r.exitCode).toBe(0)
    for (const f of ["results.csv", "draws.csv"])
      expect(sha(join(c.out, f))).not.toBe(sha(join(a.out, f)))
  })

  test("runtimeBelowFrozenThreshold", () => {
    expect(T_RUNTIME_S).toBeGreaterThan(0)
    for (const x of [a, b, c]) expect(x.seconds).toBeLessThan(T_RUNTIME_S)
    // the command's own clock agrees (the subprocess includes start-up)
    expect(
      Number(lastEvent(a.r, "run.complete").elapsed_ms) / 1000,
    ).toBeLessThan(T_RUNTIME_S)
  })

  // ---- F1..F9: one edit, the stepwise command that reads the edited input ----

  let base: string
  const cfgCopy = () => {
    const dir = tmp("spandek-fcfg-")
    cpSync(join(repoRoot, "configs"), dir, { recursive: true })
    return { dir }
  }
  type YamlDoc = {
    c1_r_solar: { value: number }
    unc: { diameter_rel: { value: number } }
  }
  function editYaml(
    dir: string,
    file: string,
    fn: (doc: YamlDoc) => void,
  ): void {
    const p = join(dir, file)
    const doc = parse(readFileSync(p, "utf8"))
    fn(doc)
    writeFileSync(p, stringify(doc))
  }
  /** A fresh copy of the small real design + simulate output (n_mc = 4) for stepwise faults. */
  function baseCopy(): string {
    const d = tmp("spandek-fbase-")
    cpSync(base, d, { recursive: true })
    return d
  }
  const simArgs = (design: string, out: string, extra: string[] = []) => [
    "simulate",
    "--design",
    design,
    "--out",
    out,
    "--seed",
    SEED,
    "--n-mc",
    "4",
    "--workers",
    "1",
    "--max-load",
    "1000",
    ...extra,
  ]
  function editCandidates(
    dir: string,
    fn: (row: Record<string, string | number | boolean>) => void,
  ): void {
    const p = join(dir, "candidates.csv")
    const rows = parseCsv(readFileSync(p, "utf8")) as Record<
      string,
      string | number | boolean
    >[]
    fn(rows[0] as Record<string, string | number | boolean>)
    writeFileSync(p, toCsv(Object.keys(rows[0] as object), rows))
  }

  if (S.faults)
    beforeAll(async () => {
      base = join(tmp("spandek-fbase0-"), "out")
      const d = await run([
        "design",
        "--seed",
        SEED,
        "--out",
        base,
        "--max-load",
        "1000",
      ])
      expect(d.exitCode).toBe(0)
      const s = await run(simArgs(base, base))
      expect(s.exitCode).toBe(0)
    }, LONG)

  type Fault = {
    id: string
    phase: string
    key?: string
    code: number
    go: () => Promise<Awaited<ReturnType<typeof run>>>
  }
  const faults: Fault[] = [
    {
      id: "F1 delete controls.yaml (simulate)",
      phase: "data",
      code: 5,
      go: () => {
        const { dir } = cfgCopy()
        rmSync(join(dir, "controls.yaml"))
        return run(simArgs(base, tmp("spandek-f-"), ["--config-dir", dir]))
      },
    },
    {
      id: "F2 C1 r_solar = 1.4 (simulate)",
      phase: "config",
      code: 2,
      go: () => {
        const { dir } = cfgCopy()
        editYaml(dir, "controls.yaml", (d) => {
          d.c1_r_solar.value = 1.4
        })
        return run(simArgs(base, tmp("spandek-f-"), ["--config-dir", dir]))
      },
    },
    {
      id: "F3 t_max_lo > t_max_pred (optimize)",
      phase: "config",
      code: 2,
      go: () => {
        const d = baseCopy()
        // report-level edit of one real row: the lower bound moves above the prediction
        const p = join(d, "results.csv")
        const rows = parseCsv(readFileSync(p, "utf8")) as Record<
          string,
          string | number | boolean
        >[]
        const row = rows[0] as Record<string, string | number | boolean>
        row.t_max_lo = Number(row.t_max_pred) + 5
        writeFileSync(p, toCsv(Object.keys(rows[0] as object), rows))
        return run(["optimize", "--in", d, "--max-load", "1000"])
      },
    },
    {
      id: "F4 --max-load 0 (simulate)",
      phase: "resource",
      code: 6,
      go: () =>
        run([
          "simulate",
          "--design",
          base,
          "--out",
          tmp("spandek-f-"),
          "--seed",
          SEED,
          "--max-load",
          "0",
        ]),
    },
    {
      id: "F5 --n-mc 0 (simulate)",
      phase: "config",
      code: 2,
      go: () => run(simArgs(base, tmp("spandek-f-"), ["--n-mc", "0"])),
    },
    {
      id: "F6 unc.diameter_rel.value = -0.1 (simulate)",
      phase: "config",
      code: 2,
      go: () => {
        const { dir } = cfgCopy()
        editYaml(dir, "materials.yaml", (d) => {
          d.unc.diameter_rel.value = -0.1
        })
        return run(simArgs(base, tmp("spandek-f-"), ["--config-dir", dir]))
      },
    },
    {
      id: "F7 midcoat_dft_um = 5 (simulate)",
      phase: "model",
      key: "midcoat_dft_um",
      code: 4,
      go: () => {
        const d = baseCopy()
        editCandidates(d, (r) => {
          // one candidate below the optics domain (100-300 um); topcoat 4 keeps the total-thickness constraints passing
          r.midcoat_dft_um = 5
          r.topcoat_dft_um = 4
        })
        return run(simArgs(d, tmp("spandek-f-")))
      },
    },
    {
      id: "F8 --design directory missing (simulate)",
      phase: "data",
      code: 5,
      go: () =>
        run(simArgs(join(tmp("spandek-f-"), "nope"), tmp("spandek-f-"))),
    },
    {
      id: "F9 midcoat_pvc = 1.3, feasible stays true (simulate)",
      phase: "config",
      code: 2,
      go: () => {
        const d = baseCopy()
        editCandidates(d, (r) => {
          r.midcoat_pvc = 1.3
        })
        return run(simArgs(d, tmp("spandek-f-")))
      },
    },
  ]

  test.each(S.faults ? faults : [])(
    "faultF1ToF9: $id",
    async (f) => {
      const r = await f.go()
      expect(r.exitCode).toBe(f.code)
      expect(lastEvent(r, "error.raised")).toMatchObject({
        code: f.code,
        phase: f.phase,
        ...(f.key ? { key: f.key } : {}),
      })
      noTrace(r.stderr)
      if (f.code === 6) expect(lastEvent(r, "resource.load_high")).toBeDefined()
    },
    LONG,
  )

  test(
    "allPlan3EventsPresentInRunJsonl",
    async () => {
      const out = join(tmp("spandek-dbg-"), "out")
      const r = await run(runArgs(out, SEED, ["--n-mc", S.debugNMc]), {
        SPANDEK_LOG_LEVEL: "debug",
      })
      expect(r.exitCode).toBe(0)
      const names = new Set(events(r).map((e) => e.event))
      for (const n of [
        "sim.start",
        "sim.progress",
        "sim.draw_complete",
        "pareto.computed",
        "shortlist.chosen",
        "sensitivity.done",
        "card.written",
        "manifest.written",
        "thermal.solved",
        "mie.cache_stats",
      ])
        expect(names.has(n)).toBe(true)
      // sim.draw_complete: n_mc + 1 events (the nominal run plus the draws)
      expect(
        events(r).filter((e) => e.event === "sim.draw_complete").length,
      ).toBe(Number(S.debugNMc) + 1)
      const log = join(r.runDir, "run.jsonl")
      console.log(
        `debug run.jsonl (n_mc ${S.debugNMc}): ${statSync(log).size} bytes`,
      )
      expect(existsSync(log)).toBe(true)
    },
    LONG,
  )
}

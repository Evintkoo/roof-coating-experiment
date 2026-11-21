import { expect, test } from "bun:test"
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { lhsDesign, weatherL9 } from "../src/core/design"
import {
  type NKTable,
  parseG173,
  parseNk,
  type Spectrum,
} from "../src/core/literature"
import { barrier } from "../src/core/models/barrier"
import { delaminationProxy } from "../src/core/models/delamination"
import { mieEfficiencies } from "../src/core/models/mie"
import {
  applyTopcoat,
  midcoatSpectrum,
  opticsGrid,
  resetMieCache,
  rSolarStack,
} from "../src/core/models/optics"
import { gelTimeRel } from "../src/core/models/solGel"
import { simulateDay, type ThermalInputs } from "../src/core/models/thermal"
import { wetting, wettingBinder } from "../src/core/models/wetting"
import {
  loadMaterialRanges,
  loadMaterials,
  loadWeather,
} from "../src/node/config"
import { repoRoot } from "./helpers"

const lit = (f: string) =>
  readFileSync(join(repoRoot, "data/literature", f), "utf8")
const cfg = (f: string) => join(repoRoot, "configs", f)
const g173: Spectrum = parseG173(lit("g173_global_tilt.csv"))
const tio2: NKTable = parseNk(lit("tio2_nk.csv"))
const mat = await loadMaterials(cfg("materials.yaml"))
const ranges = await loadMaterialRanges(cfg("material_ranges.yaml"))
const weather = await loadWeather(cfg("weather_scenarios.yaml"))
const baso4: NKTable = {
  wl_um: tio2.wl_um,
  n: new Float64Array(tio2.wl_um.length).fill(mat.baso4.n.value),
  k: new Float64Array(tio2.wl_um.length),
}
const wl = opticsGrid(tio2)
const scenarios = weatherL9(weather)
const design = lhsDesign(96, ranges, 20261121)
const SOL_REF = [4.25, 3, 0.5] as const

type Cand = (typeof design)[number]

function rMidOf(c: Cand): Float64Array {
  return midcoatSpectrum(
    c.midcoat_pvc,
    c.midcoat_tio2_fraction,
    c.midcoat_dft_um,
    mat,
    tio2,
    baso4,
    wl,
  )
}

/** Stack reflectance spectrum: midcoat on the substrate ground, topcoat attenuation on top. */
function stackSpectrum(c: Cand, withTopcoat: boolean): Float64Array {
  const mid = rMidOf(c)
  return withTopcoat
    ? applyTopcoat(mid, c.topcoat_dft_um, mat.topcoat.mu_per_um.value)
    : mid
}

function thermalInputs(
  c: Cand,
  rSolar: number,
  sc: (typeof scenarios)[number],
): ThermalInputs {
  const roof = weather.roof
  const dft = c.primer_dft_um + c.midcoat_dft_um + c.topcoat_dft_um
  return {
    r_solar: rSolar,
    emissivity: mat.coating.emissivity.value,
    g_peak_w_m2: sc.irradiance_w_m2,
    t_air_k: sc.t_air_c + 273.15,
    t_sky_k: sc.t_sky_k,
    h_conv_w_m2k: sc.h_conv_w_m2k,
    t_inside_k: roof.t_inside_c.value + 273.15,
    r_total_m2k_w: roof.r_total_m2k_w.value,
    c_a_j_m2k:
      roof.c_substrate_j_m2k.value +
      roof.rho_c_coating_j_m3k.value * dft * 1e-6,
  }
}

/** Five candidates spread over the solar-reflectance rank of the 96-design (lowest .. highest). */
function fiveCandidates(): { c: Cand; r: number }[] {
  const all = design
    .map((c) => ({ c, r: rSolarStack(stackSpectrum(c, true), wl, g173) }))
    .sort((a, b) => a.r - b.r)
  return [0, 24, 48, 72, 95].map((i) => all[i] as { c: Cand; r: number })
}

test("higherMidcoatReflectanceLowersTMaxEndToEnd", () => {
  resetMieCache()
  const five = fiveCandidates()
  // the five candidates really differ in R_solar (otherwise the test proves nothing)
  expect(
    (five[4] as { r: number }).r - (five[0] as { r: number }).r,
  ).toBeGreaterThan(0.05)
  for (let i = 1; i < five.length; i++)
    expect((five[i] as { r: number }).r).toBeGreaterThan(
      (five[i - 1] as { r: number }).r,
    )
  for (const sc of scenarios) {
    let prev = Number.POSITIVE_INFINITY
    for (const { c, r } of five) {
      const t = simulateDay(thermalInputs(c, r, sc)).t_max_c
      expect(Number.isFinite(t)).toBe(true)
      expect(t).toBeLessThan(prev)
      prev = t
    }
  }
})

test("topcoatOpticalPenaltyRaisesTMaxOrEqual", () => {
  resetMieCache()
  let strict = 0
  for (const { c } of fiveCandidates())
    for (const sc of scenarios) {
      const rWith = rSolarStack(stackSpectrum(c, true), wl, g173)
      const rNo = rSolarStack(stackSpectrum(c, false), wl, g173)
      expect(rWith).toBeLessThanOrEqual(rNo)
      // the attenuation is one uniform factor exp(-2 mu d) (two passes), and the weighting is linear
      const att = Math.exp(
        -2 * mat.topcoat.mu_per_um.value * (c as Cand).topcoat_dft_um,
      )
      expect(Math.abs(rWith - rNo * att)).toBeLessThan(1e-12)
      const tWith = simulateDay(thermalInputs(c, rWith, sc)).t_max_c
      const tNo = simulateDay(thermalInputs(c, rNo, sc)).t_max_c
      expect(tWith).toBeGreaterThanOrEqual(tNo)
      if (tWith > tNo) strict++
    }
  expect(strict).toBeGreaterThan(0)
})

// ---- NFR-2: import isolation ----
const MODELS_DIR = join(repoRoot, "src/core/models")
const modelFiles = readdirSync(MODELS_DIR).filter((f) => f.endsWith(".ts"))

/** Module specifiers of every `import ... from "x"` statement (multi-line included). */
function importTargets(src: string): string[] {
  const out: string[] = []
  for (const m of src.matchAll(/^import\b[\s\S]*?\bfrom\s*["']([^"']+)["']/gm))
    out.push(m[1] as string)
  for (const m of src.matchAll(/^import\s+["']([^"']+)["']/gm))
    out.push(m[1] as string)
  return out
}

/** Violations of NFR-2 for one model file: sibling models other than ranges/shared (mie only from optics). */
function isolationViolations(file: string, src: string): string[] {
  const bad: string[] = []
  for (const t of importTargets(src)) {
    if (t.startsWith("./")) {
      const name = t.slice(2)
      const ok =
        name === "ranges" ||
        name === "shared" ||
        (name === "mie" && file === "optics.ts") ||
        // plan 4: the hourly-driven series model is the same heat balance as thermal.ts on a driven input (the verified
        // oracle shares the one flux function), so it reuses thermal's flux and types instead of copying them
        (name === "thermal" && file === "thermalSeries.ts")
      if (!ok) bad.push(`${file} -> ${t}`)
    } else if (t.startsWith("../")) {
      if (/\/(node|web)\b/.test(t) || /models\//.test(t))
        bad.push(`${file} -> ${t}`)
    } else bad.push(`${file} -> ${t} (bare/node import)`)
  }
  return bad
}

test("noModelImportsAnother", () => {
  expect(modelFiles.length).toBeGreaterThanOrEqual(9)
  const bad = modelFiles.flatMap((f) =>
    isolationViolations(f, readFileSync(join(MODELS_DIR, f), "utf8")),
  )
  expect(bad).toEqual([])
  // the scanner can fail
  expect(
    isolationViolations(
      "thermal.ts",
      'import { x } from "./optics"\nimport {\n  a,\n} from "./mie"\n',
    ),
  ).toEqual(["thermal.ts -> ./optics", "thermal.ts -> ./mie"])
  expect(
    isolationViolations("optics.ts", 'import { a } from "./mie"\n'),
  ).toEqual([])
  // the thermalSeries exception is for that one file only
  expect(
    isolationViolations("optics.ts", 'import { a } from "./thermal"\n'),
  ).toEqual(["optics.ts -> ./thermal"])
  expect(
    isolationViolations("thermalSeries.ts", 'import { a } from "./thermal"\n'),
  ).toEqual([])
})

test("modelsBuildForBrowser", async () => {
  for (const f of modelFiles) {
    const r = await Bun.build({
      entrypoints: [join(MODELS_DIR, f)],
      target: "browser",
      throw: false,
    })
    expect({ f, ok: r.success, logs: r.logs.map(String) }).toEqual({
      f,
      ok: true,
      logs: [],
    })
    expect(r.outputs.length).toBeGreaterThan(0)
  }
})

test("everyOutputFiniteInDomainForAll96Candidates", () => {
  resetMieCache()
  expect(design.length).toBe(96)
  const sc = scenarios[4] as (typeof scenarios)[number]
  const binder = wettingBinder(mat)
  expect(Number.isFinite(binder.theta_pred)).toBe(true)
  // Mie at the grid for both pigments
  for (const t of [tio2, baso4]) {
    const nm = mat.binder.n.value
    const d =
      t === tio2 ? mat.tio2.diameter_um.value : mat.baso4.diameter_um.value
    for (let i = 0; i < wl.length; i += 7) {
      const r = mieEfficiencies(
        t.n[i] as number,
        t.k[i] as number,
        d,
        Float64Array.of(wl[i] as number),
        nm,
      )
      expect(Number.isFinite(r.q_sca[0] as number)).toBe(true)
      expect(r.q_sca[0] as number).toBeGreaterThanOrEqual(0)
      expect(r.q_abs[0] as number).toBeGreaterThanOrEqual(0)
      expect(Math.abs(r.g[0] as number)).toBeLessThanOrEqual(1)
    }
  }
  for (const c of design) {
    // optics
    const spec = stackSpectrum(c, true)
    for (const v of spec) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    const rs = rSolarStack(spec, wl, g173)
    expect(rs).toBeGreaterThanOrEqual(0)
    expect(rs).toBeLessThanOrEqual(1)
    // thermal
    const th = simulateDay(thermalInputs(c, rs, sc))
    expect(Number.isFinite(th.t_max_c)).toBe(true)
    expect(th.t_max_c).toBeGreaterThan(sc.t_air_c - 40)
    expect(th.t_max_c).toBeLessThan(150)
    expect(Number.isFinite(th.q_in_mean_w_m2)).toBe(true)
    // wetting
    const w = wetting(c.topcoat_mtes_molfrac, mat)
    for (const a of [w.theta_pred, w.theta_lo, w.theta_hi]) {
      expect(Number.isFinite(a)).toBe(true)
      expect(a).toBeGreaterThanOrEqual(0)
      expect(a).toBeLessThanOrEqual(180)
    }
    for (const s of [w.score, w.score_lo, w.score_hi]) {
      expect(s).toBeGreaterThanOrEqual(0)
      expect(s).toBeLessThanOrEqual(1)
    }
    expect(w.theta_lo).toBeLessThanOrEqual(w.theta_pred)
    expect(w.theta_pred).toBeLessThanOrEqual(w.theta_hi)
    // barrier
    const b = barrier(c.primer_gptes_molfrac, c.primer_dft_um, mat)
    for (const v of [b.perm_index, b.crack_index, b.corrosion_risk]) {
      expect(Number.isFinite(v)).toBe(true)
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
    expect(b.proxy).toBe(true)
    // delamination
    const dl = delaminationProxy(c.topcoat_mtes_molfrac, c.topcoat_dft_um, mat)
    expect(Number.isFinite(dl)).toBe(true)
    expect(dl).toBeGreaterThanOrEqual(0)
    expect(dl).toBeLessThanOrEqual(1)
    // sol-gel: Infinity is allowed only for the gel time
    const gt = gelTimeRel(4.25, 3, c.primer_gptes_molfrac, mat, SOL_REF)
    expect(Number.isNaN(gt)).toBe(false)
    expect(gt).toBeGreaterThan(0)
  }
})

// ---- T-X-5: Node = Bun ----
test("suiteIsIdenticalUnderNode", async () => {
  const sc = scenarios[2] as (typeof scenarios)[number]
  const mid = design[10] as Cand
  const entry = `
import { mieEfficiencies } from ${JSON.stringify(join(MODELS_DIR, "mie.ts"))}
import { applyTopcoat, midcoatSpectrum, opticsGrid, rSolarStack } from ${JSON.stringify(join(MODELS_DIR, "optics.ts"))}
import { simulateDay } from ${JSON.stringify(join(MODELS_DIR, "thermal.ts"))}
import { gelTimeRel } from ${JSON.stringify(join(MODELS_DIR, "solGel.ts"))}
import { wetting } from ${JSON.stringify(join(MODELS_DIR, "wetting.ts"))}
import { barrier } from ${JSON.stringify(join(MODELS_DIR, "barrier.ts"))}
import { delaminationProxy } from ${JSON.stringify(join(MODELS_DIR, "delamination.ts"))}
const mat = ${JSON.stringify(mat)}
const F = (a) => Float64Array.from(a)
const nk = (o) => ({ wl_um: F(o.wl), n: F(o.n), k: F(o.k) })
const tio2 = nk(${JSON.stringify({ wl: [...tio2.wl_um], n: [...tio2.n], k: [...tio2.k] })})
const baso4 = nk(${JSON.stringify({ wl: [...baso4.wl_um], n: [...baso4.n], k: [...baso4.k] })})
const g173 = { wl_um: F(${JSON.stringify([...g173.wl_um])}), irradiance_w_m2_um: F(${JSON.stringify([...g173.irradiance_w_m2_um])}) }
const c = ${JSON.stringify(mid)}
const sc = ${JSON.stringify(sc)}
const wl = opticsGrid(tio2)
const out = []
const m1 = mieEfficiencies(tio2.n[40], tio2.k[40], mat.tio2.diameter_um.value, F([wl[40]]), mat.binder.n.value)
out.push(m1.q_sca[0], m1.q_abs[0], m1.g[0])
const mid = midcoatSpectrum(c.midcoat_pvc, c.midcoat_tio2_fraction, c.midcoat_dft_um, mat, tio2, baso4, wl)
const stack = applyTopcoat(mid, c.topcoat_dft_um, mat.topcoat.mu_per_um.value)
const rs = rSolarStack(stack, wl, g173)
out.push(mid[10], mid[60], rs, rSolarStack(mid, wl, g173))
const dft = c.primer_dft_um + c.midcoat_dft_um + c.topcoat_dft_um
const th = simulateDay({ r_solar: rs, emissivity: mat.coating.emissivity.value, g_peak_w_m2: sc.irradiance_w_m2,
  t_air_k: sc.t_air_c + 273.15, t_sky_k: sc.t_sky_k, h_conv_w_m2k: sc.h_conv_w_m2k, t_inside_k: 303.15, r_total_m2k_w: 0.3,
  c_a_j_m2k: 1218.9 + 1.8e6 * dft * 1e-6 })
out.push(th.t_max_c, th.q_in_mean_w_m2, th.t_surface_k[72], th.t_surface_k[100])
out.push(gelTimeRel(4.25, 3, c.primer_gptes_molfrac, mat, [4.25, 3, 0.5]))
const w = wetting(c.topcoat_mtes_molfrac, mat)
out.push(w.theta_pred, w.theta_lo, w.theta_hi, w.score)
const b = barrier(c.primer_gptes_molfrac, c.primer_dft_um, mat)
out.push(b.perm_index, b.crack_index, b.corrosion_risk)
out.push(delaminationProxy(c.topcoat_mtes_molfrac, c.topcoat_dft_um, mat))
console.log(JSON.stringify(out))
`
  const dir = mkdtempSync(join(tmpdir(), "spandek-node-"))
  const entryPath = join(dir, "entry.ts")
  writeFileSync(entryPath, entry)
  const built = await Bun.build({
    entrypoints: [entryPath],
    target: "node",
    throw: false,
  })
  expect(built.success).toBe(true)
  const js = join(dir, "bundle.mjs")
  writeFileSync(js, await (built.outputs[0] as Blob).text())
  const run = (cmd: string[]) => {
    const p = Bun.spawnSync(cmd, { stdout: "pipe", stderr: "pipe" })
    expect(p.stderr.toString()).toBe("")
    expect(p.exitCode).toBe(0)
    return JSON.parse(p.stdout.toString()) as number[]
  }
  const node = run(["node", js])
  const bun = run([process.execPath, js])
  expect(node.length).toBe(20)
  expect(bun.length).toBe(20)
  for (let i = 0; i < 20; i++) {
    expect(Number.isFinite(node[i] as number)).toBe(true)
    expect(
      Math.abs((node[i] as number) - (bun[i] as number)),
    ).toBeLessThanOrEqual(1e-9)
  }
  // the in-process (Bun) model call with the same fixed inputs gives the same t_max
  const direct = simulateDay({
    r_solar: node[5] as number,
    emissivity: mat.coating.emissivity.value,
    g_peak_w_m2: sc.irradiance_w_m2,
    t_air_k: sc.t_air_c + 273.15,
    t_sky_k: sc.t_sky_k,
    h_conv_w_m2k: sc.h_conv_w_m2k,
    t_inside_k: 303.15,
    r_total_m2k_w: 0.3,
    c_a_j_m2k:
      1218.9 +
      1.8e6 *
        (mid.primer_dft_um + mid.midcoat_dft_um + mid.topcoat_dft_um) *
        1e-6,
  })
  expect(Math.abs(direct.t_max_c - (node[7] as number))).toBeLessThanOrEqual(
    1e-9,
  )
})

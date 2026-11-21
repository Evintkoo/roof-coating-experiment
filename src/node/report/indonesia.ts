import { existsSync, readFileSync } from "node:fs"
import { join, relative } from "node:path"
import { parseCsv } from "../../core/csv"
import { DataError } from "../../core/errors"
import {
  INDONESIA_BIN_LABEL,
  INDONESIA_STATE_LABEL,
  INDONESIA_SUBJECT_LABEL,
  type IndonesiaData,
  type IndonesiaSummaryRow,
  siteLabel,
} from "../../web/figures"
import { fmtValue } from "../../web/fmt"
import { sha256Hex } from "../data"
import { emit } from "../logging"
import { esc, type ReportInput, type ReportSection } from "./html"
import { manifestCoreHash } from "./manifest"

/** Where `indonesia` puts its files: the run directory itself or its indonesia/ subdirectory. */
const LOCATIONS = ["", "indonesia"] as const
const FILES = [
  "indonesia_days.json",
  "indonesia_summary.csv",
  "indonesia_results.csv",
  "indonesia_crosscheck.csv",
] as const

type Rec = Record<string, string>
export type CrossRow = {
  site: string
  month: number
  nasa: number
  tmyx: number
  rel: number
}
export type DayRow = {
  site: string
  season: string
  bin: string
  date: string
  ghi: number
}
export type Indonesia = {
  data: IndonesiaData
  cross: CrossRow[]
  days: DayRow[]
  tow: Record<string, number>
  share: Record<string, Partial<Record<string, number>>>
  nRows: number
}

const refuse = (key: string, message: string): never => {
  emit("report.refused", "error", { code: "indonesia_input", key })
  throw new DataError(key, message)
}

/** The file's text when its hash equals the manifest's extra[] entry (the manifest's own core hash is checked too). */
function verified(input: ReportInput, path: string): string {
  const rel = relative(input.dir, path).split("\\").join("/")
  const m = input.manifest
  if (manifestCoreHash(m) !== m.core_sha256)
    refuse("run_manifest.json", "the manifest does not match its own core hash")
  const entry = (
    Array.isArray(m.extra)
      ? (m.extra as { path: string; sha256: string }[])
      : []
  ).find((e) => e.path === rel)
  if (!entry)
    refuse(
      rel,
      `${rel} is not listed in run_manifest.json (run \`indonesia\` again)`,
    )
  const text = readFileSync(path, "utf8")
  if (sha256Hex(text) !== entry?.sha256)
    refuse(rel, `${rel} does not match the hash in run_manifest.json`)
  return text
}

const num = (r: Rec, k: string, file: string): number => {
  const v = Number(r[k])
  if (r[k] === undefined || r[k] === "" || !Number.isFinite(v))
    return refuse(file, `${file}: column ${k} is not a finite number`)
  return v
}

const cache = new WeakMap<ReportInput, Indonesia | null>()

/** Everything the section shows, or null when no indonesia output is present (absent is never an error; a partial or changed set is). */
export function loadIndonesia(input: ReportInput): Indonesia | null {
  if (cache.has(input)) return cache.get(input) ?? null
  let base: string | null = null
  for (const sub of LOCATIONS)
    if (existsSync(join(input.dir, sub, "indonesia_summary.csv"))) {
      base = join(input.dir, sub)
      break
    }
  if (base === null) {
    cache.set(input, null)
    return null
  }
  const text: Record<string, string> = {}
  for (const f of FILES) {
    const p = join(base, f)
    if (!existsSync(p))
      refuse(f, `${f} is missing next to indonesia_summary.csv`)
    text[f] = verified(input, p)
  }
  const days = JSON.parse(text["indonesia_days.json"] as string) as {
    n_mc: number
    loss_lo: number
    loss_hi: number
    sites: {
      id: string
      tow_hours_per_year: number
      season_share: Record<string, number>
      days: { season: string; bin: string; date: string; ghi_kwh_m2: number }[]
    }[]
  }
  const f = "indonesia_summary.csv"
  const summary: IndonesiaSummaryRow[] = parseCsv(text[f] as string).map(
    (r) => ({
      site: r.site as string,
      bin: r.bin as string,
      subject: r.subject as string,
      state: r.state as string,
      t_max_c: num(r, "t_max_c", f),
      t_max_lo: num(r, "t_max_lo", f),
      t_max_hi: num(r, "t_max_hi", f),
      q_in_mean_w_m2: num(r, "q_in_mean_w_m2", f),
      q_lo: num(r, "q_lo", f),
      q_hi: num(r, "q_hi", f),
      dq_w_m2: num(r, "dq_w_m2", f),
      dq_lo: num(r, "dq_lo", f),
      dq_hi: num(r, "dq_hi", f),
    }),
  )
  for (const r of summary)
    if (r.dq_lo > r.dq_w_m2 + 1e-9 || r.dq_hi < r.dq_w_m2 - 1e-9)
      refuse(
        f,
        `${r.site} ${r.subject}: the interval does not contain the value`,
      )
  const g = "indonesia_crosscheck.csv"
  const cross: CrossRow[] = parseCsv(text[g] as string).map((r) => ({
    site: r.site as string,
    month: num(r, "month", g),
    nasa: num(r, "nasa_ghi_kwh_m2_day", g),
    tmyx: num(r, "tmyx_ghi_kwh_m2_day", g),
    rel: num(r, "ghi_rel_diff", g),
  }))
  const finite = (v: unknown): boolean =>
    typeof v === "number" && Number.isFinite(v)
  if (!Number.isInteger(days.n_mc) || days.n_mc < 1)
    refuse("indonesia_days.json", "n_mc is not a positive integer")
  if (!finite(days.loss_lo) || !finite(days.loss_hi))
    refuse("indonesia_days.json", "ageing-loss range is not finite")
  for (const s of days.sites)
    if (!finite(s.tow_hours_per_year))
      refuse("indonesia_days.json", "tow_hours_per_year is not finite")
  const out: Indonesia = {
    data: {
      n_mc: days.n_mc,
      loss_lo: days.loss_lo,
      loss_hi: days.loss_hi,
      summary,
    },
    cross,
    days: days.sites.flatMap((s) =>
      s.days.map((d) => ({
        site: s.id,
        season: d.season,
        bin: d.bin,
        date: d.date,
        ghi: d.ghi_kwh_m2,
      })),
    ),
    tow: Object.fromEntries(
      days.sites.map((s) => [s.id, s.tow_hours_per_year]),
    ),
    share: Object.fromEntries(days.sites.map((s) => [s.id, s.season_share])),
    nRows: parseCsv(text["indonesia_results.csv"] as string).length,
  }
  cache.set(input, out)
  emit("report.indonesia_found", "debug", { rows: summary.length })
  return out
}

const ival = (v: number, lo: number, hi: number, d: number): string =>
  `${fmtValue(v, d)} [${fmtValue(lo, d)}, ${fmtValue(hi, d)}]`

const th = (labels: readonly string[]): string =>
  `<thead><tr>${labels.map((l) => `<th scope="col">${esc(l)}</th>`).join("")}</tr></thead>`

const BENEFIT_SUBJECTS = ["C1", "card_high", "card_balanced", "card_low"]
const ALL_SUBJECTS = ["C0", ...BENEFIT_SUBJECTS]
const STATES = ["initial", "aged"] as const

/**
 * A table cell that shows one number of indonesia_summary.csv and says which: data-site/bin/subject/state/col, so a test (and a
 * reader of the source) can compare the cell with the CSV cell it came from. The text is fmtValue of the CSV number, never typed.
 */
function cell(
  r: IndonesiaSummaryRow,
  show: "dq" | "t" | "q",
  digits: number,
): string {
  const [col, v, lo, hi] =
    show === "dq"
      ? (["dq_w_m2", r.dq_w_m2, r.dq_lo, r.dq_hi] as const)
      : show === "t"
        ? (["t_max_c", r.t_max_c, r.t_max_lo, r.t_max_hi] as const)
        : (["q_in_mean_w_m2", r.q_in_mean_w_m2, r.q_lo, r.q_hi] as const)
  return `<td data-site="${esc(r.site)}" data-bin="${esc(r.bin)}" data-subject="${esc(r.subject)}" data-state="${esc(r.state)}" data-col="${col}">${ival(v, lo, hi, digits)}</td>`
}

function benefitTable(o: Indonesia): string {
  const sites = [...new Set(o.data.summary.map((r) => r.site))]
  const find = (site: string, subject: string, state: string) =>
    o.data.summary.find(
      (r) =>
        r.site === site &&
        r.bin === "weighted" &&
        r.subject === subject &&
        r.state === state,
    )
  const head = [
    "Site",
    "Subject",
    `Initial: benefit W/m² [p5, p95]`,
    `Aged (scenario ageing): benefit W/m² [p5, p95]`,
  ]
  const body = sites.flatMap((site) =>
    BENEFIT_SUBJECTS.map((subject) => {
      const cells = STATES.map((st) => {
        const r = find(site, subject, st)
        return r ? cell(r, "dq", 2) : `<td>not evaluated</td>`
      })
      return `<tr><td class="txt">${esc(siteLabel(site))}</td><td class="txt">${esc(INDONESIA_SUBJECT_LABEL[subject] ?? subject)}</td>${cells.join("")}</tr>`
    }),
  )
  return `<div class="scroll"><table id="tbl-indonesia-benefit">${th(head)}<tbody>\n${body.join("\n")}\n</tbody></table></div>`
}

function absoluteTable(o: Indonesia): string {
  const sites = [...new Set(o.data.summary.map((r) => r.site))]
  const body = sites.flatMap((site) =>
    ALL_SUBJECTS.flatMap((subject) =>
      STATES.map((state) => {
        const r = o.data.summary.find(
          (x) =>
            x.site === site &&
            x.bin === "weighted" &&
            x.subject === subject &&
            x.state === state,
        )
        if (!r) return ""
        return `<tr><td class="txt">${esc(siteLabel(site))}</td><td class="txt">${esc(INDONESIA_SUBJECT_LABEL[subject] ?? subject)}</td><td class="txt">${esc(INDONESIA_STATE_LABEL[state] ?? state)}</td>${cell(r, "t", 1)}${cell(r, "q", 2)}</tr>`
      }),
    ),
  )
  return `<div class="scroll"><table id="tbl-indonesia-absolute">${th([
    "Site",
    "Subject",
    "State",
    "Peak surface temperature °C [p5, p95]",
    "Mean heat flux into the building W/m² [p5, p95]",
  ])}<tbody>\n${body.join("\n")}\n</tbody></table></div>`
}

function crossTable(o: Indonesia): string {
  const sites = [...new Set(o.cross.map((r) => r.site))]
  const body = sites.map((site) => {
    const rows = o.cross.filter((r) => r.site === site)
    const worst = rows.reduce((a, b) =>
      Math.abs(b.rel) > Math.abs(a.rel) ? b : a,
    )
    const mean = rows.reduce((a, b) => a + b.rel, 0) / rows.length
    return `<tr><td class="txt">${esc(siteLabel(site))}</td><td data-site="${esc(site)}" data-col="mean_rel">${fmtValue(100 * mean, 1)}</td><td data-site="${esc(site)}" data-col="max_abs_rel">${fmtValue(100 * Math.abs(worst.rel), 1)}</td><td class="txt">${worst.month}</td></tr>`
  })
  return `<div class="scroll"><table id="tbl-indonesia-cross">${th([
    "Site",
    "Mean difference, NASA minus TMYx (%)",
    "Largest monthly difference (%)",
    "In month",
  ])}<tbody>\n${body.join("\n")}\n</tbody></table></div>`
}

function daysTable(o: Indonesia): string {
  const body = o.days.map(
    (d) =>
      `<tr><td class="txt">${esc(siteLabel(d.site))}</td><td class="txt">${esc(d.season)}</td><td class="txt">${esc(INDONESIA_BIN_LABEL[d.bin] ?? d.bin)}</td><td class="txt">${esc(d.date)}</td><td>${fmtValue(d.ghi, 2)}</td></tr>`,
  )
  return `<div class="scroll"><table id="tbl-indonesia-days">${th(["Site", "Season", "Day type", "Local date", "Daily GHI kWh/m²"])}<tbody>\n${body.join("\n")}\n</tbody></table></div>`
}

export const indonesiaSection: ReportSection = {
  id: "indonesia",
  title: "Indonesia",
  order: 75,
  render: (input) => {
    const o = loadIndonesia(input)
    if (o === null) return null
    const lo = fmtValue(100 * o.data.loss_lo, 0)
    const hi = fmtValue(100 * o.data.loss_hi, 0)
    const tow = Object.entries(o.tow)
      .map(([s, h]) => `${esc(siteLabel(s))} ${fmtValue(h, 0)} h`)
      .join(", ")
    return `<section id="indonesia" aria-labelledby="h-indonesia">
<h2 id="h-indonesia">Indonesia: five sites, aluminium, initial and aged</h2>
<div class="banner" role="note">
<p><strong>PROXY results on aluminium, with scenario ageing.</strong> The weather is modelled (NASA POWER hourly reanalysis and satellite data, 2015 to 2024), not station measurements. Three representative days per site and season (hot, typical, overcast) are run for the bare aluminium sheet (C0), the commercial datasheet control (C1) and the three shortlisted recipes, each as its full three-layer system. The aged values are a scenario: the effective reflectance of a coating loses ${lo} to ${hi} % (range from three US three-year exposure records), not an Indonesian measurement; bare aluminium is not aged and C1 uses its own weathered datasheet values. Intervals are parameter uncertainty only (p5 to p95 over ${esc(String(o.data.n_mc))} draws, plus the ageing-loss range for aged recipes).</p>
</div>
<h3>Heat-flux benefit by site and day type</h3>
<p class="hint">Benefit = mean heat flux into the building of bare aluminium minus that of the subject; positive means less heat enters. The last group of each site weights the day types 0.2 hot, 0.6 typical, 0.2 overcast and the seasons by their share of days in the ten years.</p>
<div class="controls"><label for="sel-indonesia-state">State</label><select id="sel-indonesia-state"><option value="initial">Initial</option><option value="aged">Aged (scenario ageing)</option></select></div>
<div id="fig-indonesia-bars" class="fig tall" role="img" aria-label="Heat-flux benefit against bare aluminium per site and day type with p5 to p95 whiskers, aluminium, scenario ageing"></div>
<h3>Weighted benefit table</h3>
${benefitTable(o)}
<h3>Peak temperature and heat flux, weighted</h3>
${absoluteTable(o)}
<h3>Cross-check of the weather data</h3>
<p>NASA POWER and the TMYx typical-year files of climate.onebuilding.org are both modelled products (reanalysis and satellite based; TMYx irradiance comes from ERA5 at airport locations). This table checks that the two agree month by month in mean daily global irradiation; it does not compare either with ground measurements, so a small difference shows consistency between two models, not accuracy.</p>
${crossTable(o)}
<h3>Representative days</h3>
${daysTable(o)}
<p class="hint">Time of wetness (hours per year with relative humidity above 80 % and air above 0 °C, ten-year mean): ${tow}. It is reported beside the unchanged corrosion index (PROXY); no site factor is applied to that index.</p>
</section>`
  },
  data: (input) => loadIndonesia(input)?.data ?? null,
}

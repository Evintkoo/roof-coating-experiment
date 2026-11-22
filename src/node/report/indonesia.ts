import { existsSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { parseCsv } from "../../core/csv"
import { DataError } from "../../core/errors"
import { callout } from "../../web/design/molecules/callout"
import { disclosure } from "../../web/design/molecules/disclosure"
import { figureFrame } from "../../web/design/molecules/figureFrame"
import { findingList } from "../../web/design/organisms/findingList"
import {
  type SiteBenefit,
  type SiteCaveat,
  siteBenefitPanel,
} from "../../web/design/organisms/siteBenefitPanel"
import {
  INDONESIA_BIN_LABEL,
  INDONESIA_STATE_LABEL,
  INDONESIA_SUBJECT_LABEL,
  type IndonesiaData,
  type IndonesiaSummaryRow,
  siteLabel,
} from "../../web/figures"
import { fmtValue } from "../../web/fmt"
import { emit } from "../logging"
import { derive } from "./content"
import { esc, type ReportInput, type ReportSection } from "./html"
import { readListed } from "./manifest"

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
const verified = (input: ReportInput, path: string): string =>
  readListed(
    input.manifest,
    input.dir,
    path,
    "indonesia_input",
    "run `indonesia` again",
  )

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
    `Initial: benefit W/m² [outer bound]`,
    `Aged (scenario ageing): benefit W/m² [outer bound]`,
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
    "Weighted mean of the day peaks: surface temperature °C [p5, p95]",
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

/** The panel data of the Indonesia section: card_high, weighted, initial against aged, per site, on one scale. */
export function climatePanelData(o: Indonesia): {
  sites: SiteBenefit[]
  axis: { min: number; max: number }
  loss: { lo: number; hi: number }
} {
  const sites = [...new Set(o.data.summary.map((r) => r.site))]
  const pick = (site: string, state: string) => {
    const r = o.data.summary.find(
      (x) =>
        x.site === site &&
        x.bin === "weighted" &&
        x.subject === "card_high" &&
        x.state === state,
    )
    if (!r)
      throw new DataError(
        "indonesia_summary.csv",
        `no ${state} weighted row of card_high for ${site}`,
      )
    return { value: r.dq_w_m2, lo: r.dq_lo, hi: r.dq_hi }
  }
  const out: SiteBenefit[] = sites.map((id) => ({
    id,
    name: siteLabel(id),
    initial: pick(id, "initial"),
    aged: pick(id, "aged"),
  }))
  const all = out.flatMap((s) => [s.initial, s.aged])
  const axis = {
    min: Math.min(0, Math.floor(Math.min(...all.map((e) => e.lo)))),
    max: Math.ceil(Math.max(...all.map((e) => e.hi))) + 1,
  }
  const losses = out
    .filter((s) => s.initial.value > 0)
    .map((s) =>
      Math.min(100, Math.max(0, 100 * (1 - s.aged.value / s.initial.value))),
    )
  const loss =
    losses.length === 0
      ? { lo: 0, hi: 0 }
      : { lo: Math.min(...losses), hi: Math.max(...losses) }
  return { sites: out, axis, loss }
}

export const indonesiaSection: ReportSection = {
  id: "climate",
  title: "Indonesian climate",
  order: 40,
  render: (input) => {
    const o = loadIndonesia(input)
    if (o === null) return null
    const d = derive(input)
    const lo = fmtValue(100 * o.data.loss_lo, 0)
    const hi = fmtValue(100 * o.data.loss_hi, 0)
    const tow = Object.entries(o.tow)
      .map(([s, h]) => `${esc(siteLabel(s))} ${fmtValue(h, 0)} h`)
      .join(", ")
    const panel = climatePanelData(o)
    const ids = new Set(panel.sites.map((s) => s.id))
    const caveats: SiteCaveat[] = [
      {
        id: "grid",
        text: "The NASA POWER values belong to a grid cell, not to the city, and the elevation of the cell is the elevation of the data. Bandung's cell is at 921.68 m (the TMYx airport file is at 740 m), so its temperatures may read 1 to 2 K cool against the city; Medan and Makassar, whose cells also lie well above city level, may read cool as well. No correction is applied.",
      },
      {
        id: "medan",
        ...(ids.has("medan") ? { site: "medan" } : {}),
        text: "Medan has no clear dry season: its dry months are dry only relative to its other months.",
      },
    ]
    const sentences = d.findings
      .filter((f) => f.id.startsWith("indonesia-"))
      .map((f) => ({ id: f.id, sentence: f.sentence }))
    const detail = (summary: string, inner: string) =>
      disclosure({ summary, level: "detail" })(inner)
    return `<section id="climate" class="page-section" aria-labelledby="h-climate">
<h2 id="h-climate">Indonesian climate</h2>
${callout({ tone: "caution", title: "PROXY results on aluminium, with scenario ageing", body: `The weather is modelled (NASA POWER hourly reanalysis and satellite data, 2015 to 2024), not station measurements. The roof is bare aluminium; the aged values are a scenario: the effective reflectance of a coating loses ${lo} to ${hi} % (a range from three US three-year exposure records), not an Indonesian measurement. Intervals are parameter uncertainty only (p5 to p95 over ${o.data.n_mc} draws, plus the ageing-loss range for aged recipes).` })}
${sentences.length > 0 ? findingList({ items: sentences, seen: d.seen }) : ""}
${siteBenefitPanel({ sites: panel.sites, axis: panel.axis, scenario: "Ageing is a scenario", loss: panel.loss, caveats, id: "sites", digits: 1 })}
${detail(
  "Weather model: how the five sites were built",
  `<p>Three representative days per site and season (hot, typical, overcast) are run for the bare aluminium sheet (C0), the commercial datasheet control (C1) and the three recommended recipes, each as its full three-layer system. Bare aluminium is not aged and C1 uses its own weathered datasheet values.</p>
<p>A month is called wet when its ten-year mean precipitation exceeds 150 mm, a design threshold and not a climate classification; Bandung's June (151 mm) sits right on it.</p>
<p class="page-hint">Time of wetness (hours per year with relative humidity above 80 % and air above 0 °C, ten-year mean): ${tow}. It is reported beside the unchanged corrosion index (PROXY); no site factor is applied to that index.</p>`,
)}
${detail(
  "Day-type detail: hot, typical and overcast days",
  `<p class="page-hint">Benefit = mean heat flux into the building of bare aluminium minus that of the subject; positive means less heat enters. The last group of each site weights the day types 0.2 hot, 0.6 typical, 0.2 overcast and the seasons by their share of days in the ten years. The bracket of a benefit is an outer bound, not the p5 to p95 of the benefit: the interval of the subject is subtracted from the interval of bare aluminium without pairing the draws, so it is wider than a paired interval would be.</p>
<div class="page-controls"><label for="sel-indonesia-state">State</label><select id="sel-indonesia-state"><option value="initial">Initial</option><option value="aged">Aged (scenario ageing)</option></select></div>
${figureFrame({ message: "Benefit against bare aluminium on hot, typical and overcast days, site by site on one shared axis", size: "tall", describe: "Heat-flux benefit per site and day type with outer-bound whiskers, aluminium, scenario ageing", note: "Whiskers: outer bound of the benefit interval. PROXY, parameter uncertainty only." })('<div id="fig-indonesia-bars" class="fig fig--tall"></div>')}`,
)}
${detail(
  "Reading the aged rows",
  `<p>The aged datasheet control C1 uses its own weathered datasheet values (a loss of about 14 %), while the three recipes use the midpoint of the scenario loss range (about ${fmtValue(50 * (o.data.loss_lo + o.data.loss_hi), 0)} %). The ordering of aged C1 against the recipes is therefore driven by the assumed loss and their intervals overlap; it is not a finding about which product ages better.</p>`,
)}
${detail("Weighted benefit table (all subjects)", benefitTable(o))}
${detail("Surface temperature and heat flux table", absoluteTable(o))}
${detail(
  "Cross-check of the weather data (NASA POWER against TMYx)",
  `<p>NASA POWER and the TMYx typical-year files of climate.onebuilding.org are both modelled products (reanalysis and satellite based; TMYx irradiance comes from ERA5 at airport locations). This table checks that the two agree month by month in mean daily global irradiation; it does not compare either with ground measurements, so a small difference shows consistency between two models, not accuracy.</p>${crossTable(o)}`,
)}
${detail("Representative days", daysTable(o))}
</section>`
  },
  data: (input) => loadIndonesia(input)?.data ?? null,
}

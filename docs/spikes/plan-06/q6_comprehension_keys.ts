// Plan 06 spike Q6, part 1: write tests/fixtures/comprehension.json. Every answer key is computed from the finished run's
// CSV, JSON and card files by this script; nothing is typed in by hand except the question wording and the option texts.
// Run: bun docs/spikes/plan-06/q6_comprehension_keys.ts [run_dir] [out_file]
import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { parseCsv } from "./lib/csv"

const HERE = dirname(new URL(import.meta.url).pathname)
const ROOT = join(HERE, "..", "..", "..")
const runDir = process.argv[2] ?? join(ROOT, "reports/plan-00-run")
const outFile =
  process.argv[3] ?? join(ROOT, "tests/fixtures/comprehension.json")

const csv = (p: string) => parseCsv(readFileSync(join(runDir, p), "utf8"))
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

const results = csv("results.csv")
const controls = csv("controls.csv")
const meta = JSON.parse(
  readFileSync(join(runDir, "run_meta.json"), "utf8"),
) as { run_id: string }
const manifest = JSON.parse(
  readFileSync(join(runDir, "run_manifest.json"), "utf8"),
) as { files: { path: string }[] }
const cards = readdirSync(join(runDir, "candidate_cards"))
  .filter((f) => f.endsWith(".md"))
  .sort()
const shortlist = cards.map((f) => {
  const m = /^(.*)_(SP-\d+)\.md$/.exec(f) as RegExpExecArray
  return {
    role: m[1] as string,
    id: m[2] as string,
    text: readFileSync(join(runDir, "candidate_cards", f), "utf8"),
  }
})
const meanTmax = (id: string) =>
  mean(
    results
      .filter((r) => r.candidate_id === id)
      .map((r) => Number(r.t_max_pred)),
  )
const c0 = mean(
  controls
    .filter((r) => r.control_id === "C0")
    .map((r) => Number(r.t_max_pred)),
)

// Q1 and Q2: the cooling pick is the shortlisted recipe with the lowest scenario-mean peak temperature; cooling = bare aluminium C0 minus the recipe.
const ranked = shortlist
  .map((s) => ({ ...s, t: meanTmax(s.id) }))
  .sort((a, b) => a.t - b.t)
const pick = ranked[0] as (typeof ranked)[number]
const cooling = c0 - pick.t

// Q3: is a number on the page a measurement? Derived: every result column is a prediction or a proxy index, and the manifest lists no measured data file.
const valueCols = Object.keys(results[0] as object).filter(
  (k) =>
    !["candidate_id", "scenario_id", "feasible"].includes(k) &&
    !/(^|_)(lo|hi)$/.test(k) &&
    !/molfrac|_um$|^midcoat_(pvc|tio2)|dft/.test(k),
)
const allPredictions = valueCols.every(
  (k) =>
    /_(pred|proxy|rel)$|^q_in_mean|^r_solar|^t_max|^wetting_theta|^cost_proxy|^gel_time|_proxy$|_pred$/.test(
      k,
    ) || /^(cost_proxy|gel_time_rel|q_in_mean_w_m2)$/.test(k),
)
const measuredFiles = manifest.files.filter((f) =>
  /measured|lab_|coupon_result|field/i.test(f.path),
)
const measuredAnswer = allPredictions && measuredFiles.length === 0

// Q4: PROXY: every *_proxy column is a dimensionless relative index in [0, 1] (so it is a ranking, not a physical quantity or a probability).
const proxyCols = Object.keys(results[0] as object).filter((k) =>
  /_proxy$/.test(k),
)
const inUnit = proxyCols.every((k) =>
  results.every((r) => r[k] === "" || (Number(r[k]) >= 0 && Number(r[k]) <= 1)),
)
const proxyAnswer = inUnit && proxyCols.length > 0

// Q5: the balanced budget curve's knee (relative cost units, not IDR).
const budget = JSON.parse(
  readFileSync(join(runDir, "refine/budget_table.json"), "utf8"),
) as { cost_unit: string; tables: { profile: string; knee_budget: number }[] }
const knee = (
  budget.tables.find((t) => t.profile === "balanced") as { knee_budget: number }
).knee_budget

// Q6: the site with the largest weighted heat-flux benefit against bare aluminium for the pick (initial state).
const subject = `card_${pick.role === "high_performing" ? "high" : pick.role === "low_cost" ? "low" : "balanced"}`
const summary = csv("indonesia/indonesia_summary.csv").filter(
  (r) => r.subject === subject && r.state === "initial" && r.bin === "weighted",
)
const bestSite = summary
  .map((r) => ({ site: r.site as string, dq: Number(r.dq_w_m2) }))
  .sort((a, b) => b.dq - a.dq)[0] as { site: string; dq: number }

// Q7: what the models leave out, read from the pick's card text.
const notModelled =
  /weathering and ageing are not modelled/i.test(pick.text) &&
  /adhesion is unknown/i.test(pick.text)

// Q8: next step, from the pick's decision section.
const decision = (
  /### Decision\s+(\w+)/.exec(pick.text) as RegExpExecArray
)[1] as string
const nextStep = decision === "go" && /go to coupon lab/i.test(pick.text)

/** Builds a four-option question; the derived fact must hold or the script stops (no key is ever guessed). The correct option sits at `at`. */
function choice(
  id: string,
  text: string,
  derived: boolean,
  correct: string,
  wrong: [string, string, string],
  at: number,
  derived_from: string[],
) {
  if (!derived)
    throw new Error(
      `${id}: the run data does not support the expected answer; rewrite the question`,
    )
  const texts = [...wrong]
  texts.splice(at, 0, correct)
  const letters = ["A", "B", "C", "D"]
  return {
    id,
    type: "choice",
    text,
    options: Object.fromEntries(texts.map((t, i) => [letters[i], t])),
    key: letters[at] as string,
    derived_from,
  }
}
const siteName = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const fixture = {
  version: 1,
  run_id: meta.run_id,
  pass_mark: 7,
  note: "Keys are derived by docs/spikes/plan-06/q6_comprehension_keys.ts from the run files named in derived_from. Never edit by hand; rerun the script.",
  answer_format:
    "A JSON object mapping question id to a string: an id, a number, or one option letter.",
  questions: [
    {
      id: "Q1",
      type: "id",
      text: "Which of the three recommended recipes cools the roof the most? Give its identifier (for example SP-000).",
      key: pick.id,
      derived_from: ["results.csv t_max_pred", "candidate_cards/*.md"],
    },
    {
      id: "Q2",
      type: "number",
      digits: 1,
      unit: "K",
      text: "By how many kelvin does that recipe lower the peak surface temperature compared with bare aluminium (scenario mean)? Give one number with one decimal.",
      key: Number(cooling.toFixed(1)),
      derived_from: ["controls.csv C0 t_max_pred", "results.csv t_max_pred"],
    },
    choice(
      "Q3",
      "Is the cooling number on the page a measurement?",
      measuredAnswer,
      "No, it is a prediction of a model for the freshly applied coating, not a measurement",
      [
        "Yes, measured on coated aluminium samples",
        "Partly measured, partly modelled",
        "Yes, measured on real roofs in Indonesia",
      ],
      2,
      ["results.csv columns", "run_manifest.json files"],
    ),
    choice(
      "Q4",
      "What does the label PROXY mean next to a number?",
      proxyAnswer,
      "A relative ranking index, not a measurement and not a probability",
      [
        "A calibrated probability that the coating will fail",
        "A value measured by a proxy instrument",
        "A value copied from the manufacturer's datasheet",
      ],
      0,
      ["results.csv *_proxy columns within [0,1]"],
    ),
    {
      id: "Q5",
      type: "number",
      digits: 2,
      unit: "relative cost units",
      text: "On the balanced budget curve, at what cost (relative units, not rupiah) does paying more stop buying much, the knee of the curve? Give one number with two decimals.",
      key: Number(knee.toFixed(2)),
      derived_from: ["refine/budget_table.json tables[balanced].knee_budget"],
    },
    {
      id: "Q6",
      type: "id",
      text: "Which of the five Indonesian sites benefits most from the cooling-pick recipe? Give the site name.",
      key: bestSite.site,
      derived_from: [
        "indonesia/indonesia_summary.csv dq_w_m2, initial, weighted",
      ],
    },
    choice(
      "Q7",
      "Which of these does the report say it does not model or does not know?",
      notModelled,
      "Weathering, ageing and adhesion of the coating",
      [
        "Sunlight reflected by the coating",
        "Heat conducted into the building",
        "Scattering of light by the pigments",
      ],
      3,
      ["candidate_cards/<pick>.md limits"],
    ),
    choice(
      "Q8",
      "What does the report recommend as the next step for the cooling pick?",
      nextStep,
      "Make small coated samples and test them in a laboratory",
      [
        "Coat a real roof now",
        "Publish the numbers as validated results",
        "Nothing, the recipe is rejected",
      ],
      1,
      ["candidate_cards/<pick>.md Decision"],
    ),
  ],
  // Facts the stripped negative control removes (see q6_strip_key_facts.ts): regular expressions derived from the keys.
  key_facts: {
    Q1: ["SP-\\d{3}"],
    Q2: [
      pick.t.toFixed(1),
      pick.t.toFixed(3),
      c0.toFixed(1),
      c0.toFixed(2),
      cooling.toFixed(1),
    ],
    Q3: [
      "measurement",
      "measured",
      "laboratory",
      "prediction",
      "initial",
      "as-applied",
      "uncalibrated",
      "scenario model",
    ],
    Q4: ["PROXY", "relative (ranking|index)"],
    Q5: ["knee", knee.toFixed(4), knee.toFixed(2), "budget"],
    Q6: ["Jakarta", "Surabaya", "Medan", "Makassar", "Bandung"],
    Q7: ["weathering", "ageing", "adhesion", "not modelled", "unknown"],
    Q8: ["coupon", "next step", "laboratory", "lab\\b", "\\bgo\\b", "revise"],
  },
  // For the author's information: the facts behind each key.
  facts: {
    pick: pick.id,
    pick_mean_tmax_c: +pick.t.toFixed(3),
    c0_mean_tmax_c: +c0.toFixed(3),
    cooling_k: +cooling.toFixed(3),
    knee: +knee.toFixed(4),
    site: siteName(bestSite.site),
    site_benefit_w_m2: +bestSite.dq.toFixed(2),
    decision,
  },
}
writeFileSync(outFile, `${JSON.stringify(fixture, null, 2)}\n`)
console.log(
  `wrote ${outFile}: pick ${pick.id}, cooling ${fixture.facts.cooling_k} K, knee ${fixture.facts.knee}, site ${bestSite.site}, decision ${decision}`,
)

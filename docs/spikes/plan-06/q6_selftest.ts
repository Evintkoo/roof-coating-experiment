// Plan 06 spike Q6: prove the comprehension harness can pass and can fail. Exit 0 only when every expectation holds.
// Run: bun docs/spikes/plan-06/q6_selftest.ts
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { type Fixture, score } from "./q6_score"
import { type KeyFacts, strip } from "./q6_strip_key_facts"

const HERE = dirname(new URL(import.meta.url).pathname)
const ROOT = join(HERE, "..", "..", "..")
const FX = join(ROOT, "tests/fixtures/comprehension.json")
const fails: string[] = []
const expect = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`)
  if (!cond) fails.push(msg)
}
const tmp = mkdtempSync(join(tmpdir(), "plan06-q6-"))

// 1. keys are derived, deterministic and equal to the committed fixture.
const regen = join(tmp, "fx.json")
const r1 = Bun.spawnSync([
  "bun",
  join(HERE, "q6_comprehension_keys.ts"),
  join(ROOT, "reports/plan-00-run"),
  regen,
])
expect(r1.exitCode === 0, "the key script runs on the real run")
expect(
  readFileSync(regen, "utf8") === readFileSync(FX, "utf8"),
  "regenerating the fixture reproduces the committed bytes",
)
const fx = JSON.parse(readFileSync(FX, "utf8")) as Fixture & {
  key_facts: KeyFacts
  questions: {
    id: string
    key: string | number
    type: string
    options?: Record<string, string>
  }[]
}
expect(fx.questions.length === 8, "eight questions")
const letters = fx.questions
  .filter((q) => q.type === "choice")
  .map((q) => q.key)
expect(
  new Set(letters).size === letters.length,
  `the correct option letters differ across the choice questions (${letters.join(",")}), so a pattern guess does not work`,
)

// 2. the scorer passes a perfect sheet and fails weaker ones.
const perfect = Object.fromEntries(
  fx.questions.map((q) => [q.id, String(q.key)]),
)
expect(score(fx, perfect).score === 8, "a perfect answer sheet scores 8 of 8")
const noisy = { ...perfect, Q1: "SP-031", Q2: "13.0" }
expect(
  score(fx, noisy).score === 6 && score(fx, noisy).score < fx.pass_mark,
  "two wrong answers score 6 of 8, below the pass mark of 7",
)
const oneOff = { ...perfect, Q5: "0.5" }
expect(
  score(fx, oneOff).score === 7,
  "one wrong answer scores 7 of 8, exactly the pass mark",
)
expect(
  score(fx, { ...perfect, Q2: "14.4 K" }).score === 8 &&
    score(fx, { ...perfect, Q6: " Medan " }).score === 8 &&
    score(fx, { ...perfect, Q3: "(c) prediction" }).score === 8,
  "formatting noise (units, case, spaces, option letter with text) does not change a right answer",
)
const bash = (a: object) => {
  const p = join(tmp, `a${Math.random().toString(36).slice(2)}.json`)
  writeFileSync(p, JSON.stringify(a))
  return Bun.spawnSync(["bun", join(HERE, "q6_score.ts"), p]).exitCode
}
expect(
  bash(perfect) === 0 && bash(noisy) === 1,
  "the scorer CLI exits 0 at 8 of 8 and 1 at 6 of 8",
)
expect(
  Bun.spawnSync(["bun", join(HERE, "q6_score.ts")]).exitCode === 2,
  "the scorer CLI exits 2 without arguments",
)

// 3. the key facts are present in the current report and removed by the stripper (the negative control).
const html = readFileSync(join(ROOT, "reports/report.html"), "utf8")
const page = html
  .replace(/<(script|style)\b[\s\S]*?<\/\1>/g, " ")
  .replace(/<\/(p|div|li|h\d|tr|section|summary|caption)>/g, "\n")
  .replace(/<\/t[dh]>/g, "\t")
  .replace(/<[^>]+>/g, " ")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&#39;|&apos;/g, "'")
  .replace(/&quot;/g, '"')
const before = Object.entries(fx.key_facts).map(
  ([q, ps]) =>
    [q, ps.filter((p) => new RegExp(p, "i").test(page)).length] as const,
)
for (const [q, n] of before)
  expect(
    n > 0,
    `${q}: at least one key-fact pattern matches the current report text (${n} of ${fx.key_facts[q]?.length})`,
  )
const s = strip(page, fx.key_facts)
expect(
  Object.values(s.survivors).every((n) => n === 0),
  "after stripping, no key-fact pattern matches any more",
)
expect(
  s.text.length < page.length && s.text.length > page.length * 0.5,
  `the stripped text keeps most of the page (${s.text.length} of ${page.length} characters), so it is not simply empty`,
)
for (const k of ["SP-075", "medan", "0.4230", "weathering", "coupon"])
  expect(
    !new RegExp(k, "i").test(s.text),
    `the stripped text no longer contains "${k}"`,
  )
const pickId = String(fx.questions[0]?.key)
expect(
  new RegExp(pickId, "i").test(page),
  `control of the control: the original page does contain ${pickId}`,
)

process.exit(fails.length ? 1 : 0)

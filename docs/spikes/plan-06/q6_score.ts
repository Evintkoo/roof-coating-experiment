// Plan 06 comprehension scorer (H3). Exact-key match against tests/fixtures/comprehension.json.
// Usage: bun docs/spikes/plan-06/q6_score.ts <answers.json> [fixture.json]
// answers.json: {"Q1": "SP-075", "Q2": "14.4", "Q3": "C", ...}. Prints the score as JSON.
// Exit 0 when score >= pass_mark (7 of 8), 1 when below, 2 on a usage or format error.
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type Question = {
  id: string
  type: "id" | "number" | "choice"
  key: string | number
  digits?: number
}
export type Fixture = { pass_mark: number; questions: Question[] }

export function normalise(q: Question, raw: unknown): string | number | null {
  if (typeof raw !== "string" && typeof raw !== "number") return null
  const s = String(raw).trim()
  if (q.type === "number") {
    const m = /-?\d+(?:\.\d+)?/.exec(s)
    return m ? Number(Number(m[0]).toFixed(q.digits ?? 0)) : null
  }
  if (q.type === "choice") {
    const m = /^\(?([A-Da-d])\b/.exec(s)
    return m ? (m[1] as string).toUpperCase() : null
  }
  return s.toLowerCase().replace(/\s+/g, "")
}
export function score(fx: Fixture, answers: Record<string, unknown>) {
  const per = fx.questions.map((q) => {
    const got = normalise(q, answers[q.id])
    const want =
      q.type === "id" ? String(q.key).toLowerCase().replace(/\s+/g, "") : q.key
    return { id: q.id, got, want: q.key, correct: got !== null && got === want }
  })
  return {
    score: per.filter((p) => p.correct).length,
    total: fx.questions.length,
    pass_mark: fx.pass_mark,
    per,
  }
}
if (import.meta.main) {
  const [answersPath, fxPath] = process.argv.slice(2)
  if (!answersPath) {
    console.error("usage: q6_score.ts <answers.json> [fixture.json]")
    process.exit(2)
  }
  try {
    const fx = JSON.parse(
      readFileSync(
        fxPath ??
          join(
            dirname(new URL(import.meta.url).pathname),
            "../../../tests/fixtures/comprehension.json",
          ),
        "utf8",
      ),
    ) as Fixture
    const answers = JSON.parse(readFileSync(answersPath, "utf8")) as Record<
      string,
      unknown
    >
    const r = score(fx, answers)
    console.log(JSON.stringify(r))
    process.exit(r.score >= r.pass_mark ? 0 : 1)
  } catch (e) {
    console.error(`cannot score: ${(e as Error).message}`)
    process.exit(2)
  }
}

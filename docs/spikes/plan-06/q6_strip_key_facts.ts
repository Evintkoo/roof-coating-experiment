// Plan 06 negative control for H3: write a copy of a text file with the key facts removed.
// Usage: bun docs/spikes/plan-06/q6_strip_key_facts.ts <in.txt> <out.txt> [fixture.json]
// Every cell and sentence that matches a key-fact pattern of the fixture is dropped. Prints how many were dropped per question.
// Exit 0 when the output contains no key-fact match any more, 1 when something survived, 2 on a usage error.
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"

export type KeyFacts = Record<string, string[]>
export function compile(facts: KeyFacts): Record<string, RegExp[]> {
  return Object.fromEntries(
    Object.entries(facts).map(([q, ps]) => [
      q,
      ps.map((p) => new RegExp(p, "i")),
    ]),
  )
}
export function strip(
  text: string,
  facts: KeyFacts,
): {
  text: string
  dropped: Record<string, number>
  survivors: Record<string, number>
} {
  const re = compile(facts)
  const dropped: Record<string, number> = Object.fromEntries(
    Object.keys(facts).map((q) => [q, 0]),
  )
  const out = text.split("\n").map((line) =>
    line
      .split("\t")
      .map((cell) =>
        cell
          .split(/(?<=[.!?])\s+/)
          .filter((sentence) => {
            const hits = Object.entries(re).filter(([, rs]) =>
              rs.some((r) => r.test(sentence)),
            )
            for (const [q] of hits) dropped[q] = (dropped[q] ?? 0) + 1
            return hits.length === 0
          })
          .join(" "),
      )
      .join("\t"),
  )
  const result = out.join("\n")
  const survivors = Object.fromEntries(
    Object.entries(re).map(([q, rs]) => [
      q,
      rs.filter((r) => r.test(result)).length,
    ]),
  )
  return { text: result, dropped, survivors }
}
if (import.meta.main) {
  const [inp, outp, fxPath] = process.argv.slice(2)
  if (!inp || !outp) {
    console.error(
      "usage: q6_strip_key_facts.ts <in.txt> <out.txt> [fixture.json]",
    )
    process.exit(2)
  }
  const fx = JSON.parse(
    readFileSync(
      fxPath ??
        join(
          dirname(new URL(import.meta.url).pathname),
          "../../../tests/fixtures/comprehension.json",
        ),
      "utf8",
    ),
  ) as { key_facts: KeyFacts }
  const r = strip(readFileSync(inp, "utf8"), fx.key_facts)
  writeFileSync(outp, r.text)
  console.log(JSON.stringify({ dropped: r.dropped, survivors: r.survivors }))
  process.exit(Object.values(r.survivors).some((n) => n > 0) ? 1 : 0)
}

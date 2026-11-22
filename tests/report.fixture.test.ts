// The committed fixture run (tests/fixtures/report-run) builds the report through the real CLI, and a changed refine cell is refused.
import { expect, test } from "bun:test"
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { REPORT_FIXTURE, run } from "./helpers"

const copy = (): string => {
  const dst = mkdtempSync(join(tmpdir(), "spandek-fixture-"))
  cpSync(REPORT_FIXTURE, dst, { recursive: true })
  return dst
}

test("fixtureRunBuildsTheReportWithExitZero", async () => {
  const dir = copy()
  const r = await run(["report", "--in", dir, "--max-load", "1000"])
  expect(r.exitCode).toBe(0)
  const html = readFileSync(join(dir, "report.html"), "utf8")
  expect(html).toContain("refine_recipes.csv")
  expect(html).toContain("indonesia_summary.csv")
}, 120000)

test("tamperingOneRefineCellExitsFive", async () => {
  const dir = copy()
  const p = join(dir, "refine", "refine_recipes.csv")
  const text = readFileSync(p, "utf8")
  const changed = text.replace(/(\d)(?=\D*$)/, (d) =>
    String((Number(d) + 1) % 10),
  )
  expect(changed).not.toBe(text)
  writeFileSync(p, changed)
  const r = await run(["report", "--in", dir, "--max-load", "1000"])
  expect(r.exitCode).toBe(5)
}, 120000)

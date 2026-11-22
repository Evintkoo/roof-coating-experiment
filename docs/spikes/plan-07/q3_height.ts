// Q3: closed page height at 1280 px of the report built from the committed fixture run, and the headroom for the
// Watch it run section at the plan's D8 sizes (day player at most 360 px, screening at most 420 px, plus a heading each).
import { cpSync, mkdtempSync, readFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import { expectOk, finish, fixture, root } from "./lib"

const dir = mkdtempSync(join(tmpdir(), "q3-"))
cpSync(fixture, dir, { recursive: true })
const p = Bun.spawnSync(
  [
    "bun",
    "run",
    "src/node/cli.ts",
    "report",
    "--in",
    dir,
    "--max-load",
    "1000",
  ],
  { cwd: root, stdout: "pipe", stderr: "pipe" },
)
expectOk(
  "report builds from the fixture",
  p.exitCode === 0,
  `exit ${p.exitCode}`,
)
const file = join(dir, "report.html")
const mib = statSync(file).size / 1048576
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  timeout: 30_000,
  args: ["--disable-gpu"],
})
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(1500)
  const h = await page.evaluate(() => document.documentElement.scrollHeight)
  const secs = await page.evaluate(() =>
    [...document.querySelectorAll("main > section, main section[id]")].map(
      (s) => [
        (s as HTMLElement).id,
        Math.round(s.getBoundingClientRect().height),
      ],
    ),
  )
  console.log(
    `closed height ${h} px at 1280 (cap 9000), file ${mib.toFixed(2)} MiB (cap 8)`,
  )
  console.log(secs.map(([i, v]) => `${i}=${v}`).join(" "))
  const need = 360 + 420 + 2 * 80
  console.log(
    `Watch it run at D8 sizes needs about ${need} px (360 + 420 + two headings of about 80); headroom ${9000 - h} px`,
  )
  expectOk(
    "D8 fallback IS needed: the section at full D8 sizes does not fit under 9000 (the cap is never raised)",
    h + need > 9000,
    `${h} + ${need} = ${h + need}`,
  )
  const closedNeed = 80 + 300 + 100
  console.log(
    `with the screening collapsed to its button (about 100 px) and a 300 px day player the section is about ${closedNeed} px; ${Math.max(0, h + closedNeed - 9000)} px must still be reclaimed elsewhere (flux schematic to Details, per D8)`,
  )
  expectOk(
    "file size leaves room for the animation code (cap 8 MiB, animation at most 150 KiB)",
    mib + 150 / 1024 <= 8,
  )
} finally {
  await browser.close()
}
finish()

// Q2: closed height at 1280 px of the report built from the fixture, then the same page with the screening row's summary replaced
// by the real tabs summary; and the height of the opened disclosure (the open budget T_open_px).
import { cpSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import { buildReport } from "../../../src/node/report/html"
import { REPORT_FIXTURE, reportOpts } from "../../../tests/helpers"
import { expectOk, finish } from "./lib"

const run = mkdtempSync(join(tmpdir(), "q2-run-"))
cpSync(REPORT_FIXTURE, run, { recursive: true })
const path = join(mkdtempSync(join(tmpdir(), "q2-html-")), "report.html")
await buildReport(run, path, reportOpts())
const html = readFileSync(path, "utf8")
const OLD = /Run the screening in my browser: \d+ recipes on \d+ weather days/
expectOk("the closed screening summary is in the page", OLD.test(html))
const mock = path.replace("report.html", "mock.html")
writeFileSync(
  mock,
  html.replace(
    OLD,
    "More ways to watch: screening, controls, one variable at a time",
  ),
)
const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  timeout: 30_000,
  args: ["--disable-gpu"],
})
const measure = async (file: string, open: boolean) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await page.goto(`file://${file}`)
  await page.waitForTimeout(1500)
  const r = await page.evaluate((o) => {
    const d = document.getElementById("details-screening") as HTMLDetailsElement
    const closed = document.documentElement.scrollHeight
    const row = d.querySelector("summary")!.getBoundingClientRect().height
    let openH = 0
    if (o) {
      d.open = true
      openH = d.getBoundingClientRect().height
    }
    return { closed, row, openH }
  }, open)
  await page.close()
  return r
}
try {
  const a = await measure(path, true)
  const b = await measure(mock, false)
  console.log(
    `baseline closed ${a.closed} px (summary row ${a.row} px); mock summary closed ${b.closed} px (row ${b.row} px); open screening disclosure ${a.openH} px`,
  )
  expectOk(
    "T_delta_px 0: the shorter summary does not grow the page",
    b.closed <= a.closed,
    `${b.closed} vs ${a.closed}`,
  )
  expectOk("closed baseline within 9000", a.closed <= 9000)
  console.log(`BASELINE_CLOSED_PX=${a.closed}`)
} finally {
  await browser.close()
}
finish()

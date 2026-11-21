import { beforeAll, expect, test } from "bun:test"
import {
  appendFileSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseCsv } from "../../../src/core/csv"
import { parseParetoCsv } from "../../../src/core/pipeline/tables"
import { configureLogging, newRunId } from "../../../src/node/logging"
import {
  buildReport,
  dataJson,
  esc,
  renderMarkdown,
  T_SIZE_MB,
} from "../../../src/node/report/html"
import { axisLabel } from "../../../src/web/figures"
import { contrastRatio } from "../../../src/web/fmt"
import {
  buildTestReport,
  copyRun,
  repoRoot,
  reportOpts,
  scriptBlocks,
  visibleText,
} from "../../helpers"

let built: { dir: string; path: string; html: string }
beforeAll(async () => {
  built = await buildTestReport()
})

const outPath = () =>
  join(mkdtempSync(join(tmpdir(), "spandek-out-")), "report.html")
const codeOf = async (f: () => Promise<unknown>): Promise<number> => {
  try {
    await f()
  } catch (e) {
    return (e as { code?: number }).code ?? -1
  }
  return 0
}

test("singleFileNoNetworkTags", () => {
  const [, , main] = scriptBlocks(built.html)
  const rest = built.html.replace(scriptBlocks(built.html)[1] as string, "")
  expect(rest).not.toMatch(/<script[^>]*\ssrc=/i)
  expect(rest).not.toMatch(/<link\b/i)
  expect(rest).not.toMatch(/<(img|iframe|video|audio|source|object|embed)\b/i)
  expect(rest).not.toMatch(/\s(src|href)\s*=\s*["']?(https?:)?\/\//i)
  expect(rest).not.toMatch(/@import/i)
  expect(rest).not.toMatch(/url\(\s*["']?(https?:)?\/\//i)
  // the page's own code (data, worker source, main bundle) has no network API
  expect(rest).not.toMatch(
    /\bfetch\s*\(|XMLHttpRequest|importScripts|WebSocket|sendBeacon/,
  )
  expect(main).toBeTruthy()
  expect(scriptBlocks(built.html).length).toBe(3)
})

test("sameInputsSameBytesAndInputChangeChangesBytes", async () => {
  const a = await buildReport(built.dir, outPath(), reportOpts())
  const b = await buildReport(built.dir, outPath(), reportOpts())
  expect(a).toBe(b)
  const copy = await copyRun()
  const card = join(copy, "candidate_cards", readdirCard(copy))
  appendFileSync(card, "\nOne more sentence in the card.\n")
  const c = await buildReport(copy, outPath(), reportOpts())
  expect(c).not.toBe(a)
})
const readdirCard = (dir: string): string =>
  (
    require("node:fs").readdirSync(join(dir, "candidate_cards")) as string[]
  ).sort()[0] as string

test("nonFiniteNeverReachesJson", () => {
  for (const bad of [
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ])
    expect(() => dataJson({ a: [1, { b: bad }] })).toThrow()
  expect(dataJson({ b: 1, a: "</script><!--" })).toBe(
    '{"a":"\\u003c/script>\\u003c!--","b":1}',
  )
  // the built page's data block parses and holds only finite numbers
  const data = scriptBlocks(built.html)[0] as string
  const obj = JSON.parse(data.replace(/^window\.__SPANDEK__ = /, ""))
  expect(Object.keys(obj)).toEqual([...Object.keys(obj)].sort())
})

test("sizeWithinLimit", () => {
  const bytes = statSync(built.path).size
  expect(bytes).toBeLessThan(T_SIZE_MB * 1024 * 1024)
  expect(bytes).toBeLessThan(16 * 1024 * 1024)
})

test("scriptTagInCellIsEscaped", async () => {
  const evil = "</script><img src=x onerror=alert(1)><!-- <b>"
  const copy = await copyRun()
  appendFileSync(
    join(copy, "candidate_cards", readdirCard(copy)),
    `\n${evil}\n`,
  )
  const curves = JSON.parse(readFileSync(join(copy, "curves.json"), "utf8"))
  curves.series[0].id = evil
  writeFileSync(join(copy, "curves.json"), JSON.stringify(curves))
  const out = outPath()
  await buildReport(copy, out, reportOpts())
  const html = readFileSync(out, "utf8")
  expect(html).not.toContain("<img src=x")
  expect(html).not.toContain("onerror=alert(1)><!--")
  expect([...html.matchAll(/<\/script/gi)].length).toBe(3)
  expect(html).toContain("&lt;/script&gt;")
  // a bad candidate id in a CSV is refused, not rendered
  const bad = await copyRun()
  const p = join(bad, "pareto.csv")
  writeFileSync(p, readFileSync(p, "utf8").replace("SP-001", "<b>x</b>"))
  expect(await codeOf(() => buildReport(bad, outPath(), reportOpts()))).toBe(2)
  expect(esc(`<a href="x">&'`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;&#39;")
  expect(
    renderMarkdown("# A <b>\n\n| x | y |\n|---|---|\n| <i> | 2 |\n\n- <u>"),
  ).not.toMatch(/<(b|i|u)>/)
})

test("everyProxyColumnHeaderSaysProxy", () => {
  const table = /<table id="tbl-explorer">([\s\S]*?)<\/table>/.exec(
    built.html,
  )?.[1] as string
  const heads = [
    ...(
      table.match(/<thead>[\s\S]*?<\/thead>/) as RegExpMatchArray
    )[0].matchAll(/<th[^>]*>(.*?)<\/th>/g),
  ].map((m) => m[1] as string)
  expect(heads.length).toBe(10)
  for (const h of heads)
    if (/corrosion|delam|cost/i.test(h)) expect(h).toContain("(PROXY)")
  expect(heads.filter((h) => h.includes("(PROXY)")).length).toBe(3)
  expect(heads).toContain(esc(axisLabel("cost_proxy")))
})

test("tableValuesEqualCsv", () => {
  const rows = parseParetoCsv(
    readFileSync(join(built.dir, "pareto.csv"), "utf8"),
  )
  expect(rows.length).toBe(96)
  const table = /<table id="tbl-explorer">([\s\S]*?)<\/table>/.exec(
    built.html,
  )?.[1] as string
  const trs = [...table.matchAll(/<tr data-id="([^"]+)">([\s\S]*?)<\/tr>/g)]
  expect(trs.length).toBe(96)
  const cols = [
    "candidate_id",
    "r_solar_pred",
    "t_max_pred",
    "corrosion_proxy",
    "delam_proxy",
    "cost_proxy",
    "t_max_worst",
    "on_front",
    "pareto_freq",
    "role",
  ] as const
  trs.forEach((tr, i) => {
    const row = rows[i] as unknown as Record<string, unknown>
    expect(tr[1]).toBe(row.candidate_id as string)
    const cells = [
      ...(tr[2] as string).matchAll(
        /<td[^>]*data-col="(\w+)"[^>]*>(.*?)<\/td>/g,
      ),
    ]
    expect(cells.map((c) => c[1])).toEqual([...cols])
    for (const c of cells) {
      const v = row[c[1] as string]
      if (typeof v === "number")
        expect(Math.abs(Number(c[2]) - v)).toBeLessThanOrEqual(5.0001e-5)
      else expect(c[2]).toBe(String(v))
    }
  })
  // the CSV really has 96 data rows (the oracle is independent of parseParetoCsv)
  expect(
    parseCsv(readFileSync(join(built.dir, "pareto.csv"), "utf8")).length,
  ).toBe(96)
})

function tokens(css: string, block: RegExp): Record<string, string> {
  const m = block.exec(css)
  if (!m) throw new Error("token block not found")
  return Object.fromEntries(
    [...(m[1] as string).matchAll(/--([\w-]+):\s*(#[0-9a-fA-F]{6})/g)].map(
      (t) => [t[1] as string, t[2] as string],
    ),
  )
}

test("contrastTokensPassBothThemes", () => {
  const css = readFileSync(join(repoRoot, "src", "web", "theme.css"), "utf8")
  const light = tokens(css, /:root \{([\s\S]*?)\n\}/)
  const darkAttr = tokens(css, /:root\[data-theme="dark"\] \{([\s\S]*?)\n\}/)
  const darkMedia = tokens(
    css,
    /:root:not\(\[data-theme="light"\]\) \{([\s\S]*?)\n {2}\}/,
  )
  expect(darkMedia).toEqual(darkAttr)
  const pairs: [string, string][] = [
    ["fg", "bg"],
    ["fg", "surface"],
    ["muted", "bg"],
    ["muted", "surface"],
    ["link", "bg"],
    ["link", "surface"],
    ["on-accent", "accent"],
    ["warn-fg", "warn-bg"],
    ["axis", "bg"],
  ]
  for (const theme of [light, darkAttr])
    for (const [f, b] of pairs)
      expect(
        contrastRatio(theme[f] as string, theme[b] as string),
        `${f} on ${b}`,
      ).toBeGreaterThanOrEqual(4.5)
  // the check can fail: a mid grey on white does not pass
  expect(contrastRatio("#888888", "#ffffff")).toBeLessThan(4.5)
})

test("productionBundleHasNoConsole", () => {
  for (const f of [
    "main.ts",
    "worker.ts",
    "figures.ts",
    "linking.ts",
    "liveState.ts",
    "fmt.ts",
  ])
    expect(
      readFileSync(join(repoRoot, "src", "web", f), "utf8"),
      f,
    ).not.toMatch(/\bconsole\./)
  const [, , main] = scriptBlocks(built.html)
  expect(main).not.toMatch(/\bconsole\./)
  const data = scriptBlocks(built.html)[0] as string
  const worker = JSON.parse(data.replace(/^window\.__SPANDEK__ = /, ""))
    .workerSrc as string
  expect(worker).not.toMatch(/\bconsole\./)
  expect(worker).not.toContain("ZodError")
  expect(worker).toContain("liveSimulate")
})

test("refuseIntervalOrderF1", async () => {
  const copy = await copyRun()
  const p = join(copy, "results.csv")
  const lines = readFileSync(p, "utf8").split("\n")
  const header = (lines[0] as string).split(",")
  const row = (lines[1] as string).split(",")
  row[header.indexOf("t_max_lo")] = String(
    Number(row[header.indexOf("t_max_pred")]) + 1,
  )
  lines[1] = row.join(",")
  writeFileSync(p, lines.join("\n"))
  const runDir = mkdtempSync(join(tmpdir(), "spandek-log-"))
  configureLogging({ runId: newRunId(), level: "info", runDir })
  const out = outPath()
  expect(await codeOf(() => buildReport(copy, out, reportOpts()))).toBe(2)
  expect(existsSync(out)).toBe(false)
  const ev = readFileSync(join(runDir, "run.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
  const refused = ev.find((e) => e.event === "report.refused")
  expect(refused).toMatchObject({
    level: "error",
    code: "interval_order",
    key: "t_max_lo",
  })
  configureLogging({ runId: "x", level: "error" })
})

test("missingSensitivityF2", async () => {
  const copy = await copyRun()
  require("node:fs").rmSync(join(copy, "sensitivity.csv"))
  const out = outPath()
  expect(await codeOf(() => buildReport(copy, out, reportOpts()))).toBe(5)
  expect(existsSync(out)).toBe(false)
})

test("oversizeRefusedF7", async () => {
  const copy = await copyRun()
  appendFileSync(
    join(copy, "candidate_cards", readdirCard(copy)),
    `\n${"x".repeat(20 * 1024 * 1024)}\n`,
  )
  const out = outPath()
  expect(await codeOf(() => buildReport(copy, out, reportOpts()))).toBe(2)
  expect(existsSync(out)).toBe(false)
  expect(existsSync(`${out}.tmp`)).toBe(false)
})

test("noTimestampInTemplate", () => {
  const stamp =
    /new Date|Date\.now|performance\.timeOrigin|\b\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/
  const tpl = readFileSync(
    join(repoRoot, "src", "web", "template.html"),
    "utf8",
  )
  const css = readFileSync(join(repoRoot, "src", "web", "theme.css"), "utf8")
  expect(tpl).not.toMatch(stamp)
  expect(css).not.toMatch(stamp)
  const [, , main] = scriptBlocks(built.html)
  expect(main).not.toMatch(stamp)
  // the detector can fail
  expect(`${tpl}<p>${"Built " + "2026-11-21T10:00:00"}</p>`).toMatch(stamp)
  expect("x = new Date()").toMatch(stamp)
})

test("markdownRendererKeepsTablesAndLists", () => {
  const h = renderMarkdown(
    "### Title\n\nPara one\ncontinues.\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n- x\n- y\n",
  )
  expect(h).toContain("<h4>Title</h4>")
  expect(h).toContain("<p>Para one continues.</p>")
  expect(h).toContain("<th>a</th>")
  expect(h).toContain("<td>1</td>")
  expect(h).toContain("<li>y</li>")
})

test("templateFullyFilledAndPlotlyPresent", () => {
  const blocks = scriptBlocks(built.html)
  expect(blocks.length).toBe(3)
  expect(blocks[1]).toContain("plotly.js v4.3.0")
  expect(blocks[1]?.length).toBeGreaterThan(1_000_000)
  expect(blocks[2]).toContain("__SPANDEK__")
  expect(built.html).not.toContain("{{raw:")
  expect(built.html).not.toContain("{{title}}")
  // the placeholders in the template itself are intact (a formatter once stripped the braces)
  const tpl = readFileSync(
    join(repoRoot, "src", "web", "template.html"),
    "utf8",
  )
  for (const k of [
    "raw:css",
    "raw:nav",
    "raw:sections",
    "raw:data",
    "raw:plotly",
    "raw:main",
    "title",
  ])
    expect(tpl).toContain(`{{${k}}}`)
})

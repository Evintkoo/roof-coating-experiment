// Plan 00 Task 1 browser spike (Q1-Q3). Run: bun run docs/spikes/plan-00/spike.ts
// Writes the toy page to a temp dir (not the repo); exits non-zero if any expectation fails.
import { createHash } from "node:crypto"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { chromium } from "playwright"

const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, "..", "..", "..")
const failures: string[] = []
const expect = (name: string, ok: boolean, detail?: unknown) => {
  console.log(
    `${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : ` ${JSON.stringify(detail)}`}`,
  )
  if (!ok) failures.push(name)
}
const sha = (s: string | Uint8Array) =>
  createHash("sha256").update(s).digest("hex")

async function buildPage(): Promise<string> {
  const out = await Bun.build({
    entrypoints: [join(here, "page.ts")],
    target: "browser",
    minify: true,
  })
  if (!out.success) throw new Error(`build failed: ${out.logs.join("\n")}`)
  const js = await out.outputs[0]?.text()
  const plotly = readFileSync(
    join(root, "node_modules/plotly.js-dist-min/plotly.min.js"),
    "utf8",
  )
  const safe = (t: string) => t.replace(/<\/script/gi, "<\\/script")
  return `<!doctype html><html><head><meta charset="utf-8"><title>spike</title><style>
:root{--bg:#fff;--fg:#111}
:root[data-theme=dark]{--bg:#111;--fg:#eee}
body{background:var(--bg);color:var(--fg);margin:8px}
:root[data-theme=dark] #pc .parcoords .axis path,:root[data-theme=dark] #pc .parcoords .axis line,:root[data-theme=dark] #pc .parcoords .axis .domain{stroke:#eee!important}
</style></head><body>
<select id="sel"><option>a</option><option>b</option></select>
<div id="pc" style="width:900px;height:360px"></div><div id="splom"></div>
<table id="tbl"></table>
<script>${safe(plotly)}</script><script>${safe(js ?? "")}</script></body></html>`
}

// Q2
const html1 = await buildPage()
const html2 = await buildPage()
const h1 = sha(html1)
const h2 = sha(html2)
console.log(
  `Q2 sha256 build1 ${h1}\nQ2 sha256 build2 ${h2}\nbytes ${html1.length}`,
)
expect("Q2 byte-identical", html1 === html2 && h1 === h2)

const dir = mkdtempSync(join(tmpdir(), "spike-plan00-"))
const file = join(dir, "toy.html")
writeFileSync(file, html1)

const browser = await chromium.launch({ channel: "chrome", headless: true })
try {
  const ctx = await browser.newContext({
    viewport: { width: 1000, height: 900 },
  })
  const page = await ctx.newPage()
  const consoleErrors: string[] = []
  page.on(
    "console",
    (m) => m.type() === "error" && consoleErrors.push(m.text()),
  )
  page.on("pageerror", (e) => consoleErrors.push(String(e)))
  await page.goto(`file://${file}`)
  await page.waitForFunction("window.ready === true")
  console.log(
    "versions",
    JSON.stringify({
      chrome: browser.version(),
      plotly: await page.evaluate("Plotly.version"),
    }),
  )

  const w = (expr: string) => page.evaluate(expr) as Promise<any>
  const ev = async () =>
    (await w("window.__events")) as { payload: any; read: any[] }[]
  const brushBox = async (i: number) => {
    const boxes = await page.$$eval("#pc .axis-brush rect.background", (els) =>
      els.map((e) => {
        const r = e.getBoundingClientRect()
        return { x: r.x, y: r.y, w: r.width, h: r.height }
      }),
    )
    return boxes[i]
  }
  const drag = async (axis: number, f0: number, f1: number) => {
    const b = await brushBox(axis)
    if (!b) throw new Error(`no brush box for axis ${axis}`)
    const x = b.x + b.w / 2
    await page.mouse.move(x, b.y + b.h * f0)
    await page.mouse.down()
    await page.mouse.move(x, b.y + b.h * ((f0 + f1) / 2), { steps: 5 })
    await page.mouse.move(x, b.y + b.h * f1, { steps: 5 })
    await page.mouse.up()
    await page.waitForTimeout(300)
  }
  const nBoxes = (await page.$$("#pc .axis-brush rect.background")).length
  expect("brush rects found (5 axes)", nBoxes === 5, nBoxes)

  // Q1: single range on axis 1
  let before = (await ev()).length
  await drag(1, 0.2, 0.5)
  let e = await ev()
  expect(
    "single drag fires exactly one restyle",
    e.length - before === 1,
    e.length - before,
  )
  let last = e[e.length - 1]
  console.log(
    "single payload",
    JSON.stringify(last?.payload),
    "read",
    JSON.stringify(last?.read),
  )
  const key1 = "dimensions[1].constraintrange"
  // restyle wraps the value in a per-trace array: payload value [[lo,hi]] is the flat range [lo,hi] for trace 0
  expect(
    "single payload value is [[lo,hi]] (per-trace wrapper around flat range)",
    last?.payload?.[0]?.[key1]?.length === 1 &&
      last?.payload?.[0]?.[key1]?.[0].length === 2 &&
      typeof last?.payload?.[0]?.[key1]?.[0][0] === "number",
  )
  expect(
    "single read flat [lo,hi]",
    Array.isArray(last?.read[1]) && typeof last?.read[1][0] === "number",
  )

  // second axis
  before = e.length
  await drag(3, 0.1, 0.6)
  e = await ev()
  last = e[e.length - 1]
  console.log(
    "axis3 payload",
    JSON.stringify(last?.payload),
    "read",
    JSON.stringify(last?.read),
  )
  expect(
    "two-axis read has both ranges",
    last?.read[1] != null && last?.read[3] != null,
  )
  expect("axis3 fired one restyle", e.length - before === 1, e.length - before)

  // second range on axis 1
  before = e.length
  await drag(1, 0.75, 0.9)
  e = await ev()
  last = e[e.length - 1]
  console.log(
    "multi payload",
    JSON.stringify(last?.payload),
    "read",
    JSON.stringify(last?.read),
  )
  expect(
    "multi payload value is [[[lo,hi],[lo,hi]]] (wrapper around two ranges)",
    last?.payload?.[0]?.[key1]?.length === 1 &&
      last?.payload?.[0]?.[key1]?.[0].length === 2 &&
      Array.isArray(last?.payload?.[0]?.[key1]?.[0][0]),
    last?.payload?.[0],
  )
  expect(
    "multi read nested 2 ranges",
    Array.isArray(last?.read[1]?.[0]) && last?.read[1].length === 2,
    last?.read[1],
  )
  expect("axis3 range kept after multi", last?.read[3] != null)

  // clear axis 3 by clicking inside its brush-free area (single click on the axis)
  before = e.length
  const b3 = await brushBox(3)
  if (!b3) throw new Error("no b3")
  const rng3 = (await w("window.readRanges()"))[3] as number[]
  // click far from the existing range: ranges are in data units 0..1, pixel y inverted; click near the bottom
  await page.mouse.click(b3.x + b3.w / 2, b3.y + b3.h * 0.95)
  await page.waitForTimeout(300)
  e = await ev()
  last = e[e.length - 1]
  console.log(
    "clear (was",
    JSON.stringify(rng3),
    ") payload",
    JSON.stringify(last?.payload),
    "read",
    JSON.stringify(last?.read),
  )
  expect(
    "clear fires restyle with null",
    e.length - before >= 1 &&
      last?.payload?.[0]?.["dimensions[3].constraintrange"] === null,
    last?.payload,
  )
  expect("clear read is null/undefined", last?.read[3] == null)
  expect("other axis untouched by clear", last?.read[1] != null)

  // reorder: drag the axis-title of axis 0 to the right of axis 2
  before = e.length
  const titles = await page.$$eval(
    "#pc .y-axis .axis-heading, #pc .y-axis text.axis-title",
    (els) =>
      els.map((x) => {
        const r = x.getBoundingClientRect()
        return { x: r.x + r.width / 2, y: r.y + r.height / 2 }
      }),
  )
  console.log("titles", JSON.stringify(titles))
  const t0 = titles[0]
  const b2 = await brushBox(2)
  if (t0 && b2) {
    await page.mouse.move(t0.x, t0.y)
    await page.mouse.down()
    await page.mouse.move(b2.x + b2.w / 2 + 20, t0.y, { steps: 10 })
    await page.mouse.up()
    await page.waitForTimeout(500)
  }
  e = await ev()
  last = e[e.length - 1]
  const reorderKeys = e
    .slice(before)
    .map((x) => Object.keys(x.payload?.[0] ?? {}))
  console.log(
    "reorder events",
    JSON.stringify(reorderKeys),
    "read",
    JSON.stringify(last?.read),
  )
  expect(
    "reorder fires key 'dimensions'",
    reorderKeys.some((k) => k.includes("dimensions")),
    reorderKeys,
  )
  const dimsPayload = e
    .slice(before)
    .find((x) => "dimensions" in (x.payload?.[0] ?? {}))
  const dp = dimsPayload?.payload?.[0]?.dimensions
  console.log("reorder payload shape", JSON.stringify(dp)?.slice(0, 300))
  expect(
    "reorder payload carries the whole dimensions array (5 entries, per-trace wrapped)",
    Array.isArray(dp) && Array.isArray(dp[0]) && dp[0].length === 5,
    dp?.length,
  )
  const labels = await w(
    "window.__events.length >= 0 && document.getElementById('pc').data[0].dimensions.map(d=>d.label)",
  )
  console.log("labels after reorder", JSON.stringify(labels))
  const readAfter = (await w("window.readRanges()")) as unknown[]
  expect(
    "brush survives reorder (>=1 range readable)",
    readAfter.filter((x) => x != null).length >= 1,
    readAfter,
  )

  // programmatic restyle also fires event
  before = (await ev()).length
  await page.evaluate(
    "Plotly.restyle(document.getElementById('pc'), {'dimensions[2].constraintrange': [[0.1, 0.3]]}, [0])",
  )
  await page.waitForTimeout(200)
  e = await ev()
  expect(
    "programmatic restyle fires event and is readable",
    e.length - before === 1 &&
      JSON.stringify(
        e[e.length - 1]?.read.find(
          (x: any) => x && x[0] === 0.1 && x[1] === 0.3,
        ) ?? null,
      ) !== "null",
    e[e.length - 1]?.read,
  )

  // Plotly.react keeps brush with uirevision
  const diag = `(() => { const g = document.getElementById('pc'); return { data: g.data[0].dimensions.map(d => d.constraintrange ?? null), full: g._fullData[0].dimensions.map(d => d.constraintrange ?? null), preGUI: Object.keys(g._fullLayout._preGUI || {}), rects: [...document.querySelectorAll('#pc .axis-brush rect')].map(e => e.getAttribute('class') + ':' + e.getAttribute('height')) } })()`
  console.log("diag before react", JSON.stringify(await w(diag)))
  const pre = JSON.stringify(await w("window.readRanges()"))
  await page.selectOption("#sel", "b")
  await page.waitForTimeout(400)
  console.log("diag after react", JSON.stringify(await w(diag)))
  const post = JSON.stringify(await w("window.readRanges()"))
  // FINDING: in plotly.js 4.3.0 uirevision does NOT keep a parcoords brush (it is not recorded in _preGUI);
  // Plotly.react with a fresh spec clears it. Mitigation: re-inject the last read ranges into the spec.
  expect(
    "Plotly.react with fresh spec clears the brush even with uirevision (documents the finding)",
    post === "[null,null,null,null,null]",
    { pre, post },
  )
  await page.evaluate(
    `(() => { const g = document.getElementById('pc'); const keep = ${pre}; const spec = window.__spec(); spec.dimensions.forEach((d, i) => { if (keep[i]) d.constraintrange = keep[i] }); return Plotly.react(g, [spec], g.layout) })()`,
  )
  await page.waitForTimeout(400)
  const reinj = JSON.stringify(await w("window.readRanges()"))
  expect(
    "re-injecting read ranges into the spec keeps the brush through Plotly.react",
    reinj === pre,
    { pre, reinj },
  )
  const nEv = (await ev()).length
  console.log("events after re-injected react", nEv)
  const boxAfter = await page.$$eval(
    "#pc .axis-brush .selection, #pc .axis-brush rect.highlight",
    (els) => els.length,
  )
  console.log("brush DOM selection elements after react", boxAfter)

  // Q3 theming
  const probe = () =>
    page.evaluate(`(() => {
    const q = (sel, prop) => { const el = document.querySelector(sel); return el ? getComputedStyle(el)[prop] : null }
    const all = (sel, prop) => [...new Set([...document.querySelectorAll(sel)].map(el => getComputedStyle(el)[prop]))]
    return {
      bg: getComputedStyle(document.body).backgroundColor,
      axisLine: all('#pc .axis path, #pc .axis line', 'stroke'),
      tickText: all('#pc .axis-extent-text, #pc .tick text, #pc .axis text', 'fill'),
      title: all('#pc .axis-title, #pc .axis-heading text', 'fill'),
    }
  })()`) as Promise<any>
  const shot = async (name: string) => {
    const p = join(root, "docs/spikes/plan-00", name)
    await page.screenshot({
      path: p,
      clip: { x: 0, y: 0, width: 900, height: 420 },
      type: "png",
    })
    return p
  }
  const light = await probe()
  await shot("theme-light.png")
  await page.evaluate(`(() => {
    document.documentElement.setAttribute('data-theme','dark')
    const gd = document.getElementById('pc')
    Plotly.relayout(gd, {paper_bgcolor:'#111111','font.color':'#eeeeee'})
    Plotly.restyle(gd, {'labelfont.color':'#eeeeee','tickfont.color':'#eeeeee','rangefont.color':'#eeeeee','line.colorscale':[[[0,'#6fd'],[1,'#fa6']]]}, [0])
  })()`)
  await page.waitForTimeout(500)
  const dark = await probe()
  await shot("theme-dark.png")
  console.log(
    "theme light",
    JSON.stringify(light),
    "\ntheme dark",
    JSON.stringify(dark),
  )
  expect("body background changes with theme", light.bg !== dark.bg)
  expect(
    "axis strokes overridden to light colour in dark",
    dark.axisLine.length > 0 &&
      dark.axisLine.every((c: string) => c === "rgb(238, 238, 238)"),
    dark.axisLine,
  )
  expect(
    "axis strokes were hard-coded dark in light",
    light.axisLine.every((c: string) => c !== "rgb(238, 238, 238)"),
    light.axisLine,
  )
  const fontColors = await w(
    "(()=>{const d=document.getElementById('pc').data[0];return [d.labelfont.color,d.tickfont.color,d.rangefont.color,d.line.colorscale[0][1]]})()",
  )
  expect(
    "restyle keys applied to trace",
    fontColors[0] === "#eeeeee" &&
      fontColors[1] === "#eeeeee" &&
      fontColors[2] === "#eeeeee",
    fontColors,
  )
  const textFills = [...dark.tickText, ...dark.title]
  expect(
    "dark label/tick text fills are light",
    textFills.length > 0 &&
      textFills.every((c: string) => c === "rgb(238, 238, 238)"),
    textFills,
  )

  expect("no console errors", consoleErrors.length === 0, consoleErrors)
  await ctx.close()
} finally {
  await browser.close()
}
if (failures.length) {
  console.error(`FAILED: ${failures.join(", ")}`)
  process.exit(1)
}
console.log("ALL PASS")

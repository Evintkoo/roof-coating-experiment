// Chrome side of the spike (real Chrome, headless, shared and loaded machine: numbers are indicative, thresholds are NOT frozen from them).
// Q1: the screening on 1, 2, 4, 6 workers started from an inlined Blob URL, ordered merge, byte identity, equality with the batch.
// Q2: frame times of a day-player-like SVG and of an 864-cell grid as SVG rects versus Canvas, at 1x and 4x CPU throttle.
// Q4: how prefers-reduced-motion and visibility are observed, and whether page.clock drives requestAnimationFrame deterministically.

import { loadavg } from "node:os"
import { chromium } from "playwright"
import { contextToJson } from "../../../src/core/pipeline/contextJson"
import { batchRows, ctx, designs, expectOk, finish, scenarios } from "./lib"

const built = await Bun.build({
  entrypoints: [new URL("./q1_chrome_worker.ts", import.meta.url).pathname],
  target: "browser",
  format: "iife",
  minify: false,
  root: new URL("../../../", import.meta.url).pathname,
})
if (!built.success) throw new Error("worker bundle failed")
const workerSrc = await built.outputs[0]!.text()
console.log(
  `worker bundle ${(workerSrc.length / 1024).toFixed(0)} KiB unminified`,
)
const c = await ctx()
const D = designs()
const S = scenarios()
const ctxJson = contextToJson(c)
const rows = batchRows()

const browser = await chromium.launch({
  channel: "chrome",
  headless: true,
  timeout: 30_000,
  args: ["--disable-gpu"],
})
try {
  const bctx = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  })
  const page = await bctx.newPage()
  await page.goto("about:blank")

  // ---- Q1
  const run = await page.evaluate(
    async ({ workerSrc, ctxJson, D, S, sizes }) => {
      const url = URL.createObjectURL(
        new Blob([workerSrc], { type: "text/javascript" }),
      )
      const tasks: { index: number; candidate: number; scenario: number }[] = []
      for (let c = 0; c < D.length; c++)
        for (let s = 0; s < S.length; s++)
          tasks.push({ index: c * S.length + s, candidate: c, scenario: s })
      const chunks: (typeof tasks)[] = []
      for (let i = 0; i < tasks.length; i += S.length)
        chunks.push(tasks.slice(i, i + S.length))
      const res: Record<
        string,
        { ms: number; startMs: number; json: string; arrival: number[] }
      > = {}
      for (const n of sizes) {
        const t0 = performance.now()
        const ws = Array.from({ length: n }, () => new Worker(url))
        await Promise.all(
          ws.map(
            (w) =>
              new Promise<void>((ok) => {
                w.onmessage = () => ok()
                w.postMessage({
                  type: "init",
                  ctxJson,
                  designs: D,
                  scenarios: S,
                })
              }),
          ),
        )
        const startMs = performance.now() - t0
        const merged = new Array<number[]>(tasks.length)
        const arrival: number[] = []
        let next = 0
        await Promise.all(
          ws.map(
            (w) =>
              new Promise<void>((ok) => {
                const go = () => {
                  if (next >= chunks.length) return ok()
                  const id = next
                  w.postMessage({ type: "run", id, chunk: chunks[next++] })
                }
                w.onmessage = (e) => {
                  for (const [index, r, t, q] of e.data.out) {
                    merged[index] = [r, t, q]
                  }
                  arrival.push(e.data.id)
                  go()
                }
                go()
              }),
          ),
        )
        const ms = performance.now() - t0
        for (const w of ws) w.terminate()
        res[String(n)] = { ms, startMs, json: JSON.stringify(merged), arrival }
      }
      return res
    },
    { workerSrc, ctxJson, D, S, sizes: [1, 2, 4, 6] },
  )
  for (const [n, r] of Object.entries(run))
    console.log(
      `Chrome ${n} worker(s): total ${r.ms.toFixed(0)} ms (start+init ${r.startMs.toFixed(0)} ms, compute ${(r.ms - r.startMs).toFixed(0)} ms), arrival order is index order: ${r.arrival.every((v, i) => v === i)}, load1=${loadavg()[0]?.toFixed(1)}`,
    )
  const ref = run["1"]!.json
  expectOk(
    "Chrome: 1, 2, 4 and 6 workers return byte-identical JSON",
    ["2", "4", "6"].every((k) => run[k]!.json === ref),
  )
  const arr = JSON.parse(ref) as number[][]
  let maxd = 0
  for (let i = 0; i < arr.length; i++) {
    const r = rows[i]!
    maxd = Math.max(
      maxd,
      Math.abs(arr[i]![0]! - Number(r.r_solar_pred)),
      Math.abs(arr[i]![1]! - Number(r.t_max_pred)),
      Math.abs(arr[i]![2]! - Number(r.q_in_mean_w_m2)),
    )
  }
  expectOk(
    `Chrome results equal the batch nominal columns (2592 values)`,
    maxd < 1e-9,
    `max diff ${maxd.toExponential(2)}`,
  )
  const sp = run["1"]!.ms / run["4"]!.ms
  const spc =
    (run["1"]!.ms - run["1"]!.startMs) / (run["4"]!.ms - run["4"]!.startMs)
  console.log(
    `speedup 4 vs 1 workers: ${sp.toFixed(2)}x total, ${spc.toFixed(2)}x compute only`,
  )

  // ---- Q2
  const frames = async (throttle: number) => {
    const cdp = await bctx.newCDPSession(page)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle })
    const out = await page.evaluate(async () => {
      const NS = "http://www.w3.org/2000/svg"
      document.body.innerHTML = `<svg id="day" width="600" height="300"></svg><svg id="gs" width="600" height="300"></svg><canvas id="gc" width="600" height="300"></canvas>`
      const day = document.getElementById("day")!
      const path = document.createElementNS(NS, "path")
      day.append(path)
      const cur = document.createElementNS(NS, "line")
      day.append(cur)
      const gs = document.getElementById("gs")!
      const cells: SVGRectElement[] = []
      for (let i = 0; i < 864; i++) {
        const r = document.createElementNS(NS, "rect")
        r.setAttribute("x", String((i % 48) * 12))
        r.setAttribute("y", String(Math.floor(i / 48) * 16))
        r.setAttribute("width", "11")
        r.setAttribute("height", "15")
        gs.append(r)
        cells.push(r)
      }
      const gc = (
        document.getElementById("gc") as HTMLCanvasElement
      ).getContext("2d")!
      const stats = async (
        label: string,
        draw: (t: number, i: number) => void,
      ) => {
        const dts: number[] = []
        const work: number[] = []
        let last = 0
        let i = 0
        await new Promise<void>((done) => {
          const step = (t: number) => {
            if (last) dts.push(t - last)
            last = t
            const w0 = performance.now()
            draw(t, i++)
            work.push(performance.now() - w0)
            if (dts.length < 120) requestAnimationFrame(step)
            else done()
          }
          requestAnimationFrame(step)
        })
        const q = (a: number[], p: number) =>
          [...a].sort((x, y) => x - y)[Math.floor(p * (a.length - 1))]!
        return {
          label,
          p50: q(dts, 0.5),
          p95: q(dts, 0.95),
          workP50: q(work, 0.5),
        }
      }
      const pts = Array.from({ length: 144 }, (_, k) => k)
      const a = await stats(
        "day player svg (path 144 pts + cursor, per frame cursor move)",
        (t) => {
          if (!path.getAttribute("d"))
            path.setAttribute(
              "d",
              pts
                .map(
                  (k, j) =>
                    `${j ? "L" : "M"}${k * 4},${150 - 100 * Math.sin((k / 144) * Math.PI)}`,
                )
                .join(""),
            )
          const x = (t / 20) % 576
          cur.setAttribute("x1", String(x))
          cur.setAttribute("x2", String(x))
          cur.setAttribute("y2", "300")
        },
      )
      const b = await stats(
        "cell grid svg 864 rects, 20 cells recoloured per frame",
        (_, i) => {
          for (let k = 0; k < 20; k++)
            cells[(i * 20 + k) % 864]!.setAttribute(
              "fill",
              `hsl(${(i * 7 + k) % 360} 60% 50%)`,
            )
        },
      )
      const d = await stats(
        "cell grid canvas 864 cells, full redraw per frame",
        (_, i) => {
          for (let k = 0; k < 864; k++) {
            gc.fillStyle = `hsl(${(i * 7 + k) % 360} 60% 50%)`
            gc.fillRect((k % 48) * 12, Math.floor(k / 48) * 16, 11, 15)
          }
        },
      )
      return [a, b, d]
    })
    await cdp.send("Emulation.setCPUThrottlingRate", { rate: 1 })
    return out
  }
  for (const th of [1, 4])
    for (const r of await frames(th))
      console.log(
        `Q2 throttle ${th}x ${r.label}: frame p50 ${r.p50.toFixed(1)} ms, p95 ${r.p95.toFixed(1)} ms, main-thread work p50 ${r.workP50.toFixed(2)} ms`,
      )

  // ---- Q4
  const q4 = await bctx.newPage()
  await q4.emulateMedia({ reducedMotion: "reduce" })
  await q4.goto("about:blank")
  expectOk(
    "Q4: reduced motion is visible to the page as matchMedia('(prefers-reduced-motion: reduce)').matches",
    await q4.evaluate(
      () => matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  )
  await q4.emulateMedia({ reducedMotion: "no-preference" })
  expectOk(
    "Q4: and switches back live",
    await q4.evaluate(
      () => !matchMedia("(prefers-reduced-motion: reduce)").matches,
    ),
  )
  const vis = await q4.evaluate(() => ({
    hidden: document.hidden,
    state: document.visibilityState,
  }))
  console.log(
    `Q4: headless page visibility at load: ${JSON.stringify(vis)}; the loop reads document.hidden and the visibilitychange event; tests drive it by overriding document.hidden and dispatching the event (Chrome does not hide a headless page on request)`,
  )
  const rafTrace = async (): Promise<number[]> => {
    const pg = await bctx.newPage()
    await pg.clock.install({ time: 0 })
    await pg.goto("about:blank")
    await pg.evaluate(() => {
      const w = window as unknown as { __t: number[] }
      w.__t = []
      const f = (x: number) => {
        w.__t.push(x)
        requestAnimationFrame(f)
      }
      requestAnimationFrame(f)
    })
    await pg.clock.runFor(1000)
    const t = await pg.evaluate(
      () => (window as unknown as { __t: number[] }).__t,
    )
    await pg.close()
    return t
  }
  const t1 = await rafTrace()
  const t2 = await rafTrace()
  console.log(
    `Q4 raw: ${t1.length} frames ${t1.slice(-3)} vs ${t2.length} frames ${t2.slice(-3)}`,
  )
  const steps = (t: number[]) => t.slice(1).map((x, k) => x - (t[k] as number))
  expectOk(
    "Q4: page.clock.runFor(1000) drives requestAnimationFrame at exact 16 ms steps (absolute origin and the count, 62 or 63, depend on where the shared context clock stood, so tests assert steps and a count window, not absolute stamps)",
    [t1, t2].every(
      (t) =>
        t.length >= 62 && t.length <= 63 && steps(t).every((d) => d === 16),
    ),
  )
} finally {
  await browser.close()
}
finish()

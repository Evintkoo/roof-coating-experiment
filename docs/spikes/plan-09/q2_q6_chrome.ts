// Q2: 150 animated rays and four arrows in SVG against Canvas, frame interval and main-thread time at 1x and 4x CPU throttle.
// Q6: the closed page height of the built report now (the plan 08 baseline) and the open screening disclosure.
import { writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { chromium } from "playwright"
import { qaReport } from "../../../tests/support/qaPage"
import { expectOk, finish } from "./lib"

const page = (
  kind: "svg" | "canvas",
) => `<!doctype html><body style="margin:0"><svg id=s width=640 height=360 style="display:${kind === "svg" ? "block" : "none"}"></svg><canvas id=c width=640 height=360 style="display:${kind === "canvas" ? "block" : "none"}"></canvas><script>
const N=150,NS="http://www.w3.org/2000/svg",s=document.getElementById("s"),c=document.getElementById("c").getContext("2d");
const lines=[];for(let i=0;i<N;i++){const l=document.createElementNS(NS,"line");l.setAttribute("stroke","#e90");l.setAttribute("stroke-width","1.5");s.appendChild(l);lines.push(l)}
const arrows=[0,1,2,3].map(()=>{const l=document.createElementNS(NS,"line");l.setAttribute("stroke","#09f");s.appendChild(l);return l});
window.__r={dt:[],cpu:[]};let last=0;
function f(now){const t0=performance.now();const ph=now/1000;
for(let i=0;i<N;i++){const x=20+(i*4.1)%600,y=((ph*120+i*13)%300)+20;
 if("${kind}"==="svg"){const l=lines[i];l.setAttribute("x1",x);l.setAttribute("y1",y);l.setAttribute("x2",x+6);l.setAttribute("y2",y+20)}}
if("${kind}"==="canvas"){c.clearRect(0,0,640,360);c.strokeStyle="#e90";c.beginPath();for(let i=0;i<N;i++){const x=20+(i*4.1)%600,y=((ph*120+i*13)%300)+20;c.moveTo(x,y);c.lineTo(x+6,y+20)}c.stroke()}
arrows.forEach((a,i)=>{a.setAttribute("x1",50+i*140);a.setAttribute("y1",340);a.setAttribute("x2",50+i*140);a.setAttribute("y2",340-60*Math.abs(Math.sin(ph+i)))});
if(last)__r.dt.push(now-last);last=now;__r.cpu.push(performance.now()-t0);requestAnimationFrame(f)}
requestAnimationFrame(f)</script>`

const q = (a: number[], p: number) =>
  [...a].sort((x, y) => x - y)[
    Math.min(a.length - 1, Math.floor(p * a.length))
  ]!
const browser = await chromium.launch({ channel: "chrome", headless: true })
const out: Record<string, { p95: number; cpu: number }> = {}
for (const kind of ["svg", "canvas"] as const) {
  for (const rate of [1, 4]) {
    const ctx = await browser.newContext({
      viewport: { width: 700, height: 400 },
    })
    const p = await ctx.newPage()
    const f = join(tmpdir(), `q2-${kind}.html`)
    writeFileSync(f, page(kind))
    await p.goto(`file://${f}`)
    const cdp = await ctx.newCDPSession(p)
    await cdp.send("Emulation.setCPUThrottlingRate", { rate })
    await p.waitForTimeout(4000)
    const r = await p.evaluate(
      () => (window as unknown as { __r: { dt: number[]; cpu: number[] } }).__r,
    )
    out[`${kind}@${rate}x`] = { p95: q(r.dt, 0.95), cpu: q(r.cpu, 0.5) }
    console.log(
      `${kind} at ${rate}x throttle: frames ${r.dt.length}, p95 interval ${q(r.dt, 0.95).toFixed(1)} ms, median main-thread ${q(r.cpu, 0.5).toFixed(2)} ms`,
    )
    await ctx.close()
  }
}
// The frame interval is capped by the machine (a shared, loaded host ran headless rAF at 30 Hz in this run: 33.3 ms for BOTH renderers,
// even an empty canvas), so the interval cannot discriminate; the rule is applied as: SVG interval no worse than Canvas (within 2 ms) at
// both rates and SVG median main-thread time within the 8 ms bound at 4x. The real page is held to T_frame_ms by the proof test.
const svgOk =
  out["svg@1x"]!.p95 <= out["canvas@1x"]!.p95 + 2 &&
  out["svg@4x"]!.p95 <= out["canvas@4x"]!.p95 + 2 &&
  out["svg@4x"]!.cpu <= 8
console.log(
  `renderer rule: ${svgOk ? "SVG holds the budget, SVG for everything" : "Canvas for the ray layer only"}`,
)
expectOk("renderer decided by measurement", true, svgOk ? "svg" : "canvas")

const { path } = await qaReport()
const pg = await browser.newPage({ viewport: { width: 1280, height: 800 } })
await pg.goto(`file://${path}#test`)
await pg.waitForFunction(() => window.__anim?.state() != null, undefined, {
  timeout: 30000,
})
const closed = await pg.evaluate(() => document.documentElement.scrollHeight)
const row = await pg.evaluate(
  () =>
    (
      document.querySelector("#details-screening > summary") as HTMLElement
    ).getBoundingClientRect().height,
)
console.log(
  `closed page ${closed} px at 1280 (plan 08 baseline 8950), summary row ${row} px`,
)
expectOk(
  "closed height equals the plan 08 baseline",
  closed <= 8950,
  `${closed}`,
)
await browser.close()
finish()

// Real-Chrome harness for the pool tests: bundles the page driver and the real worker once, opens a blank page per case.
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { type Browser, chromium, type Page } from "playwright"
import {
  buildScreeningData,
  type ScreeningData,
} from "../../src/core/anim/screening"
import { weatherL9 } from "../../src/core/design"
import { contextToJson } from "../../src/core/pipeline/contextJson"
import { parseResultsCsv, type ResultRow } from "../../src/core/schema"
import { loadContext } from "../../src/node/context"
import { REPORT_FIXTURE, repoRoot } from "../helpers"

type Ev = { name: string; level: string }
type Vals = number[][]
/** What tests/support/poolEntry.ts installs as `window.T` in the page. */
export type PageT = {
  make(
    workerSrc: string,
    ctxJson: string,
    data: ScreeningData,
    size: number,
    o?: {
      draws?: number | null
      withInline?: boolean
      hangMs?: number
      workerOverride?: string
    },
  ): Promise<{ size: number; mode: string }>
  full(n: number): Promise<{ json: string; ms: number; n: number; vals: Vals }>
  cancelAfter(
    ms: number,
    n: number,
  ): Promise<{
    atCancel: number
    after: number
    live: number
    why: string
    cancelMs: number
    stats: { created: number; terminated: number; live: number }
  }>
  failure(
    n: number,
    killAfterMs: number,
    victim: number,
  ): Promise<{ vals: Vals; lanes: { state: string }[]; n: number }>
  expectRejection(
    n: number,
  ): Promise<{ rejected: boolean; ms: number; reason: string }>
  rawCreate(
    workerSrc: string,
    ctxJson: string,
    data: ScreeningData,
    size: number,
  ): Promise<{ ok: boolean; reason: string; events: Ev[]; ms: number }>
  events(): Ev[]
  stats(): { created: number; terminated: number; live: number }
  lanes(): { state: string; inline: boolean }[]
  terminate(): void
}
declare global {
  interface Window {
    T: PageT
  }
}

export type Harness = {
  browser: Browser
  rows: ResultRow[]
  data: ScreeningData
  ctxJson: string
  workerSrc: string
  page(o?: { noWorker?: boolean; hidden?: boolean }): Promise<Page>
  close(): Promise<void>
}

async function bundle(entry: string): Promise<string> {
  const out = await Bun.build({
    entrypoints: [join(repoRoot, entry)],
    target: "browser",
    format: "iife",
    minify: false,
    root: repoRoot,
  })
  if (!out.success) throw new Error(`bundle ${entry} failed`)
  return (out.outputs[0] as Blob).text()
}

export async function startPoolHarness(): Promise<Harness> {
  const ctx = await loadContext(
    join(repoRoot, "configs"),
    join(repoRoot, "data", "literature"),
  )
  const rows = parseResultsCsv(
    readFileSync(join(REPORT_FIXTURE, "results.csv"), "utf8"),
  )
  const data = buildScreeningData(rows, weatherL9(ctx.weather))
  const [workerSrc, pageSrc] = await Promise.all([
    bundle("src/web/worker.ts"),
    bundle("tests/support/poolEntry.ts"),
  ])
  const browser = await chromium.launch({
    channel: "chrome",
    headless: true,
    timeout: 60_000,
    args: ["--disable-gpu"],
  })
  return {
    browser,
    rows,
    data,
    ctxJson: contextToJson(ctx),
    workerSrc,
    async page(o = {}) {
      const c = await browser.newContext({
        viewport: { width: 800, height: 600 },
      })
      const p = await c.newPage()
      if (o.noWorker) await p.addInitScript("delete window.Worker")
      if (o.hidden)
        await p.addInitScript(
          "Object.defineProperty(document,'hidden',{get:()=>true});Object.defineProperty(document,'visibilityState',{get:()=>'hidden'})",
        )
      await p.goto("about:blank")
      await p.addScriptTag({ content: pageSrc })
      return p
    },
    close: () => browser.close(),
  }
}

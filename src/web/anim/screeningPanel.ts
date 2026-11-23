// The screening panel (plan 07 FR-4, D4, D9, D10, H7 to H9): runs the 96 x 9 screening on the worker pool, one lane per worker, a
// cell grid that fills as results arrive, the summary, and a check line that compares every value with the batch values embedded in
// the page. A run started while another is going cancels it (newest wins); a failure is said in words, never swallowed.
import {
  type ScreeningData,
  type ScreenValue,
  screeningTasks,
} from "../../core/anim/screening"
import { cellBin, cellClass } from "../design/molecules/cellGrid"
import { laneItems } from "../design/molecules/laneMeter"
import { createPool, type LaneInfo, type Pool, type PoolOpts } from "../pool"

export type PanelDeps = {
  data: ScreeningData
  ctxJson: string
  workerUrl: string
  inline?: PoolOpts["inline"]
  draws: number
  log?: (
    event: string,
    level: "debug" | "info" | "error",
    f: Record<string, string | number | boolean>,
  ) => void
  now?: () => number
}
export type Panel = {
  /** Resolves when the run ends (done, cancelled or failed); never rejects. */
  start(): Promise<"done" | "cancelled" | "failed">
  cancel(): void
  /** `#test` hook (H9, F6): terminate worker `id` as if it had died. */
  killLane(id: number): void
  destroy(): void
}

/** H7 tolerance against the batch values. */
export const BATCH_TOL = 1e-9

export function mountScreeningPanel(root: HTMLElement, deps: PanelDeps): Panel {
  const now = deps.now ?? (() => performance.now())
  const q = <T extends Element>(sel: string): T =>
    root.querySelector<T>(sel) as T
  const start = q<HTMLButtonElement>('[data-anim="screen-start"]')
  const lanesEl = q<HTMLElement>('[data-anim="lanes"]')
  const grid = q<SVGElement>('[data-anim="grid"]')
  const summary = q<HTMLElement>('[data-anim="summary"]')
  const check = q<HTMLElement>('[data-anim="check"]')
  const computing = q<HTMLElement>('[data-anim="computing"]')
  const nT = deps.data.nominal.length
  const label = start.textContent ?? "Run the screening in my browser"
  let pool: Pool | null = null
  let poolKey = ""
  let current: { cancel(): void } | null = null
  let runSeq = 0

  const range = (k: number) => {
    let lo = Number.POSITIVE_INFINITY
    let hi = Number.NEGATIVE_INFINITY
    for (const n of deps.data.nominal) {
      lo = Math.min(lo, n[k] as number)
      hi = Math.max(hi, n[k] as number)
    }
    return [lo, hi] as const
  }
  const [tLo, tHi] = range(1)
  const cells = grid.querySelectorAll<SVGElement>("[data-cell]")
  const resetGrid = () => {
    for (const c of cells) c.setAttribute("class", cellClass("empty"))
  }
  const setBusy = (b: boolean) => {
    computing.dataset.state = b ? "busy" : "idle"
    const txt = computing.querySelector(".tv-computing__text")
    if (txt) txt.textContent = b ? "Computing in your browser" : "Idle"
    start.textContent = b ? "Cancel the run" : label
  }
  const showLanes = (lanes: readonly LaneInfo[]): void => {
    lanesEl.innerHTML = laneItems(
      lanes.map((l) => ({
        id: l.id,
        state: l.state === "idle" && l.tasks > 0 ? "done" : l.state,
        tasks: l.tasks,
        inline: l.inline,
      })),
      nT,
    )
  }
  const sizeOf = (): number | "auto" => {
    const v = q<HTMLSelectElement>('[data-anim="workers"]').value
    return v === "auto" ? "auto" : Number(v)
  }
  const drawsOn = (): boolean =>
    q<HTMLInputElement>('[data-anim="draws"]').checked

  async function poolFor(
    size: number | "auto",
    draws: number | null,
  ): Promise<Pool> {
    const key = `${size}|${draws}`
    if (pool && key === poolKey) return pool
    pool?.terminate()
    pool = null
    pool = await createPool(size, deps.workerUrl, deps.ctxJson, {
      screening: deps.data,
      draws,
      ...(deps.inline ? { inline: deps.inline } : {}),
      onLane: showLanes,
      onEvent: (n, l, f) => deps.log?.(n, l, f),
    })
    poolKey = key
    return pool
  }

  async function run(): Promise<"done" | "cancelled" | "failed"> {
    current?.cancel()
    const me = ++runSeq
    resetGrid()
    summary.textContent = ""
    check.textContent = "Running. The check line appears when the run finishes."
    setBusy(true)
    const withDraws = drawsOn()
    const t0 = now()
    try {
      const p = await poolFor(sizeOf(), withDraws ? deps.draws : null)
      if (me !== runSeq) return "cancelled"
      let painted = 0
      const tasks = screeningTasks(
        deps.data.candidates.length,
        deps.data.scenarios.length,
      )
      const r = p.run<ScreenValue>(tasks, (index, v) => {
        if (me !== runSeq) return
        painted++
        cells[index]?.setAttribute(
          "class",
          cellClass("filled", cellBin(v[1], tLo, tHi)),
        )
        summary.textContent = `${painted} of ${nT} cells computed`
      })
      current = r
      const values = await r.done
      if (me !== runSeq) return "cancelled"
      const ms = now() - t0
      finish(values, ms, p, withDraws)
      return "done"
    } catch (e) {
      if (me !== runSeq) return "cancelled"
      const reason = (e as { reason?: string }).reason
      if (reason === "cancelled") return "cancelled"
      summary.textContent =
        reason === "no_worker"
          ? "This browser cannot start workers, so the screening cannot run here. The static results on this page are unaffected."
          : "The screening could not finish. Some workers failed to start or stopped. The static results on this page are unaffected."
      check.textContent = "No check was made because the run did not finish."
      deps.log?.("pool.run.failed", "error", { run: me })
      return "failed"
    } finally {
      if (me === runSeq) {
        current = null
        setBusy(false)
      }
    }
  }

  function finish(
    values: ScreenValue[],
    ms: number,
    p: Pool,
    withDraws: boolean,
  ): void {
    let max = 0
    let compared = 0
    values.forEach((v, i) => {
      const b = deps.data.nominal[i] as [number, number, number]
      for (let k = 0; k < 3; k++) {
        max = Math.max(max, Math.abs((v[k] as number) - (b[k] as number)))
        compared++
      }
    })
    const nS = deps.data.scenarios.length
    const meanT = deps.data.candidates.map((_, c) => {
      let s = 0
      for (let k = 0; k < nS; k++) s += (values[c * nS + k] as ScreenValue)[1]
      return s / nS
    })
    const picks = [...meanT.keys()]
      .sort((a, b) => (meanT[a] as number) - (meanT[b] as number) || a - b)
      .slice(0, 3)
      .map(
        (i) =>
          `${deps.data.candidates[i]} (${(meanT[i] as number).toFixed(1)} °C)`,
      )
    const rs = values.map((v) => v[0])
    const ts = values.map((v) => v[1])
    const lanes =
      p.mode === "inline"
        ? "a single lane"
        : `${p.size} worker${p.size === 1 ? "" : "s"}`
    summary.textContent =
      `${values.length} cells computed in ${(ms / 1000).toFixed(2)} s on ${lanes} (this machine's measurement` +
      `${withDraws ? `, with ${deps.draws} uncertainty draws per cell` : ", nominal values only"}). ` +
      `Solar reflectance ${Math.min(...rs).toFixed(3)} to ${Math.max(...rs).toFixed(3)}; peak surface temperature ${Math.min(...ts).toFixed(1)} to ${Math.max(...ts).toFixed(1)} °C. ` +
      `Lowest mean peak surface temperature: ${picks.join(", ")}.`
    check.textContent =
      max <= BATCH_TOL
        ? `Check passed: all ${compared} values (${values.length} cells x 3 quantities) equal the batch results within ${BATCH_TOL}; largest difference ${max.toExponential(1)}.`
        : `Check FAILED: ${compared} values compared, largest difference ${max.toExponential(2)} exceeds ${BATCH_TOL}.`
    deps.log?.("screening.check", "info", {
      compared,
      max_diff: max,
      ok: max <= BATCH_TOL,
    })
  }

  const onClick = (e: Event): void => {
    if (!(e.target as Element).closest('[data-anim="screen-start"]')) return
    if (current) api.cancel()
    else void run()
  }
  root.addEventListener("click", onClick)
  const api: Panel = {
    start: run,
    cancel() {
      runSeq++
      current?.cancel()
      current = null
      setBusy(false)
      summary.textContent =
        "Cancelled. Cells already shown belong to the cancelled run; nothing else is kept."
      check.textContent = "No check was made because the run was cancelled."
    },
    killLane(id) {
      pool?.killLane(id)
    },
    destroy() {
      root.removeEventListener("click", onClick)
      current?.cancel()
      pool?.terminate()
      pool = null
    },
  }
  return api
}

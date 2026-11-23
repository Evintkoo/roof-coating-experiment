// The sweep panel (plan 08 FR-5 to FR-11, D4, D5, D12): evaluates one variable's range on its own worker pool (one `liveSimulate` per
// point, newest wins), draws the five outcome charts once, and plays a cursor along the range on the plan 07 pure clock read as a phase
// (0 to 24 h stands for low to high). Playing never recomputes. A change of the live inputs, of the variable or of the panel being shown
// cancels the running sweep; nothing of a cancelled run is painted.
import { sampleSeries } from "../../core/anim/frames"
import {
  isFailure,
  layerOf,
  liveValueOf,
  type SweepOutcome as Point,
  STATE_WORDS,
  type SweepState,
  type SweepVar,
  sweepValues,
} from "../../core/anim/sweep"
import {
  advance,
  type ClockState,
  initialClock,
  seek,
} from "../../core/anim/timeline"
import type { ModelContext } from "../../core/pipeline/context"
import type { LiveInputs } from "../../core/pipeline/live"
import { SPEEDS, type Speed } from "../design/atoms/speedSelect"
import {
  OUTCOME_INFO,
  SWEEP_OUTCOMES,
  type SweepOutcome,
  sweepChart,
  sweepChartGeometry,
} from "../design/molecules/sweepChart"
import { LIVE_SEED, liveValue, N_LIVE, unitText } from "../liveState"
import { createPool, type Pool, type PoolOpts, sweepTasks } from "../pool"
import type { Loop } from "./loop"

type Fields = Record<string, string | number | boolean>
export type SweepPanelDeps = {
  ctx: ModelContext
  ctxJson: string
  workerUrl: string
  variables: readonly SweepVar[]
  /** The live simulator's inputs now (the sweep holds every other input at these). */
  live: () => LiveInputs
  loop: Loop
  inline?: PoolOpts["inlineSweep"]
  log?: (event: string, level: "debug" | "info" | "error", f: Fields) => void
  now?: () => number
}
export type SweepPanel = {
  /** The panel is on screen (disclosure open and tab selected): it computes only then (D12). */
  setOpen(open: boolean): void
  /** The live inputs changed: a running sweep is cancelled and a computed one is marked stale (FR-10). */
  liveChanged(): void
  selectVariable(key: string): void
  /** Compute the range now; resolves when it ends (done, cancelled or failed); never rejects. */
  compute(): Promise<"done" | "cancelled" | "failed">
  play(source?: "user" | "reduced"): void
  pause(source?: "user" | "reduced"): void
  seek(phaseHours: number): void
  state(): {
    state: SweepState
    tH: number
    playing: boolean
    variable: string
    points: number
  }
  /** `#test` hook: terminate lane `id` as if it had died. */
  killLane(id: number): void
  /** The computed range (test hook): swept values and, per outcome, the nominal curve. */
  data(): {
    variable: string
    xs: number[]
    nominal: Record<string, number[]>
  } | null
  /** Worker counts of the sweep pool (null before the first run). */
  poolStats(): { created: number; terminated: number; live: number } | null
  destroy(): void
}

const OUTCOME_FIELD: Record<
  SweepOutcome,
  "t_max_c" | "r_solar" | "corrosion_risk" | "delam_proxy" | "cost_proxy"
> = {
  t_max_c: "t_max_c",
  r_solar: "r_solar",
  corrosion_risk: "corrosion_risk",
  delam_proxy: "delam_proxy",
  cost_proxy: "cost_proxy",
}
const BAND_FIELD = {
  t_max_c: "t_max_c",
  r_solar: "r_solar",
  corrosion_risk: "corrosion_risk",
  delam_proxy: "delam_proxy",
} as const
const READ_UNIT: Record<SweepOutcome, string> = {
  t_max_c: "°C",
  r_solar: "",
  corrosion_risk: "",
  delam_proxy: "",
  cost_proxy: " relative cost units",
}
const READ_NAME: Record<SweepOutcome, string> = {
  t_max_c: "peak surface temperature",
  r_solar: "solar reflectance",
  corrosion_risk: "corrosion risk (PROXY)",
  delam_proxy: "delamination risk (PROXY)",
  cost_proxy: "cost (PROXY)",
}

type Data = {
  v: SweepVar
  xs: number[]
  points: Point[]
  series: Record<
    SweepOutcome,
    {
      nominal: number[]
      lo: number[] | null
      hi: number[] | null
      c0: number[]
      c1: number[] | null
    }
  >
}

export function buildSeries(v: SweepVar, xs: number[], points: Point[]): Data {
  const nan = Number.NaN
  const col = (f: (p: Exclude<Point, { failed: true }>) => number): number[] =>
    points.map((p) => (isFailure(p) ? nan : f(p)))
  const series = {} as Data["series"]
  for (const o of SWEEP_OUTCOMES) {
    const k = OUTCOME_FIELD[o]
    const bandKey = (BAND_FIELD as Record<string, string | undefined>)[o]
    const c1 = col((p) => p.c1[k] as number)
    series[o] = {
      nominal: col((p) => p.nominal[k] as number),
      lo: bandKey
        ? col((p) => p.bands[bandKey as keyof typeof p.bands].lo)
        : null,
      hi: bandKey
        ? col((p) => p.bands[bandKey as keyof typeof p.bands].hi)
        : null,
      c0: col((p) => p.c0[k] as number),
      c1: c1.some((x) => Number.isFinite(x)) ? c1 : null,
    }
  }
  return { v, xs, points, series }
}

const fmt = (x: number, digits: number): string =>
  Number.isFinite(x) ? x.toFixed(digits) : "not modelled"
const signed = (x: number, digits: number): string => {
  const r = Number(x.toFixed(digits))
  return `${r > 0 ? "+" : r < 0 ? "−" : ""}${Math.abs(r).toFixed(digits)}`
}

export function mountSweepPanel(
  root: HTMLElement,
  deps: SweepPanelDeps,
): SweepPanel {
  const now = deps.now ?? (() => performance.now())
  const q = <T extends Element>(sel: string): T =>
    root.querySelector<T>(sel) as T
  const sel = q<HTMLSelectElement>('[data-anim="sweep-var"]')
  const playBtn = q<HTMLButtonElement>('[data-anim="sweep-play"]')
  const scrub = q<HTMLInputElement>('[data-anim="sweep-scrub"]')
  const valueBox = q<HTMLInputElement>('[data-anim="sweep-value"]')
  const speedSel = q<HTMLSelectElement>('[data-anim="sweep-speed"]')
  const computing = q<HTMLElement>('[data-anim="sweep-computing"]')
  const status = q<HTMLElement>('[data-anim="sweep-status"]')
  const readout = q<HTMLElement>('[data-anim="sweep-readout"]')
  const layerNote = q<HTMLElement>('[data-anim="layer-off"]')
  const slot = (o: SweepOutcome) =>
    q<HTMLElement>(`[data-anim="sweep-chart"][data-outcome="${o}"]`)

  let open = false
  let state: SweepState = "idle"
  let data: Data | null = null
  let dataKey = ""
  let pool: Pool | null = null
  let current: { cancel(): void } | null = null
  let runSeq = 0
  let clock: ClockState = initialClock("once")
  let off: (() => void) | null = null
  let speed: Speed = 1

  const variable = (): SweepVar =>
    deps.variables.find((v) => v.key === sel.value) ??
    (deps.variables[0] as SweepVar)
  const key = (): string => `${variable().key}|${JSON.stringify(deps.live())}`
  const setState = (s: SweepState): void => {
    state = s
    root.dataset.state = s
    status.textContent = STATE_WORDS[s]
    computing.dataset.state = s === "running" ? "busy" : "idle"
    const txt = computing.querySelector(".tv-computing__text")
    if (txt)
      txt.textContent = s === "running" ? "Computing in your browser" : "Idle"
  }
  const phase = (): number => clock.tH / 24
  const xAt = (d: Data): number =>
    (d.xs[0] as number) +
    phase() * ((d.xs[d.xs.length - 1] as number) - (d.xs[0] as number))
  const updateLayerNote = (): void => {
    const layer = layerOf(variable())
    layerNote.hidden = !(layer !== null && deps.live().layers[layer] === false)
  }

  const drawCharts = (d: Data): void => {
    const x = xAt(d)
    const kind = d.v.group === "scenario" ? "curve" : "flat"
    for (const o of SWEEP_OUTCOMES) {
      const s = d.series[o]
      slot(o).innerHTML = sweepChart({
        outcome: o,
        xs: d.xs,
        nominal: s.nominal,
        lo: s.lo,
        hi: s.hi,
        c0: s.c0,
        c1: s.c1,
        controlKind: kind,
        cursor: x,
        unit: unitText(d.v.unit),
        xLabel: d.v.label,
      })
    }
  }

  const render = (): void => {
    if (!data) return
    const d = data
    const x = xAt(d)
    scrub.value = String(clock.tH)
    valueBox.value = liveValue((d.v.max - d.v.min) / 200, x)
    for (const o of SWEEP_OUTCOMES) {
      const s = d.series[o]
      const g = sweepChartGeometry(d.xs, [
        s.nominal,
        s.c0,
        ...(s.c1 ? [s.c1] : []),
        ...(s.lo && s.hi ? [s.lo, s.hi] : []),
      ])
      const cx = String(Math.round(g.x(x) * 100) / 100)
      const cur = slot(o).querySelector('[data-source="clock:sweep"]')
      cur?.setAttribute("x1", cx)
      cur?.setAttribute("x2", cx)
      cur?.setAttribute("data-x", String(x))
      const dot = slot(o).querySelector(`[data-source="sweep:${o}:nominal@x"]`)
      const y = sampleSeries(
        Float64Array.from(d.xs),
        Float64Array.from(s.nominal),
        x,
      )
      if (dot && Number.isFinite(y)) {
        dot.setAttribute("cx", cx)
        dot.setAttribute("cy", String(Math.round(g.y(y) * 100) / 100))
      }
    }
    const xs = Float64Array.from(d.xs)
    const at = (a: number[]): number =>
      sampleSeries(xs, Float64Array.from(a), x)
    const parts: string[] = []
    for (const o of SWEEP_OUTCOMES) {
      const s = d.series[o]
      const v = at(s.nominal)
      if (!Number.isFinite(v)) continue
      const digits = o === "t_max_c" ? 1 : 3
      const u = o === "t_max_c" ? " K" : o === "cost_proxy" ? " units" : ""
      const vs = (name: string, c: number): string =>
        Number.isFinite(c) ? `${signed(v - c, digits)}${u} vs ${name}` : ""
      const c1 = s.c1 ? vs("C1", at(s.c1)) : "C1 datasheet, not modelled"
      const c0 = vs("C0", at(s.c0))
      parts.push(
        `${READ_NAME[o]} ${fmt(v, digits)}${READ_UNIT[o]} (${[c0, c1].filter(Boolean).join(", ")})`,
      )
    }
    readout.textContent = `At ${d.v.label} = ${liveValue((d.v.max - d.v.min) / 200, x)}${unitText(d.v.unit) ? ` ${unitText(d.v.unit)}` : ""}: ${parts.join("; ")}.`
    const label = clock.playing
      ? "Pause"
      : clock.tH >= 24
        ? "Replay range"
        : "Play range"
    playBtn.textContent = label
    playBtn.dataset.state = clock.playing ? "playing" : "idle"
    playBtn.setAttribute(
      "aria-label",
      clock.playing ? "Pause the sweep" : "Play the range from low to high",
    )
  }

  const tick = (dt: number): void => {
    clock = advance(clock, dt, speed)
    render()
    if (!clock.playing) {
      off?.()
      off = null
      deps.log?.("sweep.pause", "info", {
        source: "end",
        phase: Math.round(phase() * 100) / 100,
      })
    }
  }

  const poolFor = async (): Promise<Pool> => {
    if (pool) return pool
    pool = await createPool("auto", deps.workerUrl, deps.ctxJson, {
      ...(deps.inline ? { inlineSweep: deps.inline } : {}),
      onEvent: (n, l, f) => deps.log?.(n, l, f),
    })
    return pool
  }

  const cancelRun = (
    reason: "live_changed" | "variable_changed" | "closed",
  ): void => {
    if (!current) return
    runSeq++
    current.cancel()
    current = null
    deps.log?.("sweep.cancel", "info", { reason })
  }

  async function compute(): Promise<"done" | "cancelled" | "failed"> {
    cancelRun("variable_changed")
    const me = ++runSeq
    const v = variable()
    const live = deps.live()
    updateLayerNote()
    if (!(v.max > v.min)) {
      setState("error")
      return "failed"
    }
    const values = sweepValues(v, liveValueOf(v, live, deps.ctx), 41)
    setState("running")
    const t0 = now()
    try {
      const p = await poolFor()
      if (me !== runSeq) return "cancelled"
      deps.log?.("sweep.start", "info", {
        variable: v.key,
        points: values.length,
        workers: p.size,
        draws: N_LIVE,
      })
      const r = p.run<Point>(
        sweepTasks(values.length),
        (index) => {
          if (me === runSeq)
            deps.log?.("sweep.point.done", "debug", {
              index,
              ms: Math.round(now() - t0),
            })
        },
        { sweep: { base: live, v, values, nDraws: N_LIVE, seed: LIVE_SEED } },
      )
      current = r
      const points = await r.done
      if (me !== runSeq) return "cancelled"
      points.forEach((pt, index) => {
        if (isFailure(pt))
          deps.log?.("sweep.error", "error", { reason: pt.reason, index })
      })
      data = buildSeries(v, values, points)
      dataKey = `${v.key}|${JSON.stringify(live)}`
      drawCharts(data)
      current = null
      setState("ready")
      deps.log?.("sweep.done", "info", {
        points: values.length,
        ms: Math.round(now() - t0),
        workers: p.mode === "inline" ? 1 : p.size,
      })
      render()
      return "done"
    } catch (e) {
      if (me !== runSeq) return "cancelled"
      const reason = (e as { reason?: string }).reason
      if (reason === "cancelled") return "cancelled"
      current = null
      setState("error")
      deps.log?.("sweep.error", "error", {
        reason: reason === "no_worker" ? "no_worker" : "worker_failed",
        index: -1,
      })
      return "failed"
    }
  }

  const play = (src: "user" | "reduced" = "user"): void => {
    const go = (): void => {
      if (!data) return
      if (clock.tH >= 24) clock = seek(clock, 0)
      clock = { ...clock, playing: true }
      if (!off) off = deps.loop.add((dt) => tick(dt))
      deps.log?.("sweep.play", "info", {
        source: src,
        phase: Math.round(phase() * 100) / 100,
      })
      render()
    }
    if (data && state === "ready" && dataKey === key()) {
      go()
      return
    }
    void compute().then((r) => {
      if (r === "done") go()
    })
  }
  const pause = (src: "user" | "reduced" = "user"): void => {
    if (!clock.playing) return
    clock = { ...clock, playing: false }
    off?.()
    off = null
    deps.log?.("sweep.pause", "info", {
      source: src,
      phase: Math.round(phase() * 100) / 100,
    })
    render()
  }
  const seekTo = (h: number): void => {
    clock = seek(clock, h)
    deps.log?.("sweep.seek", "info", {
      source: "user",
      phase: Math.round(phase() * 100) / 100,
    })
    render()
  }

  const onClick = (e: Event): void => {
    if (!(e.target as Element).closest('[data-anim="sweep-play"]')) return
    if (clock.playing) pause("user")
    else play("user")
  }
  const onInput = (e: Event): void => {
    const el = e.target as HTMLInputElement
    if (el.dataset.anim === "sweep-scrub") seekTo(Number(el.value))
  }
  const onChange = (e: Event): void => {
    const el = e.target as HTMLInputElement
    if (el.dataset.anim === "sweep-var") {
      pause("user")
      clock = initialClock("once")
      data = null
      dataKey = ""
      if (open) void compute()
      else {
        cancelRun("variable_changed")
        setState("idle")
        updateLayerNote()
      }
    } else if (el.dataset.anim === "sweep-speed") {
      const n = Number(el.value)
      if ((SPEEDS as readonly number[]).includes(n)) speed = n as Speed
    } else if (el.dataset.anim === "sweep-value" && data) {
      const x = Number(el.value)
      if (Number.isFinite(x)) {
        const lo = data.xs[0] as number
        const hi = data.xs[data.xs.length - 1] as number
        seekTo(((Math.min(hi, Math.max(lo, x)) - lo) / (hi - lo)) * 24)
      }
    }
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== " ") return
    if ((e.target as HTMLElement).closest("input,select,button,textarea,a"))
      return
    e.preventDefault()
    if (clock.playing) pause("user")
    else play("user")
  }
  root.addEventListener("click", onClick)
  root.addEventListener("input", onInput)
  root.addEventListener("change", onChange)
  root.addEventListener("keydown", onKey)
  updateLayerNote()

  const api: SweepPanel = {
    setOpen(o) {
      if (o === open) return
      open = o
      if (!o) {
        pause("user")
        cancelRun("closed")
        if (state === "running") setState(data ? "ready" : "idle")
        return
      }
      updateLayerNote()
      if (!data || state === "idle") void compute()
    },
    liveChanged() {
      updateLayerNote()
      if (current) {
        cancelRun("live_changed")
        setState("stale")
        return
      }
      if (data && dataKey !== key()) setState("stale")
    },
    selectVariable(k) {
      if (!deps.variables.some((v) => v.key === k)) return
      sel.value = k
      sel.dispatchEvent(new Event("change", { bubbles: true }))
    },
    compute,
    play,
    pause,
    seek: seekTo,
    state: () => ({
      state,
      tH: clock.tH,
      playing: clock.playing,
      variable: variable().key,
      points: data?.xs.length ?? 0,
    }),
    killLane(id) {
      pool?.killLane(id)
    },
    poolStats: () => pool?.stats() ?? null,
    data: () =>
      data
        ? {
            variable: data.v.key,
            xs: data.xs,
            nominal: Object.fromEntries(
              SWEEP_OUTCOMES.map((o) => [o, (data as Data).series[o].nominal]),
            ),
          }
        : null,
    destroy() {
      root.removeEventListener("click", onClick)
      root.removeEventListener("input", onInput)
      root.removeEventListener("change", onChange)
      root.removeEventListener("keydown", onKey)
      off?.()
      off = null
      cancelRun("closed")
      pool?.terminate()
      pool = null
    },
  }
  return api
}

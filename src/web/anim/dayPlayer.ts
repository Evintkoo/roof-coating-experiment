// The day player (plan 07 FR-3, D3, D5, D6, H3, H5, H6): binds the watchDay markup to the solved series. The clock is the pure
// timeline; every displayed number is sampled from the series (linear between nodes, never invented); the one loop advances it
// while playing and is idle otherwise. Reduced motion: no autoplay, and the loop stays at zero frames until play is pressed.
import { sampleSeries } from "../../core/anim/frames"
import {
  advance,
  type ClockState,
  initialClock,
  seek,
} from "../../core/anim/timeline"
import { PLAY_WORDS, type PlayState } from "../design/atoms/playButton"
import { SPEEDS, type Speed } from "../design/atoms/speedSelect"
import { clockText } from "../design/atoms/timeReadout"
import { type DayChartData, dayChartPaths } from "../design/molecules/dayChart"
import { arrowGeometry } from "../design/molecules/fluxSchematic"
import { fanLines } from "./fan"
import { FLUX_KEYS, type FluxModel, fluxAt, fluxRefs } from "./flux"
import type { Loop } from "./loop"

export type DayData = DayChartData & {
  flux: FluxModel
  /** The solved draw series in K (the fan); optional. */
  drawsK?: readonly ArrayLike<number>[]
}
export type DayPlayerDeps = {
  loop: Loop
  reduced: () => boolean
  onReducedChange?: (cb: () => void) => void
  /** Calls `cb` once when the root first enters the viewport. */
  whenVisible?: (el: Element, cb: () => void) => void
  log?: (
    event: string,
    fields: Record<string, string | number | boolean>,
  ) => void
}
export type DayPlayer = {
  play(source?: "user" | "auto"): void
  pause(source?: "user" | "auto" | "reduced"): void
  seek(tH: number, source?: "user" | "auto"): void
  step(hours: number): void
  setSpeed(s: Speed): void
  setData(d: DayData): void
  autoplayOnce(): boolean
  state(): { tH: number; playing: boolean; speed: Speed; autoplayed: boolean }
  destroy(): void
}

/** Autoplay runs at 4x: a day in 4 s, inside the 5 s rule of D6. */
export const AUTOPLAY_SPEED: Speed = 4

const q = <T extends Element>(root: Element, sel: string): T | null =>
  root.querySelector<T>(sel)
const f = (n: number): string => String(Math.round(n * 100) / 100)

export function mountDayPlayer(
  root: HTMLElement,
  initial: DayData,
  deps: DayPlayerDeps,
): DayPlayer {
  let data = initial
  let clock: ClockState = initialClock("once")
  let speed: Speed = 1
  /** The speed the reader chose; the autoplay runs at AUTOPLAY_SPEED and gives this back when it ends. */
  let chosen: Speed = 1
  let autoplayed = false
  let source: "user" | "auto" = "user"
  let off: (() => void) | null = null
  let t: Float64Array
  let series: {
    recipe: Float64Array
    bare: Float64Array
    lo: Float64Array
    hi: Float64Array
  }
  let geom = dayChartPaths(data).geometry
  let refs = fluxRefs(data.flux)

  const prep = (): void => {
    const n = data.recipeC.length
    t = Float64Array.from({ length: n }, (_, i) => i / 6)
    series = {
      recipe: Float64Array.from(data.recipeC),
      bare: Float64Array.from(data.bareC),
      lo: Float64Array.from(data.loC),
      hi: Float64Array.from(data.hiC),
    }
    const paths = dayChartPaths(data)
    geom = paths.geometry
    refs = fluxRefs(data.flux)
    q(root, '[data-source="series:recipe"]')?.setAttribute("d", paths.recipe)
    q(root, '[data-source="series:bare"]')?.setAttribute("d", paths.bare)
    q(root, '[data-source="band:t_surface"]')?.setAttribute("d", paths.band)
    const fan = q(root, "[data-fan]")
    if (fan)
      fan.innerHTML = data.drawsK
        ? fanLines(data.drawsK, { x: geom.x, y: (c) => geom.y(c) })
        : ""
  }
  const sample = (v: Float64Array): number => sampleSeries(t, v, clock.tH)

  const playState = (): PlayState =>
    clock.playing ? "playing" : clock.tH >= 24 ? "ended" : "paused"

  const render = (): void => {
    const x = f(geom.x(clock.tH))
    const cur = q(root, '[data-source="clock:t_h"]')
    cur?.setAttribute("x1", x)
    cur?.setAttribute("x2", x)
    const vals = {
      recipe: sample(series.recipe),
      bare: sample(series.bare),
      lo: sample(series.lo),
      hi: sample(series.hi),
    }
    for (const [k, key] of [
      ["series:recipe@t", "recipe"],
      ["series:bare@t", "bare"],
    ] as const) {
      const dot = q(root, `[data-source="${k}"]`)
      dot?.setAttribute("cx", x)
      dot?.setAttribute("cy", f(geom.y(vals[key])))
    }
    for (const el of root.querySelectorAll<HTMLElement>('[data-anim="read"]')) {
      const k = el.dataset.read as keyof typeof vals
      el.dataset.value = String(vals[k])
      el.textContent = vals[k].toFixed(1)
    }
    const scrub = q<HTMLInputElement>(root, '[data-anim="scrub"]')
    if (scrub) scrub.value = String(clock.tH)
    const time = q<HTMLElement>(root, '[data-anim="time"]')
    if (time) {
      time.dataset.value = String(clock.tH)
      time.textContent = clockText(clock.tH)
    }
    const fl = fluxAt(clock.tH, data.flux)
    for (const k of FLUX_KEYS) {
      const g = q(root, `[data-flux="${k}"]`)
      if (!g) continue
      const a = arrowGeometry(k, fl[k], refs[k])
      g.setAttribute("data-w", String(fl[k]))
      g.setAttribute("data-wref", String(refs[k]))
      const line = g.querySelector("line")
      line?.setAttribute("y2", f(a.y2))
      const txt = g.querySelector(`[data-flux-text="${k}"]`)
      if (txt) txt.textContent = `${f(fl[k])} W/m²`
    }
    const state = playState()
    const btn = q<HTMLElement>(root, '[data-anim="play"]')
    if (btn) {
      btn.dataset.state = state
      btn.setAttribute("aria-label", PLAY_WORDS[state].aria)
      const txt = btn.querySelector(".tv-play__text")
      if (txt) txt.textContent = PLAY_WORDS[state].label
    }
  }

  const giveSpeedBack = (): void => {
    speed = chosen
    const sel = q<HTMLSelectElement>(root, '[data-anim="speed"]')
    if (sel) sel.value = String(chosen)
  }
  const tick = (dt: number): void => {
    clock = advance(clock, dt, speed)
    render()
    if (!clock.playing) {
      if (source === "auto") {
        source = "user"
        giveSpeedBack()
      }
      off?.()
      off = null
      deps.log?.("anim.pause", {
        source: "end",
        t_h: Math.round(clock.tH * 100) / 100,
      })
    }
  }
  const api: DayPlayer = {
    play(src = "user") {
      if (clock.tH >= 24) clock = seek(clock, 0)
      clock = { ...clock, playing: true }
      source = src
      if (!off) off = deps.loop.add((dt) => tick(dt))
      deps.log?.("anim.play", {
        source: src,
        t_h: Math.round(clock.tH * 100) / 100,
      })
      render()
    },
    pause(src = "user") {
      if (!clock.playing) return
      clock = { ...clock, playing: false }
      off?.()
      off = null
      if (source === "auto") {
        source = "user"
        giveSpeedBack()
      }
      deps.log?.("anim.pause", {
        source: src,
        t_h: Math.round(clock.tH * 100) / 100,
      })
      render()
    },
    seek(tH, src = "user") {
      clock = seek(clock, tH)
      deps.log?.("anim.seek", {
        source: src,
        t_h: Math.round(clock.tH * 100) / 100,
      })
      render()
    },
    step(hours) {
      clock = seek(clock, Math.round(clock.tH + hours))
      deps.log?.("anim.seek", {
        source: "user",
        t_h: Math.round(clock.tH * 100) / 100,
      })
      render()
    },
    setSpeed(s) {
      if ((SPEEDS as readonly number[]).includes(s)) {
        speed = s
        chosen = s
      }
      const sel = q<HTMLSelectElement>(root, '[data-anim="speed"]')
      if (sel) sel.value = String(speed)
    },
    setData(d) {
      data = d
      prep()
      render()
    },
    autoplayOnce() {
      if (autoplayed || deps.reduced()) return false
      autoplayed = true
      chosen = speed
      speed = AUTOPLAY_SPEED
      const sel = q<HTMLSelectElement>(root, '[data-anim="speed"]')
      if (sel) sel.value = String(speed)
      api.play("auto")
      return true
    },
    state: () => ({ tH: clock.tH, playing: clock.playing, speed, autoplayed }),
    destroy() {
      off?.()
      off = null
      root.removeEventListener("click", onClick)
      root.removeEventListener("input", onInput)
      root.removeEventListener("change", onChange)
      root.removeEventListener("keydown", onKey)
    },
  }
  // any use of a control by the reader ends an autoplay (D6) and restores the chosen speed
  const userTook = (): void => {
    if (source === "auto" && clock.playing) {
      api.pause("user")
    }
    if (source === "auto") {
      source = "user"
      giveSpeedBack()
    }
  }
  const onClick = (e: Event): void => {
    const el = (e.target as Element).closest<HTMLElement>("[data-anim]")
    if (!el || !root.contains(el)) return
    const k = el.dataset.anim
    if (k === "play") {
      userTook()
      if (clock.playing) api.pause("user")
      else api.play("user")
    } else if (k === "step-back" || k === "step-fwd") {
      userTook()
      api.step(k === "step-back" ? -1 : 1)
    }
  }
  const onInput = (e: Event): void => {
    const el = e.target as HTMLInputElement
    if (el.dataset?.anim === "scrub") {
      const wanted = Number(el.value) // read before userTook(): pausing re-renders and would overwrite the slider
      userTook()
      api.seek(wanted)
    }
  }
  const onChange = (e: Event): void => {
    const el = e.target as HTMLSelectElement
    if (el.dataset?.anim === "speed") {
      source = "user"
      api.setSpeed(Number(el.value) as Speed)
    }
  }
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== " ") return
    const tg = e.target as HTMLElement
    if (tg.closest("input,select,button,textarea,a")) return
    e.preventDefault()
    userTook()
    if (clock.playing) api.pause("user")
    else api.play("user")
  }
  root.addEventListener("click", onClick)
  root.addEventListener("input", onInput)
  root.addEventListener("change", onChange)
  root.addEventListener("keydown", onKey)
  deps.onReducedChange?.(() => {
    if (deps.reduced()) api.pause("reduced")
  })
  deps.whenVisible?.(root, () => api.autoplayOnce())
  prep()
  render()
  return api
}

/** Browser wiring: the real media query and viewport observer. */
export function browserDayDeps(
  loop: Loop,
  log?: DayPlayerDeps["log"],
): DayPlayerDeps {
  const mq = matchMedia("(prefers-reduced-motion: reduce)")
  return {
    loop,
    reduced: () => mq.matches,
    onReducedChange: (cb) => mq.addEventListener("change", cb),
    whenVisible: (el, cb) => {
      if (typeof IntersectionObserver === "undefined") return
      const io = new IntersectionObserver((es) => {
        if (es.some((e) => e.isIntersecting)) {
          io.disconnect()
          cb()
        }
      })
      io.observe(el)
    },
    ...(log ? { log } : {}),
  }
}

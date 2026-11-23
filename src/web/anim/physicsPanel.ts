// The live physics panel (plan 09 FR-1 to FR-11, D2 to D13): runs the stepper lane while Play is on (one request per frame, newest
// version wins), paints the newest frame into the scene in place, and moves the rays on the loop's one clock. It owns no clock: the
// loop ticker exists only while playing, and the lane (a worker) exists only while the tab is open (D13).

import { BandsError } from "../../core/anim/bands"
import { type PaneFrames, stepsFor } from "../../core/anim/stepper"
import type { ModelContext } from "../../core/pipeline/context"
import type { LiveInputs, LiveResult } from "../../core/pipeline/live"
import { SPEEDS, type Speed } from "../design/atoms/speedSelect"
import { clockText } from "../design/atoms/timeReadout"
import { dropX } from "../design/molecules/dropProfile"
import {
  ARROW_KEYS,
  arrowGeometry,
  rayPoints,
} from "../design/molecules/physicsScene"
import {
  type PhysicsState,
  RANGE_NOTE,
  STATE_WORDS,
  watchPhysics,
} from "../design/organisms/watchPhysics"
import { openStepperLane, type StepperLane } from "../stepperLane"
import type { Loop } from "./loop"
import { idlePane, type PaneNow, physicsProps, RAYS_MAX } from "./physicsView"

type Fields = Record<string, string | number | boolean>
export type PhysicsPanelDeps = {
  ctx: ModelContext
  ctxJson: string
  workerUrl: string
  Worker?: typeof Worker
  loop: Loop
  reduced: () => boolean
  /** D10: writes the live simulator's own slider, so the panel and the simulator share one source of truth. */
  setScenario: (patch: Partial<LiveInputs["scenario"]>) => void
  log?: (event: string, level: "debug" | "info" | "error", f: Fields) => void
}
export type PhysicsPanel = {
  update(r: LiveResult, inputs: LiveInputs): void
  setOpen(open: boolean): void
  play(source?: "user" | "reduced"): void
  pause(source?: "user" | "reduced" | "hidden" | "closed"): void
  /** `#test` hook: n steps now (the +1 h button is step(60)). */
  step(n: number): void
  state(): {
    state: PhysicsState
    open: boolean
    ready: boolean
    playing: boolean
    ticker: boolean
    lane: "worker" | "inline" | null
    version: number
    tS: number
    tK: { recipe: number; c0: number }
    raysShown: number
    rayFrames: number
    requests: number
  }
  killLane(): void
  destroy(): void
}

const IDS: Record<string, keyof LiveInputs["scenario"]> = {
  "phys-irradiance": "irradiance_w_m2",
  "phys-t-air": "t_air_c",
  "phys-wind": "wind_m_s",
}
const STEP_HOUR = 60
const f1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1)

export function mountPhysicsPanel(
  root: HTMLElement,
  deps: PhysicsPanelDeps,
): PhysicsPanel {
  const log = deps.log ?? (() => {})
  let latest: { r: LiveResult; inputs: LiveInputs } | null = null
  let lane: StepperLane | null = null
  let open = false
  let playing = false
  let off: (() => void) | null = null
  let state: PhysicsState = "idle"
  let speed: Speed = 1
  let version = 0
  let appliedKey = ""
  let carry = 0
  let inFlight = false
  let phase = 0
  let tS = 86400
  let cur: { recipe: PaneNow; c0: PaneNow } | null = null
  let shown = 0
  let requests = 0
  let rayFrames = 0
  let lateAt = -1e9
  let drawnKey = ""
  let ready = false

  const q = <T extends Element>(s: string): T | null => root.querySelector<T>(s)
  const key = (i: LiveInputs): string => JSON.stringify(i)
  const setState = (s: PhysicsState): void => {
    state = s
    const el = q<HTMLElement>("[data-watch-physics]")
    if (el) el.dataset.state = s
    const st = q<HTMLElement>('[data-anim="phys-status"]')
    if (st) st.textContent = STATE_WORDS[s]
    const pb = q<HTMLElement>('[data-anim="phys-play"]')
    if (pb) {
      pb.dataset.state = playing ? "playing" : "paused"
      pb.setAttribute(
        "aria-label",
        playing ? "Pause the live physics" : "Play the live physics",
      )
      const tx = pb.querySelector(".tv-play__text")
      if (tx) tx.textContent = playing ? "Pause" : "Play"
    }
  }
  let transient = false
  const settle = (): void =>
    setState(
      state === "error"
        ? "error"
        : transient
          ? "transient"
          : playing
            ? "playing"
            : tS > 86400
              ? "paused"
              : "idle",
    )

  const timeText = (): void => {
    const day = Math.floor(tS / 86400) + 1
    const out = q<HTMLElement>('[data-anim="phys-time"]')
    if (out) {
      out.dataset.value = String(tS)
      out.textContent = `day ${day}, ${clockText((tS % 86400) / 3600)}`
    }
  }

  /** Paint one pair of nodes into the scene in place: temperature, arrows, drop dots, readouts, the ray count; no markup is rebuilt. */
  const paint = (): void => {
    if (!cur || !latest) return
    const gPeak = latest.inputs.scenario.irradiance_w_m2
    for (const [name, now] of [
      ["recipe", cur.recipe],
      ["aluminium", cur.c0],
    ] as const) {
      const sc = q<SVGElement>(`[data-physics-scene="${name}"]`)
      if (!sc) continue
      const bottom = Number(sc.getAttribute("data-bottom"))
      const tt = sc.querySelector<SVGTextElement>('[data-anim="phys-temp"]')
      if (tt) {
        tt.dataset.value = String(now.tK)
        tt.textContent = `${f1(now.tK - 273.15)} °C`
      }
      for (const k of ARROW_KEYS) {
        const g = sc.querySelector(`[data-arrow="${k}"]`)
        const line = g?.querySelector("line")
        if (!g || !line) continue
        const a = arrowGeometry(k, now.terms[k], bottom)
        line.setAttribute("y1", String(Math.round(a.y1 * 100) / 100))
        line.setAttribute("y2", String(Math.round(a.y2 * 100) / 100))
        g.setAttribute("data-w", String(now.terms[k]))
        const tx = g.querySelector("[data-flux-text]")
        if (tx) tx.textContent = `${Math.round(now.terms[k]) || 0} W/m²`
      }
      const d = root.querySelector(`[data-pane="${name}"] [data-drop-profile]`)
      if (d) {
        const xs = dropX(now.tK)
        const ti = Number(
          d
            .querySelector('[data-anim="drop-inside"]')
            ?.getAttribute("data-value"),
        )
        const xi = dropX(ti)
        const dot = d.querySelector('[data-anim="drop-surface"]')
        dot?.setAttribute("cx", String(xs))
        dot?.setAttribute("data-value", String(now.tK))
        const law = d.querySelector('[data-anim="drop-law"]')
        law?.setAttribute("x1", String(xs))
        law?.setAttribute("x2", String(xi))
        const t = d.querySelector('[data-anim="drop-surface-text"]')
        if (t) t.textContent = `surface ${f1(now.tK - 273.15)} °C`
      }
    }
    const diff = q<HTMLElement>('[data-anim="phys-diff"]')
    if (diff) {
      const v = cur.recipe.tK - cur.c0.tK
      diff.dataset.value = String(v)
      diff.textContent = `${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toFixed(1)}`
    }
    const res = q<HTMLElement>('[data-anim="phys-residual"]')
    if (res) {
      const r = lastResidual
      res.dataset.value = String(r)
      res.textContent = Math.abs(r) < 0.005 ? "0.00" : r.toFixed(2)
    }
    // ray density follows the model's own irradiance: the share of the rays shown is G(t) over the peak
    const g = cur.recipe.terms.absorbed + cur.recipe.terms.reflected
    shown = Math.round(RAYS_MAX * Math.min(1, Math.max(0, g / gPeak)))
    timeText()
  }
  let lastResidual = 0

  const paintRays = (): void => {
    if (deps.reduced()) return
    rayFrames++
    for (const g of root.querySelectorAll<SVGElement>(
      '[data-layer-group="rays"]',
    )) {
      for (const ray of g.children) {
        const idx = Number(ray.getAttribute("data-ray"))
        const on = idx < shown
        const p = rayPoints(
          Number(ray.getAttribute("data-x")),
          ray.getAttribute("data-reflected") === "1",
          (phase + idx * 0.37) % 1,
        )
        if (on && p.on) {
          ray.setAttribute("x1", String(p.x1))
          ray.setAttribute("y1", String(p.y1))
          ray.setAttribute("x2", String(p.x2))
          ray.setAttribute("y2", String(p.y2))
          ray.removeAttribute("visibility")
        } else ray.setAttribute("visibility", "hidden")
      }
    }
  }

  const apply = (fr: PaneFrames): void => {
    const a = fr.recipe[fr.recipe.length - 1]
    const b = fr.c0[fr.c0.length - 1]
    if (!a || !b) return
    cur = {
      recipe: { tK: a.tK, terms: a.terms },
      c0: { tK: b.tK, terms: b.terms },
    }
    lastResidual = a.residual
    tS = a.tS
    paint()
  }

  const drawPanes = (): void => {
    if (!latest) return
    let props: ReturnType<typeof physicsProps>
    try {
      const now = cur ?? {
        recipe: idlePane(deps.ctx, latest.inputs, latest.r, "recipe"),
        c0: idlePane(deps.ctx, latest.inputs, latest.r, "c0"),
      }
      props = physicsProps(deps.ctx, latest.inputs, latest.r, now, {
        state,
        speed,
        reduced: deps.reduced(),
        lane: lane?.kind() ?? "worker",
      })
    } catch (e) {
      state = "error"
      const st = q<HTMLElement>('[data-anim="phys-status"]')
      if (st) st.textContent = STATE_WORDS.error
      log("physics.error", "error", {
        reason: e instanceof BandsError ? "bands" : "draw",
        pane: "both",
      })
      return
    }
    const tmp = document.createElement("div")
    tmp.innerHTML = watchPhysics(props)
    const fresh = tmp.firstElementChild as HTMLElement
    const old = q<HTMLElement>("[data-watch-physics]")
    if (!old) root.replaceChildren(fresh)
    else {
      // only the panes and the notes under the sliders are replaced, so a slider being dragged keeps its element
      old
        .querySelector(".tv-watchphysics__panes")
        ?.replaceWith(fresh.querySelector(".tv-watchphysics__panes") as Element)
      for (const k of ["phys-layer-off", "phys-lane"]) {
        const n = fresh.querySelector(`[data-anim="${k}"]`)
        const o = old.querySelector(`[data-anim="${k}"]`)
        if (n && o) o.replaceWith(n)
      }
    }
    if (deps.reduced())
      for (const g of root.querySelectorAll('[data-layer-group="rays"]'))
        g.replaceChildren()
    drawnKey = key(latest.inputs)
    // sliders show the live inputs (not while one is being dragged)
    for (const [id, k] of Object.entries(IDS)) {
      const el = root.querySelector<HTMLInputElement>(`#${id}`)
      const v = latest.inputs.scenario[k]
      if (el && document.activeElement !== el && Number(el.value) !== v) {
        el.value = String(v)
        const out = root.querySelector(`#${id}-out`)
        if (out) out.textContent = f1(v)
      }
    }
    setState(state)
    cur && paint()
    timeText()
  }

  const tick = (dtMs: number): void => {
    if (!lane || !playing) return
    phase = (phase + (dtMs / 1000) * speed * 0.35) % 1
    if (inFlight) {
      const now = performance.now()
      if (now - lateAt > 1000) {
        lateAt = now
        log("physics.late", "info", { frames_waited: 1 })
      }
    } else {
      const s = stepsFor(dtMs, speed, carry)
      carry = s.carry
      if (s.n > 0) request(s.n)
    }
    paintRays()
  }

  const request = (n: number): void => {
    if (!lane) return
    const l = lane
    inFlight = true
    requests++
    l.request(n, version)
      .then((res) => {
        inFlight = false
        if (res !== "stale" && l === lane) apply(res.frames)
        if (l.lastError() === "physics_range") {
          const st = q<HTMLElement>('[data-anim="phys-status"]')
          if (st)
            st.textContent = `${RANGE_NOTE}. The last valid frame stays on screen.`
        }
      })
      .catch(() => {
        inFlight = false
        pause("user")
        setState("error")
        log("physics.error", "error", { reason: "request", pane: "both" })
      })
  }

  const play = (source: "user" | "reduced" = "user"): void => {
    if (!lane || !latest) return
    if (deps.reduced()) {
      // reduced motion: one model hour per press, no particle motion, no ticker
      if (!inFlight) request(STEP_HOUR)
      log("physics.play", "info", { source: "reduced", speed })
      return
    }
    if (playing) return
    playing = true
    off = deps.loop.add((dt) => tick(dt))
    settle()
    log("physics.play", "info", { source, speed })
  }
  const pause = (
    source: "user" | "reduced" | "hidden" | "closed" = "user",
  ): void => {
    if (!playing) return
    playing = false
    off?.()
    off = null
    settle()
    log("physics.pause", "info", { source, speed })
  }

  const restart = (): void => {
    if (!lane || !latest) return
    version++
    lane.restart(latest.inputs, version)
    appliedKey = key(latest.inputs)
    cur = null
    tS = 86400
    carry = 0
    transient = false
    state = "idle"
    drawnKey = ""
    drawPanes()
    log("physics.restart", "info", { source: "user", speed })
  }

  const changed = (inputs: LiveInputs, keys: string[]): void => {
    version++
    appliedKey = key(inputs)
    lane?.setParams(inputs, version)
    transient = true
    settle()
    log("physics.params", "info", {
      changed: keys.join(","),
      step: Math.round((tS - 86400) / 60),
    })
  }

  const onClick = (e: Event): void => {
    const b = (e.target as Element).closest<HTMLElement>("[data-anim]")
    const a = b?.dataset.anim
    if (a === "phys-play") playing ? pause("user") : play("user")
    else if (a === "phys-step") {
      api.step(STEP_HOUR)
    } else if (a === "phys-restart") restart()
  }
  const onChange = (e: Event): void => {
    const t = e.target as HTMLSelectElement
    if (t.dataset?.anim === "phys-speed") {
      const v = Number(t.value) as Speed
      if ((SPEEDS as readonly number[]).includes(v)) speed = v
    }
  }
  const onSlider = (e: Event): void => {
    const t = e.target as HTMLElement
    const input = t.querySelector<HTMLInputElement>('input[type="range"]')
    const k = input ? IDS[input.id] : undefined
    const v = (e as CustomEvent<{ value: number }>).detail?.value
    if (!k || !latest || !Number.isFinite(v)) return
    const next = {
      ...latest.inputs,
      scenario: { ...latest.inputs.scenario, [k]: v },
    }
    latest = { r: latest.r, inputs: next }
    changed(next, [
      k.replace("_w_m2", "").replace("_c", "").replace("_m_s", ""),
    ])
    deps.setScenario({ [k]: v })
  }
  const onKey = (e: KeyboardEvent): void => {
    if (
      e.key !== " " ||
      (e.target as Element).closest("button,input,select,textarea")
    )
      return
    e.preventDefault()
    playing ? pause("user") : play("user")
  }
  root.addEventListener("click", onClick)
  root.addEventListener("change", onChange)
  root.addEventListener("slider-change", onSlider)
  root.addEventListener("keydown", onKey)

  const startLane = (): void => {
    if (!latest) return
    const l = openStepperLane(deps.ctxJson, latest.inputs, {
      ...(deps.Worker
        ? { Worker: deps.Worker, workerUrl: deps.workerUrl }
        : {}),
      log,
    })
    lane = l
    appliedKey = key(latest.inputs)
    l.ready.then(
      () => {
        if (lane !== l) return
        ready = true
        drawPanes()
      },
      () => {
        if (lane !== l) return
        state = "error"
        drawPanes()
        setState("error")
      },
    )
  }

  const api: PhysicsPanel = {
    update(r, inputs) {
      latest = { r, inputs }
      if (!open || !lane) return
      if (key(inputs) !== appliedKey) changed(inputs, ["recipe"])
      if (key(inputs) !== drawnKey) drawPanes()
    },
    setOpen(o) {
      if (o === open) return
      open = o
      if (o) {
        if (!latest) return
        cur = null
        tS = 86400
        carry = 0
        transient = false
        state = "idle"
        drawnKey = ""
        startLane()
        drawPanes()
      } else {
        pause("closed")
        lane?.close()
        lane = null
        ready = false
        inFlight = false
      }
    },
    play,
    pause,
    step(n) {
      if (lane && !inFlight) request(n)
    },
    state: () => ({
      state,
      open,
      ready,
      playing,
      ticker: off !== null,
      lane: lane?.kind() ?? null,
      version,
      tS,
      tK: {
        recipe: cur?.recipe.tK ?? Number.NaN,
        c0: cur?.c0.tK ?? Number.NaN,
      },
      raysShown: shown,
      rayFrames,
      requests,
    }),
    killLane: () => lane?.kill(),
    destroy() {
      api.setOpen(false)
      root.removeEventListener("click", onClick)
      root.removeEventListener("change", onChange)
      root.removeEventListener("slider-change", onSlider)
      root.removeEventListener("keydown", onKey)
    },
  }
  return api
}

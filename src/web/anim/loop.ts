// The one animation loop of the page (plan 07 D2, D6, H4 to H6): a single requestAnimationFrame chain that exists only while a
// ticker is registered and the page is visible. Time enters through injected functions, so tests drive it with a fake clock or with
// Playwright's `page.clock`; nothing here reads a global clock.

export type FrameStats = {
  frames: number
  p50_ms: number
  p95_ms: number
  dropped: number
}
export type Ticker = (dtMs: number, nowMs: number) => void
export type LoopDeps = {
  raf: (cb: (t: number) => void) => number
  caf: (id: number) => void
  hidden: () => boolean
  /** Subscribe to visibility changes; returns the unsubscribe. */
  onVisibility: (cb: () => void) => () => void
  /** Called about once a second of frames while playing (`anim.frame_stats`). */
  onStats?: (s: FrameStats) => void
}
export type Loop = {
  add(t: Ticker): () => void
  /** rAF callbacks run so far; stays 0 while nothing has played and does not advance while the page is hidden. */
  frames(): number
  running(): boolean
  destroy(): void
}

/** A frame longer than this counts as dropped (a 60 Hz frame is 16.7 ms). */
export const DROPPED_MS = 25
const STATS_WINDOW_MS = 1000
/** A gap longer than this is a pause (tab switch, debugger), not a slow frame: the next tick sees dt 0. */
const MAX_DT_MS = 250

const quantile = (sorted: number[], q: number): number =>
  sorted.length === 0
    ? 0
    : (sorted[
        Math.min(sorted.length - 1, Math.floor(q * sorted.length))
      ] as number)

export function createLoop(deps: LoopDeps): Loop {
  const tickers = new Set<Ticker>()
  let id: number | null = null
  let last: number | null = null
  let frames = 0
  let windowStart: number | null = null
  let dts: number[] = []
  let dropped = 0
  let windowFrames = 0

  const frame = (now: number): void => {
    id = null
    if (deps.hidden() || tickers.size === 0) {
      last = null
      return
    }
    frames++
    let dt = last === null ? 0 : now - last
    if (!(dt >= 0) || dt > MAX_DT_MS) dt = 0
    last = now
    if (windowStart === null) windowStart = now
    if (dt > 0) {
      dts.push(dt)
      if (dt > DROPPED_MS) dropped++
    }
    windowFrames++
    for (const t of [...tickers]) t(dt, now)
    if (now - windowStart >= STATS_WINDOW_MS) {
      const sorted = [...dts].sort((a, b) => a - b)
      deps.onStats?.({
        frames: windowFrames,
        p50_ms: quantile(sorted, 0.5),
        p95_ms: quantile(sorted, 0.95),
        dropped,
      })
      windowStart = now
      dts = []
      dropped = 0
      windowFrames = 0
    }
    schedule()
  }
  const schedule = (): void => {
    if (id === null && tickers.size > 0 && !deps.hidden()) id = deps.raf(frame)
  }
  const stop = (): void => {
    if (id !== null) deps.caf(id)
    id = null
    last = null
  }
  const off = deps.onVisibility(() => {
    if (deps.hidden()) stop()
    else schedule()
  })
  return {
    add(t) {
      tickers.add(t)
      schedule()
      return () => {
        tickers.delete(t)
        if (tickers.size === 0) stop()
      }
    },
    frames: () => frames,
    running: () => id !== null,
    destroy() {
      stop()
      tickers.clear()
      off()
    },
  }
}

/** Browser wiring of the real clock and visibility. */
export function browserLoop(onStats?: (s: FrameStats) => void): Loop {
  return createLoop({
    raf: (cb) => requestAnimationFrame(cb),
    caf: (i) => cancelAnimationFrame(i),
    hidden: () => document.hidden,
    onVisibility: (cb) => {
      document.addEventListener("visibilitychange", cb)
      return () => document.removeEventListener("visibilitychange", cb)
    },
    ...(onStats ? { onStats } : {}),
  })
}

/** `#test` hooks exist only when the URL fragment asks for them. */
export function testHooksEnabled(hash: string): boolean {
  return hash.replace(/^#/, "").split("&").includes("test")
}

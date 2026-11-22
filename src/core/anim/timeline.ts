// Pure clock for the day player (plan 07 Task 3). No clock, no DOM: time enters only as the
// numbers dtMs and speed, so every value that leaves here is finite and inside 0..24 h (F11).

export const DAY_H = 24
/** Model hours played per real second at speed 1x (a day in 16 s; 4x in 4 s). */
export const HOURS_PER_SECOND = 1.5

export type LoopMode = "once" | "loop" | "hold"
export type ClockState = {
  readonly tH: number
  readonly mode: LoopMode
  readonly playing: boolean
}

const clampDay = (x: number): number =>
  Number.isNaN(x) ? 0 : Math.min(DAY_H, Math.max(0, x))

export function initialClock(mode: LoopMode): ClockState {
  return { tH: 0, mode, playing: false }
}

/** Jump to a time; NaN becomes 0, anything outside the day is clamped. */
export function seek(s: ClockState, tH: number): ClockState {
  return { ...s, tH: clampDay(tH) }
}

/**
 * Move the clock by dtMs of real time at the given speed. A negative, NaN or infinite
 * dt or speed moves nothing; a paused clock does not move. `once` stops (playing false)
 * at the end, `loop` wraps, `hold` stays at 24 h with the playing flag untouched.
 */
export function advance(
  s: ClockState,
  dtMs: number,
  speed: number,
): ClockState {
  const t0 = clampDay(s.tH)
  const ok =
    s.playing &&
    Number.isFinite(dtMs) &&
    Number.isFinite(speed) &&
    dtMs > 0 &&
    speed > 0
  if (!ok) return { ...s, tH: t0 }
  const next = t0 + (dtMs / 1000) * speed * HOURS_PER_SECOND
  if (!Number.isFinite(next)) return { ...s, tH: t0 }
  if (next < DAY_H) return { ...s, tH: next }
  if (s.mode === "loop") return { ...s, tH: next % DAY_H }
  if (s.mode === "once") return { ...s, tH: DAY_H, playing: false }
  return { ...s, tH: DAY_H }
}

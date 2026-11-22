// Easing and tweening (plan 07 H13). Pure: elapsed time is an argument.

/** Standard ease-in-out (cubic): 0 -> 0, 1 -> 1, monotone, no overshoot; input clamped to 0..1. */
export function easeStandard(x: number): number {
  if (Number.isNaN(x) || x <= 0) return 0
  if (x >= 1) return 1
  return x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2
}

/**
 * Value between from and to after elapsedMs of a durMs tween. A zero, negative or NaN
 * duration (reduced motion) jumps to `to`. Never leaves [min(from,to), max(from,to)] and
 * returns exactly `from` at 0 and exactly `to` at the end. To interrupt, start a new tween
 * from the current value with elapsedMs 0.
 */
export function tween(
  from: number,
  to: number,
  elapsedMs: number,
  durMs: number,
): number {
  if (!(durMs > 0)) return to
  const x = Number.isNaN(elapsedMs) ? 0 : elapsedMs / durMs
  if (x <= 0) return from
  if (x >= 1) return to
  const v = from + (to - from) * easeStandard(x)
  return Math.min(Math.max(from, to), Math.max(Math.min(from, to), v))
}

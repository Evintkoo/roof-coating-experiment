// Value tweening for tiles and numbers (plan 07 D5, H13): a small set of running tweens advanced by the shared loop. Starting a
// tween on a key that is already moving restarts from the value currently shown, so nothing jumps and nothing overshoots; under
// reduced motion (or a zero duration) the target is applied at once and the tween never exists.
import { tween } from "../../core/anim/ease"

export type Tweens = {
  /** Move `key` to `target`; `apply` receives every intermediate value and, last, exactly `target`. */
  to(
    key: string,
    target: number,
    apply: (v: number) => void,
    durMs: number,
  ): void
  /** The loop ticker: advance every tween to `nowMs`. */
  tick(nowMs: number): void
  current(key: string): number | undefined
  active(): number
}

type Running = {
  from: number
  to: number
  start: number | null
  dur: number
  apply: (v: number) => void
  shown: number
}

export function createTweens(reduced: () => boolean): Tweens {
  const running = new Map<string, Running>()
  const shown = new Map<string, number>()
  return {
    to(key, target, apply, durMs) {
      if (!Number.isFinite(target)) return
      const known = shown.get(key)
      if (
        reduced() ||
        !(durMs > 0) ||
        known === undefined ||
        known === target
      ) {
        running.delete(key)
        shown.set(key, target)
        apply(target)
        return
      }
      running.set(key, {
        from: known,
        to: target,
        start: null,
        dur: durMs,
        apply,
        shown: known,
      })
    },
    tick(nowMs) {
      for (const [key, r] of [...running]) {
        r.start ??= nowMs
        const v = tween(r.from, r.to, nowMs - r.start, r.dur)
        shown.set(key, v)
        r.apply(v)
        if (nowMs - r.start >= r.dur) running.delete(key)
      }
    },
    current: (key) => shown.get(key),
    active: () => running.size,
  }
}

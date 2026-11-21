import { PhysicsRangeError } from "../errors"
import { emitEvent } from "../events"

function fail(
  model: string,
  quantity: string,
  value: number,
  lo: number,
  hi: number,
): never {
  emitEvent("model.out_of_range", "error", { model, quantity, value, lo, hi })
  throw new PhysicsRangeError(
    quantity,
    `${model}: ${quantity}=${value} outside [${lo}, ${hi}]`,
  )
}

/** Inclusive range check; NaN never passes (comparisons with NaN are false). */
export function requireIn(
  model: string,
  quantity: string,
  value: number,
  lo: number,
  hi: number,
): number {
  if (!(value >= lo && value <= hi)) fail(model, quantity, value, lo, hi)
  return value
}

export function requireArrayIn(
  model: string,
  quantity: string,
  a: Float64Array,
  lo: number,
  hi: number,
): Float64Array {
  for (let i = 0; i < a.length; i++) {
    const v = a[i] as number
    if (!(v >= lo && v <= hi)) fail(model, `${quantity}[${i}]`, v, lo, hi)
  }
  return a
}

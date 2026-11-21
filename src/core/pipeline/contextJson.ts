import { DataError } from "../errors"
import { safeJson } from "../json"
import type { ModelContext } from "./context"

/** Typed-array fields of the context, as paths: these become plain number arrays in the JSON and are restored on load. */
const TYPED: readonly (readonly string[])[] = [
  ["wlUm"],
  ["g173", "wl_um"],
  ["g173", "irradiance_w_m2_um"],
  ["tio2", "wl_um"],
  ["tio2", "n"],
  ["tio2", "k"],
  ["baso4", "wl_um"],
  ["baso4", "n"],
  ["baso4", "k"],
]

/** Plain tree with typed arrays as number[] and object keys in sorted order (deterministic bytes). */
function plain(v: unknown): unknown {
  if (v instanceof Float64Array) return Array.from(v)
  if (Array.isArray(v)) return v.map(plain)
  if (v !== null && typeof v === "object") {
    const o = v as Record<string, unknown>
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(o).sort()) out[k] = plain(o[k])
    return out
  }
  return v
}

/** Model context as JSON (D4): sorted keys, typed arrays as number[]; NaN or Infinity anywhere is a DataError. */
export function contextToJson(ctx: ModelContext): string {
  return safeJson(plain(ctx))
}

/** Inverse of contextToJson (exact: JSON numbers round-trip IEEE doubles). No schema library: the browser bundle stays small. */
export function contextFromJson(text: string): ModelContext {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    throw new DataError("context", "context JSON is not valid JSON")
  }
  if (raw === null || typeof raw !== "object")
    throw new DataError("context", "context JSON is not an object")
  for (const path of TYPED) {
    let node = raw as Record<string, unknown>
    for (const k of path.slice(0, -1)) {
      const next = node[k]
      if (next === null || typeof next !== "object")
        throw new DataError("context", `missing ${path.join(".")}`)
      node = next as Record<string, unknown>
    }
    const last = path[path.length - 1] as string
    const arr = node[last]
    if (!Array.isArray(arr) || !arr.every((x) => typeof x === "number"))
      throw new DataError("context", `${path.join(".")} must be a number array`)
    node[last] = Float64Array.from(arr as number[])
  }
  return raw as ModelContext
}

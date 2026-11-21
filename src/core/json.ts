import { DataError } from "./errors"

/** JSON.stringify that refuses NaN and +/-Infinity anywhere in the value. */
export function safeJson(value: unknown, space?: number): string {
  return JSON.stringify(
    value,
    (_k, v: unknown) => {
      if (typeof v === "number" && !Number.isFinite(v)) {
        throw new DataError("json", "non-finite number in JSON value")
      }
      return v
    },
    space,
  )
}

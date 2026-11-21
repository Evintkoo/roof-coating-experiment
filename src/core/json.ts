import { DataError } from "./errors"

/** JSON.stringify that refuses NaN and +/-Infinity anywhere in the value. */
export function safeJson(value: unknown, space?: number): string {
  let out: string | undefined
  try {
    out = JSON.stringify(
      value,
      (_k, v: unknown) => {
        if (typeof v === "number" && !Number.isFinite(v)) {
          throw new DataError("json", "non-finite number in JSON value")
        }
        return v
      },
      space,
    )
  } catch (e) {
    if (e instanceof DataError) throw e
    throw new DataError("json", "not serialisable")
  }
  if (out === undefined) throw new DataError("json", "not serialisable")
  return out
}

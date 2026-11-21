import os from "node:os"
import { ConfigError, ResourceError } from "../core/errors"
import { emit } from "./logging"

/** Default load limit: half the cores. */
export const defaultMaxLoad = (): number => os.cpus().length / 2

/** Refuse to start unless the 1-minute load average is within maxLoad (fails closed: a NaN limit refuses). */
export function checkLoad(maxLoad: number = defaultMaxLoad()): void {
  const load1 = os.loadavg()[0] as number
  if (!(load1 <= maxLoad)) {
    emit("resource.load_high", "error", { load1, limit: maxLoad })
    throw new ResourceError("machine load above the limit")
  }
}

/** Run at nice 10 so the user's own work keeps priority. */
export function lowerPriority(): void {
  os.setPriority(process.pid, 10)
}

/** Reject with ResourceError(6) after limitS seconds and abort the signal handed to fn. */
export async function runWithTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  limitS: number,
  command = "run",
): Promise<T> {
  if (!(Number.isFinite(limitS) && limitS > 0))
    throw new ConfigError("limit_s", "must be a finite number above 0")
  const ac = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      try {
        emit("resource.timeout", "error", { command, limit_s: limitS })
      } catch {
        // logging must never stop the rejection and abort below
      }
      reject(new ResourceError("time limit exceeded")) // before abort: a fn that rejects on abort must not win the race
      ac.abort()
    }, limitS * 1000)
  })
  try {
    return await Promise.race([fn(ac.signal), timeout])
  } finally {
    clearTimeout(timer)
  }
}

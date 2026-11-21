import os from "node:os"
import { ResourceError } from "../core/errors"
import { emit } from "./logging"

/** Refuse to start when the 1-minute load average exceeds maxLoad (default: half the cores). */
export function checkLoad(maxLoad: number = os.cpus().length / 2): void {
  const load1 = os.loadavg()[0] as number
  if (load1 > maxLoad) {
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
  const ac = new AbortController()
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      emit("resource.timeout", "error", { command, limit_s: limitS })
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

import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import os from "node:os"
import { join } from "node:path"
import { ResourceError } from "../../src/core/errors"
import { configureLogging, newRunId } from "../../src/node/logging"
import {
  checkLoad,
  lowerPriority,
  runWithTimeout,
} from "../../src/node/resources"

afterEach(() => configureLogging({ runId: "x", level: "error" }))

const events = (runDir: string) =>
  readFileSync(join(runDir, "run.jsonl"), "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))

test("checkLoadZeroLimitThrowsCode6", () => {
  const runDir = mkdtempSync(join(os.tmpdir(), "spandek-res-"))
  configureLogging({ runId: newRunId(), level: "info", runDir })
  let err: unknown
  try {
    checkLoad(0)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(ResourceError)
  expect((err as ResourceError).code).toBe(6)
  const ev = events(runDir).find((e) => e.event === "resource.load_high")
  expect(ev?.level).toBe("error")
  expect(ev?.limit).toBe(0)
  expect(typeof ev?.load1).toBe("number")
})

test("highLimitAlwaysPasses", () => {
  expect(() => checkLoad(1000)).not.toThrow()
})

test("defaultLimitIsHalfCores", () => {
  const limit = os.cpus().length / 2
  const load1 = os.loadavg()[0] as number
  let threw = false
  try {
    checkLoad()
  } catch (e) {
    threw = e instanceof ResourceError
  }
  // the default behaves exactly like the explicit half-cores limit
  expect(threw).toBe(load1 > limit)
  // pinned through the event field
  const runDir = mkdtempSync(join(os.tmpdir(), "spandek-res-"))
  configureLogging({ runId: newRunId(), level: "info", runDir })
  if (load1 > limit) {
    try {
      checkLoad()
    } catch {}
    expect(events(runDir).at(-1)?.limit).toBe(limit)
  }
})

test("priorityIsLowered", () => {
  // Same EACCES/EPERM tolerance as the plan-2 smoke test: a detached runner inside the tool sandbox cannot
  // call get/setpriority at all; any other error or a wrong value still fails.
  try {
    lowerPriority()
    expect(os.getPriority(process.pid)).toBe(10)
  } catch (e) {
    const err = e as { code?: string; info?: { code?: string } }
    const code = err.info?.code ?? err.code
    if (code !== "EACCES" && code !== "EPERM") throw e
  }
})

test("timeoutThrowsCode6", async () => {
  const runDir = mkdtempSync(join(os.tmpdir(), "spandek-res-"))
  configureLogging({ runId: newRunId(), level: "info", runDir })
  let aborted = false
  const p = runWithTimeout(
    (signal) =>
      new Promise<never>((_, rej) => {
        signal.addEventListener("abort", () => {
          aborted = true
          rej(new Error("aborted"))
        })
      }),
    0.05,
  )
  let err: unknown
  try {
    await p
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(ResourceError)
  expect((err as ResourceError).code).toBe(6)
  expect(aborted).toBe(true)
  expect(events(runDir).some((e) => e.event === "resource.timeout")).toBe(true)
})

test("fastFunctionResolvesWithoutTimeoutEvent", async () => {
  expect(await runWithTimeout(async () => 7, 5)).toBe(7)
})

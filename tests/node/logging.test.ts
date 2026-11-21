import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { emitEvent } from "../../src/core/events"
import { configureLogging, emit, newRunId } from "../../src/node/logging"

function setup(level: "debug" | "info" | "warn" | "error" = "debug") {
  const runDir = mkdtempSync(join(tmpdir(), "spandek-log-"))
  configureLogging({ runId: newRunId(), level, runDir })
  const read = () =>
    readFileSync(join(runDir, "events.jsonl"), "utf8")
      .split("\n")
      .filter((l) => l.length > 0)
  return { read }
}

afterEach(() => configureLogging({ runId: "x", level: "error" }))

test("runIdsUniqueWithinOneMillisecond", () => {
  const ids = new Set<string>()
  for (let i = 0; i < 1000; i++) ids.add(newRunId())
  expect(ids.size).toBe(1000)
  for (const id of ids) expect(id).toMatch(/^\d{8}T\d{9}-[0-9a-f]{8}$/)
})

test("emitIsSingleJsonLine", () => {
  const { read } = setup()
  emit("a.b", "info", { s: "line1\nline2", n: 1.5, ok: true })
  const lines = read()
  expect(lines.length).toBe(1)
  const rec = JSON.parse(lines[0] as string)
  expect(rec.event).toBe("a.b")
  expect(rec.level).toBe("info")
  expect(rec.s).toBe("line1\nline2")
  expect(typeof rec.run).toBe("string")
  expect(typeof rec.ts).toBe("string")
})

test("emitTruncatesOver2048BytesAndSetsTruncated", () => {
  const { read } = setup()
  emit("big", "info", { a: "x".repeat(3000), b: 1 })
  const line = read()[0] as string
  expect(Buffer.byteLength(line)).toBeLessThanOrEqual(2048)
  const rec = JSON.parse(line)
  expect(rec.truncated).toBe(true)
  expect(rec.event).toBe("big")
})

test("errorRaisedAcceptsOnlyCodePhaseKey", () => {
  const { read } = setup()
  emit("error.raised", "error", {
    code: 4,
    phase: "model",
    key: "k",
    message: "free text secret",
    stack: "trace",
  })
  const rec = JSON.parse(read()[0] as string)
  expect(rec.code).toBe(4)
  expect(rec.phase).toBe("model")
  expect(rec.key).toBe("k")
  expect(rec.message).toBeUndefined()
  expect(rec.stack).toBeUndefined()
  // non-conforming types are dropped too
  emit("error.raised", "error", {
    code: 4,
    phase: "model",
    key: "k".repeat(500),
  })
  const rec2 = JSON.parse(read()[1] as string)
  expect(Buffer.byteLength(JSON.stringify(rec2))).toBeLessThanOrEqual(2048)
})

test("emitStringifiesNonFiniteNumbersAndNeverThrows", () => {
  const { read } = setup()
  expect(() =>
    emit("model.out_of_range", "error", {
      value: Number.NaN,
      hi: Number.POSITIVE_INFINITY,
      lo: Number.NEGATIVE_INFINITY,
    }),
  ).not.toThrow()
  const rec = JSON.parse(read()[0] as string)
  expect(rec.value).toBe("NaN")
  expect(rec.hi).toBe("Infinity")
  expect(rec.lo).toBe("-Infinity")
})

test("levelFilterDropsDebugAtInfo", () => {
  const { read } = setup("info")
  emit("d", "debug", { a: 1 })
  emit("i", "info", { a: 1 })
  emitEvent("d2", "debug", { a: 1 })
  emitEvent("w", "warn", { a: 1 })
  expect(read().map((l) => JSON.parse(l).event)).toEqual(["i", "w"])
})

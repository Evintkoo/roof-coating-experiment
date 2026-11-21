import { afterEach, expect, test } from "bun:test"
import { emitEvent, setEventSink } from "../../src/core/events"

afterEach(() => setEventSink(null))

test("emitEventIsNoopWithoutSink", () => {
  setEventSink(null)
  expect(() => emitEvent("x.y", "info", { a: 1 })).not.toThrow()
})

test("emitEventReachesInstalledSink", () => {
  const got: unknown[] = []
  setEventSink((e, l, f) => got.push([e, l, f]))
  emitEvent("x.y", "warn", { a: 1, b: "s", c: true })
  expect(got).toEqual([["x.y", "warn", { a: 1, b: "s", c: true }]])
})

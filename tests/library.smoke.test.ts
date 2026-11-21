import { expect, test } from "bun:test"
import os from "node:os"
import fc from "fast-check"
import * as yaml from "yaml"
import { z } from "zod"

test("apiSurfaces", async () => {
  // zod: strict object rejects unknown key
  const schema = z.strictObject({ value: z.number() })
  expect(schema.safeParse({ value: 1 }).success).toBe(true)
  expect(schema.safeParse({ value: "no" }).success).toBe(false)
  expect(schema.safeParse({ value: 1, extra: 2 }).success).toBe(false)

  // yaml
  expect(yaml.parse("a: 1\nb: [2, 3]\n")).toEqual({ a: 1, b: [2, 3] })

  // fast-check
  fc.assert(fc.property(fc.integer(), (n) => n + 0 === n))

  // Worker round-trip
  const worker = new Worker(
    new URL("./fixtures/echo.worker.ts", import.meta.url),
  )
  const reply = await new Promise<unknown>((resolve, reject) => {
    worker.onmessage = (e) => resolve(e.data)
    worker.onerror = (e) => reject(e)
    worker.postMessage({ ping: 42 })
  })
  worker.terminate()
  expect(reply).toEqual({ echo: { ping: 42 } })

  // Bun.build deterministic
  const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs")
  const { tmpdir } = await import("node:os")
  const { join } = await import("node:path")
  const dir = mkdtempSync(join(tmpdir(), "smoke-"))
  const entry = join(dir, "m.ts")
  writeFileSync(entry, "export const x: number = 1 + 1\nconsole.log(x)\n")
  const build = async () => {
    const r = await Bun.build({ entrypoints: [entry], target: "browser" })
    expect(r.success).toBe(true)
    const out = r.outputs[0]
    if (!out) throw new Error("no output")
    return await out.text()
  }
  try {
    const a = await build()
    const b = await build()
    expect(a).toBe(b)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }

  // priority
  os.setPriority(process.pid, 10)
  expect(os.getPriority(process.pid)).toBeGreaterThanOrEqual(10)

  // sha256
  const h = new Bun.CryptoHasher("sha256").update("abc").digest("hex")
  expect(h).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  )

  // Bun version >= 1.3.14
  const [ma = 0, mi = 0, pa = 0] = Bun.version.split(".").map(Number)
  const v = ma * 1e6 + mi * 1e3 + pa
  expect(v).toBeGreaterThanOrEqual(1 * 1e6 + 3 * 1e3 + 14)
})

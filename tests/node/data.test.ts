import { expect, test } from "bun:test"
import {
  copyFileSync,
  cpSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { verifyData } from "../../src/node/data"
import { configureLogging } from "../../src/node/logging"
import { repoRoot } from "../helpers"

const real = join(repoRoot, "data", "literature")

function copyData(): string {
  const dir = mkdtempSync(join(tmpdir(), "spandek-data-"))
  cpSync(real, dir, { recursive: true })
  return dir
}

function capture(): { events: [string, Record<string, unknown>][] } {
  const events: [string, Record<string, unknown>][] = []
  const runDir = mkdtempSync(join(tmpdir(), "spandek-log-"))
  configureLogging({ runId: "t", level: "debug", runDir })
  return {
    get events() {
      return readFileSync(join(runDir, "run.jsonl"), "utf8")
        .split("\n")
        .filter(Boolean)
        .map((l) => JSON.parse(l))
        .map((o) => [o.event, o] as [string, Record<string, unknown>])
    },
  } as { events: typeof events }
}

test("verifyOk", async () => {
  const log = capture()
  await verifyData(real)
  const ev = log.events.find(([e]) => e === "data.verified")
  expect(ev).toBeDefined()
  expect(ev?.[1].n_files as number).toBeGreaterThan(3)
  configureLogging({ runId: "x", level: "error" })
})

test("tamperedByteExit5", async () => {
  const dir = copyData()
  try {
    const log = capture()
    const p = join(dir, "g173_global_tilt.csv")
    const b = readFileSync(p)
    b[b.length - 3] = (b[b.length - 3] as number) ^ 1
    writeFileSync(p, b)
    await expect(verifyData(dir)).rejects.toMatchObject({ code: 5 })
    expect(log.events.some(([e]) => e === "data.mismatch")).toBe(true)
  } finally {
    rmSync(dir, { recursive: true, force: true })
    configureLogging({ runId: "x", level: "error" })
  }
})

test("missingSumsExit5", async () => {
  const dir = copyData()
  try {
    rmSync(join(dir, "SHA256SUMS"))
    await expect(verifyData(dir)).rejects.toMatchObject({ code: 5 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("deletedAndUnlistedFilesExit5", async () => {
  const dir = copyData()
  try {
    writeFileSync(join(dir, "extra.csv"), "wl_um,n,k\n0.4,1.5,0\n")
    await expect(verifyData(dir)).rejects.toMatchObject({ code: 5 })
    rmSync(join(dir, "extra.csv"))
    rmSync(join(dir, "tio2_nk.csv"))
    await expect(verifyData(dir)).rejects.toMatchObject({ code: 5 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("badSumsLineAndPathEscapeExit5", async () => {
  const dir = copyData()
  try {
    copyFileSync(join(dir, "SHA256SUMS"), join(dir, "orig"))
    const good = readFileSync(join(dir, "orig"), "utf8")
    rmSync(join(dir, "orig"))
    for (const bad of [
      `${good}nothex  x.csv\n`,
      `${"0".repeat(64)}  ../escape.csv\n${good}`,
      "",
    ]) {
      writeFileSync(join(dir, "SHA256SUMS"), bad)
      await expect(verifyData(dir)).rejects.toMatchObject({ code: 5 })
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

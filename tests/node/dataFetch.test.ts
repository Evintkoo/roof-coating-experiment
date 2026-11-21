import { afterEach, expect, test } from "bun:test"
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { parseG173, parseNk } from "../../src/core/literature"
import { verifyData } from "../../src/node/data"
import { fetchData, fetchTo } from "../../src/node/dataFetch"
import { configureLogging } from "../../src/node/logging"

const servers: ReturnType<typeof Bun.serve>[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true)
  configureLogging({ runId: "x", level: "error" })
})

function serve(files: Record<string, string>): string {
  const s = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      const body = files[new URL(req.url).pathname]
      return body === undefined
        ? new Response("nope", { status: 404 })
        : new Response(body)
    },
  })
  servers.push(s)
  return `http://127.0.0.1:${s.port}`
}

function logOf(): () => Record<string, unknown>[] {
  const runDir = mkdtempSync(join(tmpdir(), "spandek-log-"))
  configureLogging({ runId: "t", level: "debug", runDir })
  return () =>
    readFileSync(join(runDir, "run.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
}

test("dataFetchedEvent", async () => {
  const body = "hello,world\n1,2\n"
  const base = serve({ "/a.csv": body })
  const events = logOf()
  const dir = mkdtempSync(join(tmpdir(), "spandek-fetch-"))
  try {
    const dest = join(dir, "a.csv")
    const sha = await fetchTo(`${base}/a.csv`, dest)
    const want = new Bun.CryptoHasher("sha256").update(body).digest("hex")
    expect(sha).toBe(want)
    expect(readFileSync(dest, "utf8")).toBe(body)
    const ev = events().find((e) => e.event === "data.fetched")
    expect(ev?.sha256).toBe(want)
    expect(ev?.bytes).toBe(Buffer.byteLength(body))
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test("fetchToRejectsHttpErrorAndDeadPort", async () => {
  const base = serve({})
  const dir = mkdtempSync(join(tmpdir(), "spandek-fetch-"))
  try {
    const dest = join(dir, "x")
    await expect(fetchTo(`${base}/missing`, dest)).rejects.toMatchObject({
      code: 5,
    })
    const dead = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response(""),
    })
    const port = dead.port
    dead.stop(true)
    await expect(
      fetchTo(`http://127.0.0.1:${port}/x`, dest),
    ).rejects.toMatchObject({ code: 5 })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

const G173 =
  "ASTM G173-03 Reference Spectra Derived from SMARTS v. 2.9.2\nWvlgth nm,Etr,Global tilt,Direct\n280,1,0.5,0.2\n300,2,1.5,1\n"
const RII = (rows: string) =>
  `DATA:\n  - type: tabulated nk\n    data: |\n${rows}\n`

test("fetchDataPipelineWritesCsvsAndVerifiableSums", async () => {
  const base = serve({
    "/g173": G173,
    "/bo": RII("      0.45 2.8\n      0.6 2.6").replace("nk", "n"),
    "/be": RII("      0.45 3.2\n      0.6 3.0").replace("nk", "n"),
    "/si": RII("      0.30 3.3 0.9\n      0.40 3.0 0.5\n      0.50 2.6 0.1"),
  })
  const dir = mkdtempSync(join(tmpdir(), "spandek-pipe-"))
  try {
    await fetchData(dir, {
      g173: `${base}/g173`,
      bondO: `${base}/bo`,
      bondE: `${base}/be`,
      siefke: `${base}/si`,
    })
    await verifyData(dir)
    expect(
      parseG173(readFileSync(join(dir, "g173_global_tilt.csv"), "utf8")).wl_um
        .length,
    ).toBe(2)
    const t = parseNk(readFileSync(join(dir, "tio2_nk.csv"), "utf8"))
    expect(Array.from(t.wl_um)).toEqual([0.3, 0.4, 0.45, 0.6])
    // frozen once: a second run refuses to overwrite
    await expect(
      fetchData(dir, { g173: "", bondO: "", bondE: "", siefke: "" }),
    ).rejects.toMatchObject({ code: 2 })
    writeFileSync(join(dir, "x"), "")
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

import { afterEach, expect, test } from "bun:test"
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { DataError, ResourceError } from "../../src/core/errors"
import type { SiteConfig } from "../../src/core/indonesia/series"
import { sha256Hex, verifyData } from "../../src/node/data"
import { configureLogging } from "../../src/node/logging"
import {
  fetchIndonesiaData,
  fetchSiteYear,
  parsePowerJson,
  rawName,
  readSiteYear,
  USER_AGENT,
  writeSums,
} from "../../src/node/power"
import { repoRoot } from "../helpers"

// A real NASA POWER response recorded in spike Q1 (Jakarta, 2023-01-01..02, all six parameters, UTC, 48 hourly rows).
const SAMPLE = readFileSync(
  join(repoRoot, "docs/spikes/plan-04/power_jakarta_2023-01-01_02_utc.json"),
  "utf8",
)
const SPAN = { start: "20230101", end: "20230102" }
const jakarta: SiteConfig = {
  id: "jakarta",
  lat: -6.2,
  lon: 106.85,
  utc_offset_h: 7,
  elevation_m: 12.32,
}

const servers: ReturnType<typeof Bun.serve>[] = []
const dirs: string[] = []
afterEach(() => {
  for (const s of servers.splice(0)) s.stop(true)
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
  configureLogging({ runId: "x", level: "error" })
})
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "spandek-power-"))
  dirs.push(d)
  return d
}

type Seen = { url: URL; ua: string | null }
/** A real local HTTP server answering with the recorded sample (or the given responder). */
function serve(respond?: (n: number) => Response): {
  base: string
  seen: Seen[]
} {
  const seen: Seen[] = []
  const s = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      seen.push({ url: new URL(req.url), ua: req.headers.get("user-agent") })
      return respond
        ? respond(seen.length)
        : new Response(SAMPLE, {
            headers: { "content-type": "application/json" },
          })
    },
  })
  servers.push(s)
  return { base: `http://127.0.0.1:${s.port}/api/temporal/hourly/point`, seen }
}

function logOf(): () => Record<string, unknown>[] {
  const runDir = tmp()
  configureLogging({ runId: "t", level: "debug", runDir })
  return () =>
    readFileSync(join(runDir, "run.jsonl"), "utf8")
      .split("\n")
      .filter(Boolean)
      .map((l) => JSON.parse(l))
}

test("fetchWritesHashedFile", async () => {
  const { base, seen } = serve()
  const events = logOf()
  const dir = tmp()
  const r = await fetchSiteYear(jakarta, 2023, dir, base, { span: SPAN })
  expect(r.rows).toBe(48)
  const dest = join(dir, rawName("jakarta", 2023))
  expect(rawName("jakarta", 2023)).toBe("raw/jakarta_2023.json")
  expect(readFileSync(dest, "utf8")).toBe(SAMPLE)
  expect(r.sha256).toBe(sha256Hex(readFileSync(dest)))
  expect(existsSync(`${dest}.part`)).toBe(false)
  // the request names the UTC time standard, the community, all six parameters, the coordinates and a generic agent
  expect(seen.length).toBe(1)
  const q = seen[0]?.url.searchParams
  expect(q?.get("time-standard")).toBe("utc")
  expect(q?.get("community")).toBe("RE")
  expect(q?.get("format")).toBe("JSON")
  expect(q?.get("parameters")).toBe(
    "ALLSKY_SFC_SW_DWN,ALLSKY_SFC_LW_DWN,T2M,RH2M,WS2M,PRECTOTCORR",
  )
  expect(q?.get("latitude")).toBe("-6.2")
  expect(q?.get("longitude")).toBe("106.85")
  expect(q?.get("start")).toBe("20230101")
  expect(q?.get("end")).toBe("20230102")
  expect(q?.has("user")).toBe(false)
  expect(seen[0]?.ua).toBe(USER_AGENT)
  // indonesia.fetch.done at info: site, year, rows, first 12 hex of the hash; no URL and no body
  const ev = events().find((e) => e.event === "indonesia.fetch.done")
  expect(ev?.level).toBe("info")
  expect(ev?.site).toBe("jakarta")
  expect(ev?.year).toBe(2023)
  expect(ev?.rows).toBe(48)
  expect(ev?.sha256).toBe(r.sha256.slice(0, 12))
  expect(JSON.stringify(ev)).not.toContain("http")
  // the cached file reads back as UTC records
  const rec = readSiteYear(dir, "jakarta", 2023)
  expect(rec.length).toBe(48)
  expect(rec[0]?.utc_ms).toBe(Date.UTC(2023, 0, 1))
  expect(rec[47]?.utc_ms).toBe(Date.UTC(2023, 0, 2, 23))
})

test("defaultSpanIsTheUtcCalendarYear", async () => {
  const { base, seen } = serve()
  const dir = tmp()
  // the sample holds 48 rows, a calendar year needs 8760: rejected as incomplete, nothing written
  let err: unknown
  try {
    await fetchSiteYear(jakarta, 2023, dir, base)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(DataError)
  expect((err as DataError).code).toBe(5)
  expect(seen[0]?.url.searchParams.get("start")).toBe("20230101")
  expect(seen[0]?.url.searchParams.get("end")).toBe("20231231")
  expect(existsSync(join(dir, rawName("jakarta", 2023)))).toBe(false)
})

test("deadPortIsExit6", async () => {
  // a real refused connection: bind a port, then release it
  const s = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(""),
  })
  const dead = `http://127.0.0.1:${s.port}/api/temporal/hourly/point`
  s.stop(true)
  const events = logOf()
  const dir = tmp()
  let err: unknown
  try {
    await fetchSiteYear(jakarta, 2023, dir, dead, { span: SPAN })
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(ResourceError)
  expect((err as ResourceError).code).toBe(6)
  const ev = events().find((e) => e.event === "indonesia.fetch.failed")
  expect(ev?.level).toBe("error")
  expect(ev?.http_status).toBe("refused")
  expect(ev?.site).toBe("jakarta")
  expect(existsSync(join(dir, "raw"))).toBe(false)
})

test("httpErrorIsExit6AndServerBusyIsRetried", async () => {
  const dir = tmp()
  const gone = serve(() => new Response("no", { status: 422 }))
  const events = logOf()
  await expect(
    fetchSiteYear(jakarta, 2023, dir, gone.base, { span: SPAN }),
  ).rejects.toBeInstanceOf(ResourceError)
  expect(gone.seen.length).toBe(1) // 4xx is not retried
  expect(
    events().find((e) => e.event === "indonesia.fetch.failed")?.http_status,
  ).toBe(422)
  const busy = serve((n) =>
    n === 1
      ? new Response("busy", { status: 503 })
      : new Response(SAMPLE, {
          headers: { "content-type": "application/json" },
        }),
  )
  const r = await fetchSiteYear(jakarta, 2023, dir, busy.base, {
    span: SPAN,
    retryDelayMs: 1,
  })
  expect(r.rows).toBe(48)
  expect(busy.seen.length).toBe(2)
})

test("hashMismatchIsExit5", async () => {
  const { base } = serve()
  const dir = tmp()
  await fetchSiteYear(jakarta, 2023, dir, base, { span: SPAN })
  expect(writeSums(dir)).toBe(1)
  await verifyData(dir) // passes on the untouched cache
  const file = join(dir, rawName("jakarta", 2023))
  const bytes = readFileSync(file)
  bytes[100] = (bytes[100] as number) ^ 1 // F3: one byte changed
  writeFileSync(file, bytes)
  let err: unknown
  try {
    await verifyData(dir)
  } catch (e) {
    err = e
  }
  expect(err).toBeInstanceOf(DataError)
  expect((err as DataError).code).toBe(5)
  expect((err as DataError).key).toBe(rawName("jakarta", 2023))
})

test("parserRejectsLstFillGapAndMissingParameter", () => {
  const doc = JSON.parse(SAMPLE)
  const text = (f: (d: typeof doc) => void) => {
    const d = structuredClone(doc)
    f(d)
    return JSON.stringify(d)
  }
  expect(parsePowerJson(SAMPLE, "x").length).toBe(48)
  const bad = (t: string) =>
    expect(() => parsePowerJson(t, "x")).toThrow(DataError)
  bad(
    text((d) => {
      d.header.time_standard = "LST"
    }),
  )
  bad(
    text((d) => {
      d.properties.parameter.ALLSKY_SFC_SW_DWN["2023010105"] = -999
    }),
  )
  bad(
    text((d) => {
      delete d.properties.parameter.RH2M
    }),
  )
  bad(
    text((d) => {
      delete d.properties.parameter.T2M["2023010110"]
    }),
  )
  bad(
    text((d) => {
      delete d.properties.parameter.WS2M["2023010110"]
    }),
  )
  bad(
    text((d) => {
      d.properties.parameter.PRECTOTCORR["2023010105"] = null
    }),
  )
  bad("not json")
})

test("fetchAllResumesSequentiallyAndWritesSums", async () => {
  const dir = tmp()
  const a = serve()
  await fetchSiteYear(jakarta, 2023, dir, a.base, { span: SPAN })
  // an existing site-year is kept (zero requests, even against a dead port); sums cover the cache
  const s = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(""),
  })
  const dead = `http://127.0.0.1:${s.port}/x`
  s.stop(true)
  const n = await fetchIndonesiaData([jakarta], 2023, 2023, dir, dead, 1)
  expect(n).toBe(0)
  await verifyData(dir)
  const sums = readFileSync(join(dir, "SHA256SUMS"), "utf8")
  expect(sums).toBe(`${sha256Hex(SAMPLE)}  raw/jakarta_2023.json\n`)
  // a missing site-year is fetched, and a dead port stops the run with exit 6
  await expect(
    fetchIndonesiaData([jakarta], 2023, 2024, dir, dead, 1),
  ).rejects.toBeInstanceOf(ResourceError)
})

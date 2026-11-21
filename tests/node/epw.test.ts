import { afterEach, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { deflateRawSync } from "node:zlib"
import { DataError, ResourceError } from "../../src/core/errors"
import type { SiteConfig } from "../../src/core/indonesia/series"
import { extractEpw, fetchTmyx, parseEpw, TMYX_FILES } from "../../src/node/epw"
import { USER_AGENT } from "../../src/node/power"
import { events, indonesiaConfigCopy, run, weatherSubset } from "../helpers"

const CAL = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const HEADER = [
  "LOCATION,Jakarta-Soekarno-Hatta.Intl.AP,JW,IDN,SRC-TMYx,967490,-6.12550,106.6590,7.0,10.4",
  "DESIGN CONDITIONS,0",
  "TYPICAL/EXTREME PERIODS,0",
  "GROUND TEMPERATURES,0",
  "HOLIDAYS/DAYLIGHT SAVINGS,No,0,0,0",
  "COMMENTS 1,test",
  "COMMENTS 2,test",
  "DATA PERIODS,1,1,Data,Sunday, 1/ 1,12/31",
]

/** An EPW row in the real column layout (35 fields); GHI is field 13. A calendar year without 29 February. */
function epw(
  ghiOf: (m: number, d: number, h: number) => string,
  drop = 0,
): string {
  const rows: string[] = []
  for (const [mi, n] of CAL.entries())
    for (let d = 1; d <= n; d++)
      for (let h = 1; h <= 24; h++) {
        const f = [
          2025,
          mi + 1,
          d,
          h,
          0,
          "?9?9",
          26.2,
          23.9,
          87,
          100930,
          0,
          0,
          404,
          ghiOf(mi + 1, d, h),
        ]
        while (f.length < 35) f.push(0)
        rows.push(f.join(","))
      }
  return [...HEADER, ...rows.slice(0, rows.length - drop)].join("\n")
}

test("parseEpw8760Rows", () => {
  const r = parseEpw(epw((m, _d, h) => String(m * 100 + h)))
  expect(r.ghi.length).toBe(8760)
  expect(r.month.length).toBe(8760)
  expect(r.ghi[0]).toBe(101) // 1 January, hour 1
  expect(r.ghi[8759]).toBe(1224) // 31 December, hour 24
  const perMonth = new Array<number>(12).fill(0)
  for (const m of r.month) perMonth[m - 1] = (perMonth[m - 1] as number) + 1
  expect(perMonth).toEqual(CAL.map((n) => n * 24)) // February has 672 hours: no leap day
  // a trailing newline and CRLF line ends are tolerated
  expect(
    parseEpw(`${epw(() => "5").replaceAll("\n", "\r\n")}\r\n`).ghi.length,
  ).toBe(8760)
})

test("parseEpwRejectsBadFiles", () => {
  const ok = () => "1"
  expect(() => parseEpw(epw(ok, 1))).toThrow(DataError) // 8759 rows
  expect(() =>
    parseEpw(`${epw(ok)}\n${"2025,1,1,1,0,x,0,0,0,0,0,0,0,0"}`),
  ).toThrow(DataError) // 8761 rows
  expect(() =>
    parseEpw(epw((m, d, h) => (m === 3 && d === 4 && h === 5 ? "9999" : "1"))),
  ).toThrow(DataError)
  expect(() =>
    parseEpw(epw((m, d, h) => (m === 3 && d === 4 && h === 5 ? "-4" : "1"))),
  ).toThrow(DataError)
  expect(() =>
    parseEpw(epw((m, d, h) => (m === 3 && d === 4 && h === 5 ? "abc" : "1"))),
  ).toThrow(DataError)
  expect(() => parseEpw(epw(ok).replace("LOCATION,", "SITE,"))).toThrow(
    DataError,
  )
  expect(() => parseEpw("")).toThrow(DataError)
})

test("tmyxFilesCoverFiveSites", () => {
  expect(Object.keys(TMYX_FILES)).toEqual([
    "jakarta",
    "surabaya",
    "medan",
    "makassar",
    "bandung",
  ])
  for (const p of Object.values(TMYX_FILES))
    expect(p).toMatch(/_TMYx\.2011-2025\.zip$/)
})

// ---- zip reading and the TMYx download (a real local HTTP server serves a real zip structure) ----

/** A zip archive with the given members (method 0 stored, 8 deflate), real headers and CRC-32. */
function zip(members: [string, string, 0 | 8][]): Buffer & BodyInit {
  const parts: Buffer[] = []
  const central: Buffer[] = []
  let offset = 0
  for (const [name, text, method] of members) {
    const raw = Buffer.from(text)
    const body = method === 8 ? deflateRawSync(raw) : raw
    const n = Buffer.from(name)
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0)
    local.writeUInt16LE(20, 4)
    local.writeUInt16LE(method, 8)
    local.writeUInt32LE(Bun.hash.crc32(raw), 14)
    local.writeUInt32LE(body.length, 18)
    local.writeUInt32LE(raw.length, 22)
    local.writeUInt16LE(n.length, 26)
    const c = Buffer.alloc(46)
    c.writeUInt32LE(0x02014b50, 0)
    c.writeUInt16LE(20, 4)
    c.writeUInt16LE(20, 6)
    c.writeUInt16LE(method, 10)
    c.writeUInt32LE(Bun.hash.crc32(raw), 16)
    c.writeUInt32LE(body.length, 20)
    c.writeUInt32LE(raw.length, 24)
    c.writeUInt16LE(n.length, 28)
    c.writeUInt32LE(offset, 42)
    central.push(Buffer.concat([c, n]))
    parts.push(local, n, body)
    offset += 30 + n.length + body.length
  }
  const cd = Buffer.concat(central)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(members.length, 8)
  end.writeUInt16LE(members.length, 10)
  end.writeUInt32LE(cd.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...parts, cd, end]) as Buffer & BodyInit
}

const servers: ReturnType<typeof Bun.serve>[] = []
const dirs: string[] = []
afterEach(() => {
  for (const sv of servers.splice(0)) sv.stop(true)
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "spandek-tmyx-"))
  dirs.push(d)
  return d
}
const site = (id: string): SiteConfig => ({
  id,
  lat: 0,
  lon: 100,
  utc_offset_h: 7,
  elevation_m: 1,
})

test("extractEpwReadsDeflateAndStoredMembersAndSkipsOthers", () => {
  const text = epw(() => "7")
  expect(
    extractEpw(
      zip([
        ["x.stat", "not this", 8],
        ["a.ddy", "nor this", 0],
        ["IDN_X.epw", text, 8],
      ]),
    ),
  ).toBe(text)
  expect(extractEpw(zip([["IDN_X.EPW", text, 0]]))).toBe(text)
  expect(() => extractEpw(zip([["only.stat", "x", 0]]))).toThrow(DataError)
  expect(() => extractEpw(new Uint8Array(10))).toThrow(DataError)
  const z = zip([["a.epw", text, 8]])
  expect(() => extractEpw(z.subarray(0, z.length - 30))).toThrow(DataError)
})

test("fetchTmyxDownloadsExtractsAndSkipsExistingFiles", async () => {
  const text = epw(() => "3")
  const seen: { path: string; ua: string | null }[] = []
  const sv = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch(req) {
      seen.push({
        path: new URL(req.url).pathname,
        ua: req.headers.get("user-agent"),
      })
      return new Response(
        zip([
          ["x.stat", "s", 8],
          ["a.epw", text, 8],
        ]),
      )
    },
  })
  servers.push(sv)
  const base = `http://127.0.0.1:${sv.port}/tmyx`
  const dir = tmp()
  expect(
    await fetchTmyx([site("jakarta"), site("bandung")], dir, base, 0),
  ).toBe(2)
  expect(readFileSync(join(dir, "tmyx/jakarta.epw"), "utf8")).toBe(text)
  expect(existsSync(join(dir, "tmyx/bandung.epw"))).toBe(true)
  expect(seen.map((x) => x.path)).toEqual([
    `/tmyx/${TMYX_FILES.jakarta}`,
    `/tmyx/${TMYX_FILES.bandung}`,
  ])
  for (const x of seen) expect(x.ua).toBe(USER_AGENT) // a generic client name, nothing personal
  // resumable: existing files are not requested again
  expect(await fetchTmyx([site("jakarta")], dir, base, 0)).toBe(0)
  expect(seen.length).toBe(2)
})

test("fetchTmyxRefusesBadDownloads", async () => {
  const dir = tmp()
  // dead port: a real refused connection
  const probe = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(""),
  })
  const dead = probe.port
  probe.stop(true)
  await expect(
    fetchTmyx([site("jakarta")], dir, `http://127.0.0.1:${dead}/x`, 0),
  ).rejects.toBeInstanceOf(ResourceError)
  const notFound = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response("no", { status: 404 }),
  })
  servers.push(notFound)
  await expect(
    fetchTmyx([site("jakarta")], dir, `http://127.0.0.1:${notFound.port}/x`, 0),
  ).rejects.toBeInstanceOf(ResourceError)
  // a zip whose EPW has 8759 rows never reaches the cache
  const bad = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(zip([["a.epw", epw(() => "1", 1), 8]])),
  })
  servers.push(bad)
  await expect(
    fetchTmyx([site("jakarta")], dir, `http://127.0.0.1:${bad.port}/x`, 0),
  ).rejects.toBeInstanceOf(DataError)
  expect(existsSync(join(dir, "tmyx/jakarta.epw"))).toBe(false)
  // plain http to a remote host is refused before any request
  await expect(
    fetchTmyx([site("jakarta")], dir, "http://example.org/x", 0),
  ).rejects.toBeInstanceOf(DataError)
})

// ---- fetch-data --indonesia through the real CLI (cache present, TMYx missing, a real local server) ----

async function cliFetch(wx: string, tmyxUrl: string, extra: string[] = []) {
  const cfg = indonesiaConfigCopy(2023, 2023)
  return run([
    "fetch-data",
    "--indonesia",
    "--site",
    "jakarta",
    "--config-dir",
    cfg,
    "--weather-dir",
    wx,
    "--tmyx-url",
    tmyxUrl,
    "--sleep-ms",
    "0",
    "--max-load",
    "1000",
    ...extra,
  ])
}

test("fetchDataIndonesiaCliDownloadsTmyxAndKeepsCommittedHashes", async () => {
  const wx = await weatherSubset(["jakarta"], 2023, 2023)
  dirs.push(wx)
  const real = readFileSync(join(wx, "tmyx/jakarta.epw"), "utf8")
  const sums = readFileSync(join(wx, "SHA256SUMS"), "utf8")
  rmSync(join(wx, "tmyx/jakarta.epw"))
  const serve = (text: string) => {
    const sv = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response(zip([["a.epw", text, 8]])),
    })
    servers.push(sv)
    return `http://127.0.0.1:${sv.port}/z`
  }
  // the same bytes as the committed list: success, SHA256SUMS unchanged
  const ok = await cliFetch(wx, serve(real))
  expect(ok.exitCode).toBe(0)
  expect(readFileSync(join(wx, "SHA256SUMS"), "utf8")).toBe(sums)
  expect(readFileSync(join(wx, "tmyx/jakarta.epw"), "utf8")).toBe(real)
  // changed upstream bytes: exit 5, phase indonesia.verify, the committed list is kept
  rmSync(join(wx, "tmyx/jakarta.epw"))
  const bad = await cliFetch(wx, serve(epw(() => "1")))
  expect(bad.exitCode).toBe(5)
  const e = events(bad).find((x) => x.event === "error.raised")
  expect(e?.phase).toBe("indonesia.verify")
  expect(readFileSync(join(wx, "SHA256SUMS"), "utf8")).toBe(sums)
})

test("fetchDataIndonesiaCliDeadPortIsExit6", async () => {
  const probe = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () => new Response(""),
  })
  const dead = probe.port
  probe.stop(true)
  const wx = tmp() // empty: nothing cached, so the first request is made
  const r = await cliFetch(wx, `http://127.0.0.1:${dead}/z`, [
    "--base-url",
    `http://127.0.0.1:${dead}/api`,
  ])
  expect(r.exitCode).toBe(6)
  const e = events(r).find((x) => x.event === "error.raised")
  expect(e?.phase).toBe("indonesia.fetch")
})

import { afterEach, expect, test } from "bun:test"
import {
  cpSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import type { SpandekError } from "../../../src/core/errors"
import { setEventSink } from "../../../src/core/events"
import {
  buildDesignAssets,
  FONT_FILES,
  loadFonts,
  MANIFEST,
  vendorCheck,
  writeManifest,
} from "../../../src/node/report/design"
import { THEMES } from "../../../src/web/design/themes"
import { repoRoot } from "../../helpers"

type Ev = { event: string; level: string; fields: Record<string, unknown> }
const events: Ev[] = []
const tmps: string[] = []
const tmp = () => {
  const d = mkdtempSync(join(tmpdir(), "design-test-"))
  tmps.push(d)
  return d
}
afterEach(() => {
  setEventSink(null)
  events.length = 0
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true })
})
const capture = () =>
  setEventSink((event, level, fields) => events.push({ event, level, fields }))
const vendor = join(repoRoot, "vendor")
const fontsDir = join(repoRoot, "src/node/report/fonts")

function copyVendorTo(dir: string): string {
  const copy = join(dir, "vendor")
  cpSync(vendor, copy, { recursive: true })
  return copy
}
function flipOneByte(path: string, at = 10): void {
  const b = readFileSync(path)
  b[at] = (b[at] as number) ^ 1
  writeFileSync(path, b)
}
const catchErr = (fn: () => unknown): SpandekError => {
  try {
    fn()
  } catch (e) {
    return e as SpandekError
  }
  throw new Error("expected a throw")
}

test("realVendorTreeMatchesItsManifest", () => {
  expect(vendorCheck(vendor)).toEqual({ ok: true })
})

test("vendorCheckDetectsOneByte", () => {
  const copy = copyVendorTo(tmp())
  flipOneByte(join(copy, "torviello-design/contracts/design-tokens.json"))
  const r = vendorCheck(copy)
  expect(r).toMatchObject({ ok: false, count: 1 })
  const lines = readFileSync(join(copy, MANIFEST), "utf8")
    .split("\n")
    .filter(Boolean)
  const idx = lines.findIndex((l) =>
    l.endsWith("  torviello-design/contracts/design-tokens.json"),
  )
  expect(r).toMatchObject({ first: idx })
})

test("vendorCheckDetectsMissingExtraAndNoManifest", () => {
  const copy = copyVendorTo(tmp())
  rmSync(join(copy, "torviello-landing-ui/styles/base.css"))
  expect(vendorCheck(copy)).toMatchObject({ ok: false, count: 1 })
  cpSync(
    join(vendor, "torviello-landing-ui/styles/base.css"),
    join(copy, "torviello-landing-ui/styles/base.css"),
  )
  expect(vendorCheck(copy)).toEqual({ ok: true })
  writeFileSync(join(copy, "torviello-design/extra.txt"), "x")
  expect(vendorCheck(copy)).toMatchObject({ ok: false, count: 1 })
  rmSync(join(copy, "torviello-design/extra.txt"))
  writeFileSync(join(copy, "VENDORED.md"), "edited note")
  expect(vendorCheck(copy)).toEqual({ ok: true })
  rmSync(join(copy, MANIFEST))
  expect(vendorCheck(copy).ok).toBe(false)
})

test("writeManifestRoundTrips", () => {
  const copy = copyVendorTo(tmp())
  const before = readFileSync(join(copy, MANIFEST), "utf8")
  rmSync(join(copy, MANIFEST))
  expect(writeManifest(copy)).toBeGreaterThan(60)
  expect(readFileSync(join(copy, MANIFEST), "utf8")).toBe(before)
})

test("vendorDriftEventNamesCountAndIndexNotAPath", () => {
  capture()
  const copy = copyVendorTo(tmp())
  flipOneByte(join(copy, "torviello-design/contracts/design-tokens.json"))
  const err = catchErr(() => buildDesignAssets({ vendorRoot: copy, fontsDir }))
  expect(err.code).toBe(5)
  expect(err.phase).toBe("design.vendor")
  const e = events.find((x) => x.event === "design.vendor.drift")
  expect(e?.level).toBe("error")
  expect(Object.keys(e?.fields ?? {}).sort()).toEqual([
    "file_count",
    "first_id",
  ])
  expect(e?.fields.file_count).toBe(1)
  expect(JSON.stringify(e)).not.toContain("design-tokens")
})

test("fontsLoadAsBase64AndAreReproducible", () => {
  const a = loadFonts(fontsDir)
  expect(a.map((f) => `${f.family} ${f.weight}`)).toEqual([
    "Inter 400",
    "Inter 600",
    "JetBrains Mono 400",
    "JetBrains Mono 600",
  ])
  const total = a.reduce((n, f) => n + f.base64.length, 0)
  expect(total).toBeGreaterThan(70_000)
  expect(total).toBeLessThan(80_000) // Q2: 75,856 base64 bytes
  expect(JSON.stringify(loadFonts(fontsDir))).toBe(JSON.stringify(a))
  // the committed subsets are the ones the Q2 spike measured
  for (const f of FONT_FILES)
    expect(
      readFileSync(join(fontsDir, f.file)).equals(
        readFileSync(join(repoRoot, "docs/spikes/plan-06/fonts", f.file)),
      ),
    ).toBe(true)
})

test("missingFontIsExit5PhaseDesignFonts", () => {
  const dir = tmp()
  cpSync(fontsDir, dir, { recursive: true })
  rmSync(join(dir, "Inter-SemiBold-subset.woff2"))
  const err = catchErr(() => loadFonts(dir))
  expect(err.code).toBe(5)
  expect(err.phase).toBe("design.fonts")
  const err2 = catchErr(() =>
    buildDesignAssets({ vendorRoot: vendor, fontsDir: dir }),
  )
  expect(err2.code).toBe(5)
  expect(err2.phase).toBe("design.fonts")
  // an empty file is as bad as a missing one
  writeFileSync(join(dir, "Inter-SemiBold-subset.woff2"), "")
  expect(catchErr(() => loadFonts(dir)).code).toBe(5)
})

test("fontLicencesShipWithTheFonts", () => {
  const names = readdirSync(fontsDir)
  expect(names).toContain("OFL-Inter.txt")
  expect(names).toContain("OFL-JetBrainsMono.txt")
})

test("buildDesignAssetsEmitsStartAndDoneOnce", () => {
  capture()
  const a = buildDesignAssets({
    vendorRoot: vendor,
    fontsDir,
    componentCount: 8,
  })
  expect(a.css.length).toBeGreaterThan(1000)
  expect(a.css).toContain("--tv-surface-base:#0b1020;")
  expect(a.css).toContain(".tv-button--primary")
  expect(a.css).toContain(".tv-badge--proxy")
  expect(a.fontCss).toContain("@font-face")
  expect(a.fontBytes).toBeGreaterThan(70_000)
  a.done(12345)
  const start = events.filter((e) => e.event === "design.build.start")
  const done = events.filter((e) => e.event === "design.build.done")
  expect(start.length).toBe(1)
  expect(start[0]).toMatchObject({
    level: "info",
    fields: { theme_count: 2, component_count: 8 },
  })
  expect(done.length).toBe(1)
  expect(done[0]?.level).toBe("info")
  const f = done[0]?.fields ?? {}
  expect(Object.keys(f).sort()).toEqual([
    "css_bytes",
    "font_bytes",
    "html_bytes",
    "ms",
  ])
  expect(f.html_bytes).toBe(12345)
  expect(f.css_bytes).toBe(Buffer.byteLength(a.css))
  expect(f.font_bytes).toBe(a.fontBytes)
  expect(typeof f.ms).toBe("number")
})

test("buildDesignAssetsIsByteReproducible", () => {
  const a = buildDesignAssets({ vendorRoot: vendor, fontsDir })
  const b = buildDesignAssets({ vendorRoot: vendor, fontsDir })
  expect(a.css).toBe(b.css)
  expect(a.fontCss).toBe(b.fontCss)
})

test("missingTokenInContractCopyIsExit2AndEvent_F1", () => {
  capture()
  const copy = copyVendorTo(tmp())
  const p = join(copy, "torviello-design/contracts/design-tokens.json")
  const c = JSON.parse(readFileSync(p, "utf8"))
  delete c.semantic["surface-base"]
  writeFileSync(p, JSON.stringify(c))
  // the vendor copy is now also drifted: re-record it deliberately so only the token is missing
  writeManifest(copy)
  const err = catchErr(() => buildDesignAssets({ vendorRoot: copy, fontsDir }))
  expect(err.code).toBe(2)
  expect(err.phase).toBe("design.tokens")
  expect(err.key).toBe("surface-base")
  const e = events.find((x) => x.event === "design.token.missing")
  expect(e?.fields).toEqual({ token: "surface-base" })
  expect(e?.level).toBe("error")
})

test("contrastFailIsExit4NamingThePair_F3", () => {
  capture()
  const themes = {
    ...THEMES,
    light: { ...THEMES.light, "text-muted": "rgba(11, 16, 32, 0.30)" },
  }
  const err = catchErr(() =>
    buildDesignAssets({ vendorRoot: vendor, fontsDir, themes }),
  )
  expect(err.code).toBe(4)
  expect(err.phase).toBe("design.contrast")
  const fails = events.filter((x) => x.event === "design.contrast.fail")
  expect(fails.length).toBeGreaterThan(0)
  const first = fails[0]
  expect(first?.level).toBe("error")
  expect(first?.fields.pair).toMatch(/^light:text-muted\/surface-/)
  expect(first?.fields.needed).toBe(4.5)
  expect(Number(first?.fields.ratio)).toBeLessThan(4.5)
  expect(err.key).toBe(String(first?.fields.pair))
})

// Design assets for the report: the vendor drift check (H5, F2), the embedded fonts (D4, F4), the token CSS with its
// contrast gate (H4, F3) and the build events. Node only: it reads vendor/ and the font files; src/web/design stays pure.
import { createHash } from "node:crypto"
import {
  existsSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { join, relative } from "node:path"
import { DataError, SpandekError } from "../../core/errors"
import { emitEvent } from "../../core/events"
import { componentsCss } from "../../web/design/css"
import { fontFaceCss } from "../../web/design/fonts"
import { type PlotTheme, plotTheme } from "../../web/design/plotTheme"
import {
  evaluatePairs,
  type PairRow,
  THEMES,
  type Themes,
} from "../../web/design/themes"
import {
  compileTokens,
  resolveFixed,
  resolveTheme,
} from "../../web/design/tokens"

// ---- vendor drift check ------------------------------------------------------------------------------------------------

export const MANIFEST = "manifest.sha256"
const EXCLUDED = new Set(["VENDORED.md", MANIFEST])

export type VendorResult =
  | { ok: true }
  | { ok: false; first: number; count: number }

function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, base))
    else if (e.isFile()) out.push(relative(base, p).split("\\").join("/"))
  }
  return out
}
const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex")
/** Plain bytewise order, the same as `LC_ALL=C sort`. */
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function listVendorFiles(root: string): string[] {
  return walk(root)
    .filter((f) => !EXCLUDED.has(f))
    .sort(byBytes)
}

/** Record the vendored tree (a deliberate re-sync only); returns the number of files. */
export function writeManifest(root: string): number {
  const files = listVendorFiles(root)
  writeFileSync(
    join(root, MANIFEST),
    `${files.map((f) => `${sha256(join(root, f))}  ${f}`).join("\n")}\n`,
  )
  return files.length
}

/**
 * Compare `root` with `root/manifest.sha256`. `first` is the index of the first offending manifest line (an unlisted extra
 * file counts after the last line); `count` is how many entries differ. A missing manifest fails closed.
 */
export function vendorCheck(root: string): VendorResult {
  const mp = join(root, MANIFEST)
  if (!existsSync(mp)) return { ok: false, first: 0, count: 1 }
  const lines = readFileSync(mp, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
  const bad: number[] = []
  const listed = new Set<string>()
  for (const [i, line] of lines.entries()) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)
    if (!m) {
      bad.push(i)
      continue
    }
    const path = m[2] as string
    listed.add(path)
    const p = join(root, path)
    if (!existsSync(p) || !statSync(p).isFile() || sha256(p) !== m[1])
      bad.push(i)
  }
  let extra = 0
  for (const f of listVendorFiles(root)) {
    if (!listed.has(f)) {
      bad.push(lines.length + extra)
      extra++
    }
  }
  if (bad.length === 0) return { ok: true }
  return { ok: false, first: Math.min(...bad), count: bad.length }
}

// ---- fonts -------------------------------------------------------------------------------------------------------------

/** Inter 4.1 and JetBrains Mono 2.304 subsets (SIL OFL 1.1, licences beside the files), Q2 of the plan 06 spike. */
export const FONT_FILES = [
  { file: "Inter-Regular-subset.woff2", family: "Inter", weight: 400 },
  { file: "Inter-SemiBold-subset.woff2", family: "Inter", weight: 600 },
  {
    file: "JetBrainsMono-Regular-subset.woff2",
    family: "JetBrains Mono",
    weight: 400,
  },
  {
    file: "JetBrainsMono-SemiBold-subset.woff2",
    family: "JetBrains Mono",
    weight: 600,
  },
] as const

export type LoadedFont = { family: string; weight: number; base64: string }

/** F4: a missing or empty font file is exit 5, phase design.fonts (the key is the file's base name, never a path). */
export function loadFonts(dir: string): LoadedFont[] {
  return FONT_FILES.map((f) => {
    const p = join(dir, f.file)
    let bytes: Buffer
    try {
      bytes = readFileSync(p)
    } catch {
      throw new DataError(
        f.file,
        `embedded font ${f.file} is missing`,
        "design.fonts",
      )
    }
    if (bytes.length === 0)
      throw new DataError(
        f.file,
        `embedded font ${f.file} is empty`,
        "design.fonts",
      )
    return {
      family: f.family,
      weight: f.weight,
      base64: bytes.toString("base64"),
    }
  })
}

/** The licence notices (OFL-*.txt) that sit beside the font files, in file-name order; a font without its licence is exit 5, phase design.fonts. */
export function loadLicences(dir: string): { name: string; text: string }[] {
  const files = FONT_FILES.map((f) => f.family)
    .filter((f, i, a) => a.indexOf(f) === i)
    .map((family) => ({
      family,
      file: `OFL-${family.replaceAll(" ", "")}.txt`,
    }))
  return files.map(({ family, file }) => {
    let text: string
    try {
      text = readFileSync(join(dir, file), "utf8")
    } catch {
      throw new DataError(
        file,
        `licence ${file} of the embedded font ${family} is missing`,
        "design.fonts",
      )
    }
    if (text.trim() === "")
      throw new DataError(file, `licence ${file} is empty`, "design.fonts")
    return { name: `${family} (SIL Open Font License 1.1)`, text }
  })
}

// ---- contrast gate -----------------------------------------------------------------------------------------------------

/** H4, F3: every token pair of both themes meets its threshold; each failing pair is an event, the first one is the error. */
export function checkContrast(contract: unknown, themes: Themes): PairRow[] {
  const rows = evaluatePairs({
    dark: resolveTheme(contract, themes, "dark"),
    light: resolveTheme(contract, themes, "light"),
  })
  const failed = rows.filter((r) => r.ratio < r.needed)
  for (const r of failed)
    emitEvent("design.contrast.fail", "error", {
      pair: `${r.theme}:${r.fg}/${r.bg}`,
      ratio: Math.round(r.ratio * 100) / 100,
      needed: r.needed,
    })
  const first = failed[0]
  if (first)
    throw new SpandekError(
      4,
      "design.contrast",
      `${first.theme}:${first.fg}/${first.bg}`,
      `${failed.length} token pair(s) below their contrast threshold`,
    )
  return rows
}

// ---- build -------------------------------------------------------------------------------------------------------------

export type DesignBuildOptions = {
  vendorRoot: string
  fontsDir: string
  /** Override the theme values (the contrast gate and F3 tests use it). */
  themes?: Themes
  componentCount?: number
}
export type DesignAssets = {
  /** Token and atom CSS, without the font faces. */
  css: string
  fontCss: string
  /** Base64 bytes of the embedded fonts. */
  fontBytes: number
  /** Figure colours of both themes, resolved from the same tokens (embedded in the page data). */
  plotThemes: { dark: PlotTheme; light: PlotTheme }
  /** Emit `design.build.done`; call once the page is assembled. */
  done(htmlBytes: number): void
}

const CONTRACT = "torviello-design/contracts/design-tokens.json"

export function buildDesignAssets(opts: DesignBuildOptions): DesignAssets {
  const t0 = performance.now()
  const themes = opts.themes ?? THEMES
  emitEvent("design.build.start", "info", {
    theme_count: 2,
    component_count: opts.componentCount ?? 0,
  })
  const drift = vendorCheck(opts.vendorRoot)
  if (!drift.ok) {
    emitEvent("design.vendor.drift", "error", {
      file_count: drift.count,
      first_id: drift.first,
    })
    throw new SpandekError(
      5,
      "design.vendor",
      String(drift.first),
      `vendor/ differs from its manifest in ${drift.count} entr${drift.count === 1 ? "y" : "ies"}`,
    )
  }
  const contract: unknown = JSON.parse(
    readFileSync(join(opts.vendorRoot, CONTRACT), "utf8"),
  )
  const tokens = compileTokens(contract, themes)
  checkContrast(contract, themes)
  const fonts = loadFonts(opts.fontsDir)
  const css = tokens.css + componentsCss()
  const fontCss = fontFaceCss(fonts)
  const fontBytes = fonts.reduce((n, f) => n + f.base64.length, 0)
  const family = String(resolveFixed(contract)["font-sans"])
  const plotThemes = {
    dark: plotTheme("dark", resolveTheme(contract, themes, "dark"), family),
    light: plotTheme("light", resolveTheme(contract, themes, "light"), family),
  }
  return {
    css,
    fontCss,
    fontBytes,
    plotThemes,
    done(htmlBytes: number) {
      emitEvent("design.build.done", "info", {
        css_bytes: Buffer.byteLength(css),
        font_bytes: fontBytes,
        html_bytes: htmlBytes,
        ms: Math.round(performance.now() - t0),
      })
    },
  }
}

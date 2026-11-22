// Plan 06 spike Q3: derive the light theme from the Torviello brand and compute the full contrast pair table for both themes.
// Run: bun docs/spikes/plan-06/q3_light_theme.ts   (exit 0 only when every expectation holds; writes q3-contrast.json)
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { blend, contrast, fromOklch, oklch } from "./lib/colour"

const HERE = dirname(new URL(import.meta.url).pathname)
const ROOT = join(HERE, "..", "..", "..")
const T_TEXT = 4.5
const T_LARGE = 3
const MARGIN = 0.05 // derived inks aim this far above the threshold so rounding never decides a pair

const fails: string[] = []
const expect = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`)
  if (!cond) fails.push(msg)
}

// 1. instrument checks: independent known values (the contract states its own ratios).
expect(
  Math.abs(contrast("#ffffff", "#000000") - 21) < 0.005,
  "instrument: white on black is 21",
)
const contract = JSON.parse(
  readFileSync(
    join(ROOT, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
const sem = contract.semantic as Record<string, { $value: string }>
const prim = contract.color as Record<string, { $value: string }>
const stated: [string, string, string, number][] = [
  [
    "orange on midnight",
    prim.orange?.$value as string,
    prim.midnight?.$value as string,
    6.58,
  ],
  [
    "warm-white on midnight",
    prim["warm-white"]?.$value as string,
    prim.midnight?.$value as string,
    17.82,
  ],
  [
    "signal-teal on midnight",
    prim["signal-teal"]?.$value as string,
    prim.midnight?.$value as string,
    10.09,
  ],
  [
    "orange-hover on midnight",
    prim["orange-hover"]?.$value as string,
    prim.midnight?.$value as string,
    7.91,
  ],
  [
    "text-muted (blended) on midnight",
    sem["text-muted"]?.$value as string,
    prim.midnight?.$value as string,
    9.44,
  ],
  [
    "action-label on orange",
    prim.midnight?.$value as string,
    prim.orange?.$value as string,
    6.58,
  ],
]
for (const [name, fg, bg, want] of stated) {
  const got = contrast(fg, bg)
  expect(
    Math.abs(got - want) <= 0.01,
    `instrument: ${name} = ${got.toFixed(2)} (contract states ${want})`,
  )
}

// 2. dark theme: exactly the contract's semantic values.
const val = (k: string) =>
  (sem[k]?.$value as string) ??
  ((): never => {
    throw new Error(`token missing: ${k}`)
  })()
const dark: Record<string, string> = {}
for (const k of Object.keys(sem)) dark[k] = val(k)

// 3. light theme: surfaces from warm-white, text from midnight, orange kept for fills, teal and orange inks darkened in
//    their own hue only as far as contrast demands.
const MID = prim.midnight?.$value as string
const WW = prim["warm-white"]?.$value as string
const light: Record<string, string> = {
  "surface-base": WW,
  "surface-canvas": "#edf0f5",
  "surface-elevated": "#ffffff",
  "surface-card": "#ffffff",
  "surface-glass": "rgba(11, 16, 32, 0.04)",
  "surface-raised": "rgba(11, 16, 32, 0.07)",
  "border-glass": "rgba(11, 16, 32, 0.14)",
  "border-panel": "rgba(11, 16, 32, 0.10)",
  "border-panel-strong": "rgba(11, 16, 32, 0.18)",
  "text-primary": MID,
  "text-muted": "rgba(11, 16, 32, 0.72)",
  "action-primary": val("action-primary"),
  "action-primary-hover": val("action-primary-hover"),
  "action-label": MID,
  "accent-orange-light": val("accent-orange-light"),
  "accent-orange-dark": val("accent-orange-dark"),
  "glow-orange": val("glow-orange"),
}
const SURF = [
  "surface-base",
  "surface-glass",
  "surface-raised",
  "surface-canvas",
  "surface-elevated",
  "surface-card",
] as const
const resolveSurface = (theme: Record<string, string>, k: string) =>
  blend(theme[k] as string, theme["surface-base"] as string)
const lightSurfaces = SURF.map((k) => resolveSurface(light, k))
const darkSurfaces = SURF.map((k) => resolveSurface(dark, k))

/** A tone at 14 % (0x24 / 255) over a surface: the badge background. */
const tintOver = (tone: string, surface: string) => blend(`${tone}24`, surface)
/** Same hue and chroma as `hex`, lightness moved (down for light surfaces, up for dark) until `target` holds on every surface. */
function ink(
  hex: string,
  surfaces: string[],
  target: number,
  dir: -1 | 1,
  tinted = false,
): string {
  const { L, C, h } = oklch(hex)
  let l = L
  let out = hex
  for (let i = 0; i < 600; i++) {
    const sets = tinted
      ? [...surfaces, ...surfaces.map((s) => tintOver(out, s))]
      : surfaces
    if (Math.min(...sets.map((s) => contrast(out, s))) >= target + MARGIN)
      return out
    l += dir * 0.002
    out = fromOklch(l, C, h)
  }
  throw new Error(`no ink found for ${hex}`)
}
/** Smallest alpha (steps of 0.01) of `rgb` over every surface that keeps `target`. */
function hairline(
  rgb: [number, number, number],
  surfaces: string[],
  target: number,
): string {
  for (let a = 0.05; a <= 1; a += 0.01) {
    const c = `rgba(${rgb.join(", ")}, ${a.toFixed(2)})`
    if (Math.min(...surfaces.map((s) => contrast(c, s))) >= target + MARGIN)
      return c
  }
  throw new Error("no hairline")
}
const ORANGE = prim.orange?.$value as string
const TEAL = prim["signal-teal"]?.$value as string
const RED_HUE = "#e34948"
const AMBER_HUE = "#eda100"

// New semantic tokens the report needs in BOTH themes (the brand has no link, status or control-border token).
Object.assign(dark, {
  link: ORANGE,
  "link-hover": val("action-primary-hover"),
  "status-go": TEAL,
  "status-stop": fromOklch(0.72, oklch(RED_HUE).C, oklch(RED_HUE).h),
  "status-proxy": fromOklch(0.8, oklch(AMBER_HUE).C, oklch(AMBER_HUE).h),
  "border-control": hairline([247, 248, 250], darkSurfaces, T_LARGE),
  "viz-recommended": ORANGE,
})
const link = ink(ORANGE, lightSurfaces, T_TEXT, -1)
Object.assign(light, {
  link,
  "link-hover": fromOklch(
    Math.max(oklch(link).L - 0.05, 0.3),
    oklch(link).C,
    oklch(link).h,
  ),
  "accent-secondary": ink(TEAL, lightSurfaces, T_TEXT, -1),
  "focus-ring": ink(TEAL, lightSurfaces, T_LARGE, -1),
  "status-go": ink(TEAL, lightSurfaces, T_TEXT, -1, true),
  "status-stop": ink(RED_HUE, lightSurfaces, T_TEXT, -1, true),
  "status-proxy": ink(AMBER_HUE, lightSurfaces, T_TEXT, -1, true),
  "border-control": hairline([11, 16, 32], lightSurfaces, T_LARGE),
  "viz-recommended": ink(ORANGE, lightSurfaces, T_LARGE, -1),
})

// 4. the pair table: every foreground token on every surface it is allowed on.
type Kind = "text" | "large" | "graphic"
type Pair = { fg: string; bg: string; kind: Kind }
const pairs: Pair[] = []
const on = (fg: string, bgs: readonly string[], kind: Kind) => {
  for (const bg of bgs) pairs.push({ fg, bg, kind })
}
on("text-primary", SURF, "text")
on("text-muted", SURF, "text")
on("link", SURF, "text")
on("link-hover", ["surface-base", "surface-card", "surface-elevated"], "text")
on("accent-secondary", SURF, "text")
for (const s of ["status-go", "status-stop", "status-proxy"])
  on(s, SURF, "text")
on(
  "action-label",
  ["action-primary", "action-primary-hover", "accent-orange-light"],
  "text",
)
on("focus-ring", SURF, "graphic")
on("border-control", SURF, "graphic")
on("viz-recommended", SURF, "graphic")

type Row = {
  theme: "dark" | "light"
  fg: string
  bg: string
  kind: Kind
  fgHex: string
  bgHex: string
  ratio: number
  needed: number
  pass: boolean
}
const rows: Row[] = []
for (const [theme, tokens] of [
  ["dark", dark],
  ["light", light],
] as const) {
  for (const p of pairs) {
    const bgHex = resolveSurface(tokens, p.bg)
    const fgHex = blend(tokens[p.fg] as string, bgHex)
    const ratio = contrast(tokens[p.fg] as string, bgHex)
    const needed = p.kind === "text" ? T_TEXT : T_LARGE
    rows.push({
      theme,
      fg: p.fg,
      bg: p.bg,
      kind: p.kind,
      fgHex,
      bgHex,
      ratio: Math.round(ratio * 100) / 100,
      needed,
      pass: ratio >= needed,
    })
  }
}
// Badge text on its own tint (a tone at 14% over the surface it sits on).
for (const [theme, tokens] of [
  ["dark", dark],
  ["light", light],
] as const) {
  for (const s of ["status-go", "status-stop", "status-proxy"]) {
    for (const surf of ["surface-base", "surface-card"]) {
      const base = resolveSurface(tokens, surf)
      const bgHex = tintOver(blend(tokens[s] as string, base), base)
      const ratio = contrast(tokens[s] as string, bgHex)
      rows.push({
        theme,
        fg: s,
        bg: `${s}@14%/${surf}`,
        kind: "text",
        fgHex: tokens[s] as string,
        bgHex,
        ratio: Math.round(ratio * 100) / 100,
        needed: T_TEXT,
        pass: ratio >= T_TEXT,
      })
    }
  }
}
const failed = rows.filter((r) => !r.pass)
for (const r of failed)
  console.log(
    `     below threshold: ${r.theme} ${r.fg} on ${r.bg} = ${r.ratio} (needs ${r.needed})`,
  )
expect(
  failed.length === 0,
  `all ${rows.length} pairs meet 4.5 (text) or 3 (graphics) in both themes`,
)
expect(
  rows.filter((r) => r.theme === "dark").length ===
    rows.filter((r) => r.theme === "light").length,
  "both themes carry the same pair list",
)

// 5. the instrument can fail: the brand orange used as light-theme text must be below 4.5, and the light derivation must have moved it.
const naive = contrast(ORANGE, resolveSurface(light, "surface-base"))
expect(
  naive < T_TEXT,
  `negative control: brand orange as text on the light surface is ${naive.toFixed(2)} (< 4.5), so the derived link ink is needed`,
)
expect(
  contrast(light.link as string, resolveSurface(light, "surface-base")) >=
    T_TEXT,
  "light link ink clears 4.5 on the base surface",
)
const hueDrift = Math.abs(oklch(light.link as string).h - oklch(ORANGE).h)
expect(
  hueDrift < 5,
  `derived link ink keeps the brand orange hue (drift ${hueDrift.toFixed(1)} degrees)`,
)
const tealDrift = Math.abs(
  oklch(light["accent-secondary"] as string).h - oklch(TEAL).h,
)
expect(
  tealDrift < 5,
  `derived teal ink keeps the brand teal hue (drift ${tealDrift.toFixed(1)} degrees)`,
)

const summary = (theme: Record<string, string>) =>
  Object.fromEntries(Object.entries(theme))
writeFileSync(
  join(HERE, "q3-contrast.json"),
  `${JSON.stringify({ thresholds: { text: T_TEXT, large: T_LARGE }, derivation: { hue_preserving: true, margin: MARGIN, note: "Inks are the brand hue and chroma with lightness moved only as far as contrast requires." }, tokens: { dark: summary(dark), light: summary(light) }, new_tokens: ["link", "link-hover", "status-go", "status-stop", "status-proxy", "border-control", "viz-recommended", "light:accent-secondary", "light:focus-ring"], pairs: rows }, null, 2)}\n`,
)
console.log(
  "derived light inks:",
  JSON.stringify({
    link: light.link,
    "link-hover": light["link-hover"],
    teal: light["accent-secondary"],
    focus: light["focus-ring"],
    go: light["status-go"],
    stop: light["status-stop"],
    proxy: light["status-proxy"],
    border: light["border-control"],
    viz: light["viz-recommended"],
  }),
)
console.log(
  "dark new tokens:",
  JSON.stringify({
    stop: dark["status-stop"],
    proxy: dark["status-proxy"],
    border: dark["border-control"],
  }),
)
process.exit(fails.length ? 1 : 0)

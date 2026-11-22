// Theme values on top of the Torviello contract. The brand is dark-only, so: dark = the contract's semantic values exactly
// as shipped plus the extra tokens below; light is derived (Task 1 spike Q3, docs/spikes/plan-06/q3-contrast.json) and is
// BLOCKED-13 until the brand owner approves it. This file and tokens.ts are the only places under src/web/design that may hold a
// colour literal (FR-5, tested). Every pair below is contrast-gated (H4, F3).
export type ThemeName = "dark" | "light"
export type Themes = {
  /** Tokens added to the contract's dark theme (the brand has no link, status, control-border or chart tokens). */
  dark: Readonly<Record<string, string>>
  /** The complete light theme: every contract semantic token and every dark extra. */
  light: Readonly<Record<string, string>>
  /** Theme-independent non-colour tokens (tap target, focus ring geometry, hairline, pill radius). */
  shared: Readonly<Record<string, string>>
}

export const T_CONTRAST_TEXT = 4.5
export const T_CONTRAST_LARGE = 3

const DARK_EXTRA = {
  link: "#ff683b",
  "link-hover": "#ff855f",
  "status-go": "#22d3c5",
  "status-stop": "#ff726b",
  "status-proxy": "#f9ac22",
  "border-control": "rgba(247, 248, 250, 0.36)",
  "viz-recommended": "#ff683b",
  // data visualisation (Q4): six categorical colours in one fixed order (the first three are the all-pairs-safe set),
  // the aluminium baseline, a sequential scale and a diverging scale
  "viz-1": "#0ca30c",
  "viz-2": "#d55181",
  "viz-3": "#3987e5",
  "viz-4": "#c98500",
  "viz-5": "#199e70",
  "viz-6": "#9085e9",
  "viz-baseline": "#b0b6c3",
  "viz-seq-1": "#295894",
  "viz-seq-2": "#386db0",
  "viz-seq-3": "#4781cc",
  "viz-seq-4": "#5797e9",
  "viz-seq-5": "#71adfb",
  "viz-seq-6": "#97c4ff",
  "viz-seq-7": "#bedaff",
  "viz-div-1": "#71adfb",
  "viz-div-2": "#4781cc",
  "viz-div-3": "#1c579e",
  "viz-div-4": "#32353c",
  "viz-div-5": "#963212",
  "viz-div-6": "#c55d3f",
  "viz-div-7": "#f58869",
} as const

const LIGHT = {
  "surface-base": "#f7f8fa",
  "surface-canvas": "#edf0f5",
  "surface-elevated": "#ffffff",
  "surface-card": "#ffffff",
  "surface-glass": "rgba(11, 16, 32, 0.04)",
  "surface-raised": "rgba(11, 16, 32, 0.07)",
  "border-glass": "rgba(11, 16, 32, 0.14)",
  "border-panel": "rgba(11, 16, 32, 0.10)",
  "border-panel-strong": "rgba(11, 16, 32, 0.18)",
  "text-primary": "#0b1020",
  "text-muted": "rgba(11, 16, 32, 0.72)",
  "action-primary": "#ff683b",
  "action-primary-hover": "#ff855f",
  "action-label": "#0b1020",
  "accent-orange-light": "#ff8a5b",
  "accent-orange-dark": "#d94824",
  "glow-orange": "rgba(255, 104, 59, 0.32)",
  link: "#be3701",
  "link-hover": "#a62f01",
  "accent-secondary": "#01746c",
  "focus-ring": "#049389",
  "status-go": "#02665f",
  "status-stop": "#b10a1e",
  "status-proxy": "#7b5201",
  "border-control": "rgba(11, 16, 32, 0.47)",
  "viz-recommended": "#e65121",
  "viz-1": "#008300",
  "viz-2": "#c95f89",
  "viz-3": "#2a78d6",
  "viz-4": "#b17702",
  "viz-5": "#019465",
  "viz-6": "#6250d6",
  "viz-baseline": "#5e636f",
  "viz-seq-1": "#74a6e7",
  "viz-seq-2": "#5b91d7",
  "viz-seq-3": "#427cc7",
  "viz-seq-4": "#2868b6",
  "viz-seq-5": "#1a559c",
  "viz-seq-6": "#0a4382",
  "viz-seq-7": "#003167",
  "viz-div-1": "#2963ab",
  "viz-div-2": "#538ed9",
  "viz-div-3": "#86baff",
  "viz-div-4": "#e2e5ea",
  "viz-div-5": "#ff987a",
  "viz-div-6": "#d2694b",
  "viz-div-7": "#a33f20",
} as const

const SHARED = {
  "target-min": "44px",
  "ring-width": "2px",
  "ring-offset": "2px",
  hairline: "1px",
  "radius-pill": "999px",
  "icon-size": "20px",
  "mark-size": "32px",
  "motion-fast": "120ms",
  "motion-base": "240ms",
  nudge: "2px",
} as const

export const THEMES = {
  dark: DARK_EXTRA,
  light: LIGHT,
  shared: SHARED,
} satisfies Themes

/** Every token name the themes add (without the contract's own). */
export type ExtraTokenName =
  | keyof typeof DARK_EXTRA
  | keyof typeof LIGHT
  | keyof typeof SHARED

// ---- contrast (WCAG 2.x) -------------------------------------------------------------------------------------------------

type Rgba = readonly [number, number, number, number]

function parseColour(c: string): Rgba {
  const s = c.trim()
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s)
  if (hex) {
    const v = hex[1] as string
    const a = hex[2] ? Number.parseInt(hex[2], 16) / 255 : 1
    return [
      Number.parseInt(v.slice(0, 2), 16) / 255,
      Number.parseInt(v.slice(2, 4), 16) / 255,
      Number.parseInt(v.slice(4, 6), 16) / 255,
      a,
    ]
  }
  const m =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      s,
    )
  if (m)
    return [
      Number(m[1]) / 255,
      Number(m[2]) / 255,
      Number(m[3]) / 255,
      m[4] === undefined ? 1 : Number(m[4]),
    ]
  throw new Error("design: unparseable colour")
}

const toLinear = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4

/** Relative luminance of an opaque colour. */
function luminance(rgb: Rgba): number {
  return (
    0.2126 * toLinear(rgb[0]) +
    0.7152 * toLinear(rgb[1]) +
    0.0722 * toLinear(rgb[2])
  )
}

/** `fg` (alpha allowed) composited over the opaque `bg`; opaque result as 0..1 channels. */
function over(fg: string, bg: string): Rgba {
  const [r, g, b, a] = parseColour(fg)
  const [br, bgc, bb, ba] = parseColour(bg)
  if (ba < 1) throw new Error("design: the background must be opaque")
  return [r * a + br * (1 - a), g * a + bgc * (1 - a), b * a + bb * (1 - a), 1]
}

const toHex = (c: Rgba) =>
  `#${[c[0], c[1], c[2]]
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`

/** WCAG 2.x contrast ratio of `fg` on `bg`; a translucent `fg` is blended over `bg` first, `bg` must be opaque. */
export function contrastRatio(fg: string, bg: string): number {
  // a browser paints 8-bit channels: round the blended foreground the same way
  const l1 = luminance(parseColour(toHex(over(fg, bg))))
  const l2 = luminance(parseColour(bg))
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1]
  return (hi + 0.05) / (lo + 0.05)
}

// ---- the pair table (H4) ------------------------------------------------------------------------------------------------

export type PairKind = "text" | "large" | "graphic"
export type TokenPair = {
  fg: string
  /** A surface token, or `<tone>@14%/<surface>`: the tone's 14 % tint over a surface (a badge background). */
  bg: string
  kind: PairKind
  theme: ThemeName
}

const SURFACES = [
  "surface-base",
  "surface-glass",
  "surface-raised",
  "surface-canvas",
  "surface-elevated",
  "surface-card",
] as const
const TINT_SURFACES = ["surface-base", "surface-card"] as const
// scenario and nominal badges are outlined, not tinted: teal ink on its own tint is 4.35 in the light theme (below 4.5)
const TINTED_TONES = ["status-go", "status-stop", "status-proxy"] as const

function pairsFor(theme: ThemeName): TokenPair[] {
  const out: TokenPair[] = []
  const on = (fg: string, bgs: readonly string[], kind: PairKind) => {
    for (const bg of bgs) out.push({ fg, bg, kind, theme })
  }
  on("text-primary", SURFACES, "text")
  on("text-muted", SURFACES, "text")
  on("link", SURFACES, "text")
  on("link-hover", ["surface-base", "surface-card", "surface-elevated"], "text")
  on("accent-secondary", SURFACES, "text")
  for (const s of ["status-go", "status-stop", "status-proxy"])
    on(s, SURFACES, "text")
  on(
    "action-label",
    ["action-primary", "action-primary-hover", "accent-orange-light"],
    "text",
  )
  on("focus-ring", SURFACES, "graphic")
  on("border-control", SURFACES, "graphic")
  on("viz-recommended", SURFACES, "graphic")
  // badge text on its own tint
  for (const tone of TINTED_TONES)
    on(
      tone,
      TINT_SURFACES.map((s) => `${tone}@14%/${s}`),
      "text",
    )
  return out
}

export const TOKEN_PAIRS: readonly TokenPair[] = [
  ...pairsFor("dark"),
  ...pairsFor("light"),
]

/** 14 % (0x24 / 255): the badge tint. */
const TINT_ALPHA = 0x24 / 255

/** An opaque colour for a background token: a translucent surface is blended over `surface-base`, a tint over its surface. */
export function resolveOpaque(
  tokens: Readonly<Record<string, string>>,
  name: string,
): string {
  const tok = (k: string) => {
    const v = tokens[k]
    if (v === undefined) throw new Error(`design: token missing: ${k}`)
    return v
  }
  const base = tok("surface-base")
  const tint = /^([a-z-]+)@14%\/([a-z-]+)$/.exec(name)
  if (tint) {
    const surface = toHex(over(tok(tint[2] as string), base))
    const tone = toHex(over(tok(tint[1] as string), surface))
    const [r, g, b] = parseColour(tone)
    return toHex(
      over(`rgba(${r * 255}, ${g * 255}, ${b * 255}, ${TINT_ALPHA})`, surface),
    )
  }
  return toHex(over(tok(name), base))
}

export type PairRow = TokenPair & { ratio: number; needed: number }

/** Every pair of TOKEN_PAIRS with its ratio, for tokens already resolved per theme (see tokens.ts `resolveTheme`). */
export function evaluatePairs(
  resolved: Readonly<Record<ThemeName, Readonly<Record<string, string>>>>,
): PairRow[] {
  return TOKEN_PAIRS.map((p) => {
    const tokens = resolved[p.theme]
    const bg = resolveOpaque(tokens, p.bg)
    const fg = tokens[p.fg]
    if (fg === undefined) throw new Error(`design: token missing: ${p.fg}`)
    return {
      ...p,
      ratio: contrastRatio(fg, bg),
      needed: p.kind === "text" ? T_CONTRAST_TEXT : T_CONTRAST_LARGE,
    }
  })
}

// Colour maths for the plan 06 spike. Own implementation (WCAG 2.x, OKLab, Machado 2009 CVD), no shared code with
// the dataviz skill's validator; the spike cross-checks the two on published figures.
export type Rgb = [number, number, number] // 0..1 sRGB
export type Rgba = [number, number, number, number]

export function parse(c: string): Rgba {
  const s = c.trim()
  let m = /^#([0-9a-f]{6})$/i.exec(s)
  if (m) {
    const v = m[1] as string
    return [0, 2, 4]
      .map((i) => Number.parseInt(v.slice(i, i + 2), 16) / 255)
      .concat(1) as Rgba
  }
  m = /^#([0-9a-f]{8})$/i.exec(s)
  if (m) {
    const v = m[1] as string
    return [0, 2, 4, 6].map(
      (i) => Number.parseInt(v.slice(i, i + 2), 16) / 255,
    ) as Rgba
  }
  const r =
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(
      s,
    )
  if (r)
    return [
      Number(r[1]) / 255,
      Number(r[2]) / 255,
      Number(r[3]) / 255,
      r[4] === undefined ? 1 : Number(r[4]),
    ]
  throw new Error(`unparseable colour: ${c}`)
}
export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((v) =>
      Math.round(Math.min(1, Math.max(0, v)) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`
}
/** Alpha-blend fg over an opaque bg; result opaque. */
export function blend(fg: string, bg: string): string {
  const [r, g, b, a] = parse(fg)
  const [br, bg_, bb] = parse(bg)
  return toHex([
    r * a + br * (1 - a),
    g * a + bg_ * (1 - a),
    b * a + bb * (1 - a),
  ])
}
const s2l = (c: number) =>
  c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
const l2s = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055
export function luminance(hex: string): number {
  const [r, g, b] = parse(hex)
  return 0.2126 * s2l(r) + 0.7152 * s2l(g) + 0.0722 * s2l(b)
}
/** WCAG 2.x contrast; fg with alpha is blended over bg first. bg must be opaque (pre-blend a translucent surface). */
export function contrast(fg: string, bg: string): number {
  const f = blend(fg, bg)
  const [hi, lo] = [luminance(f), luminance(bg)].sort((x, y) => y - x) as [
    number,
    number,
  ]
  return (hi + 0.05) / (lo + 0.05)
}
type V3 = [number, number, number]
export function oklab(hex: string): V3 {
  const [r, g, b] = parse(hex).slice(0, 3).map(s2l) as V3
  return linToOklab([r, g, b])
}
function linToOklab([r, g, b]: V3): V3 {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
export function oklabToHex([L, a, b]: V3): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s
  const g = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s
  const bl = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  return toHex([l2s(r), l2s(g), l2s(bl)])
}
export const oklch = (hex: string): { L: number; C: number; h: number } => {
  const [L, a, b] = oklab(hex)
  return {
    L,
    C: Math.hypot(a, b),
    h: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360,
  }
}
function inGamut([L, a, b]: V3): boolean {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  const v = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ]
  return v.every((x) => x >= -1e-6 && x <= 1 + 1e-6)
}
/** OKLCH to hex, reducing chroma until in sRGB gamut. */
export function fromOklch(L: number, C: number, hDeg: number): string {
  const h = (hDeg * Math.PI) / 180
  let c = C
  while (c > 0 && !inGamut([L, c * Math.cos(h), c * Math.sin(h)])) c -= 0.001
  return oklabToHex([
    L,
    Math.max(c, 0) * Math.cos(h),
    Math.max(c, 0) * Math.sin(h),
  ])
}
const MACHADO = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const
export type Cvd = keyof typeof MACHADO
export const CVDS: Cvd[] = ["protan", "deutan", "tritan"]
function simulateLin(hex: string, kind: Cvd): V3 {
  const lin = parse(hex).slice(0, 3).map(s2l) as V3
  const M = MACHADO[kind]
  return M.map((row) =>
    Math.min(
      1,
      Math.max(0, row[0] * lin[0] + row[1] * lin[1] + row[2] * lin[2]),
    ),
  ) as V3
}
/** Simulated colour as hex (8-bit rounded; for display and contrast, not for distances). */
export function simulate(hex: string, kind: Cvd): string {
  return toHex(simulateLin(hex, kind).map(l2s) as Rgb)
}
const dist = (x: V3, y: V3) =>
  100 * Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2])
/** OKLab distance x100, unsimulated. */
export function deltaE(a: string, b: string): number {
  return dist(oklab(a), oklab(b))
}
/** OKLab distance x100 under a simulated deficiency (float pipeline, no 8-bit rounding in between). */
export const deltaEcvd = (a: string, b: string, k: Cvd) =>
  dist(linToOklab(simulateLin(a, k)), linToOklab(simulateLin(b, k)))
/** min over protan and deutan (tritan reported separately, as the dataviz method does). */
export const deltaEpd = (a: string, b: string) =>
  Math.min(deltaEcvd(a, b, "protan"), deltaEcvd(a, b, "deutan"))

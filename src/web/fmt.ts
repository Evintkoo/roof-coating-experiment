/** D11: the one number formatter of the report. Infinity is "never gels" (gel time of a sol that does not gel), NaN is "not evaluated". */
export function fmtValue(x: number, digits = 3): string {
  if (x === Number.POSITIVE_INFINITY) return "never gels"
  if (!Number.isFinite(x)) return "not evaluated"
  return x.toFixed(digits)
}

function channel(v: number): number {
  const s = v / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

function rgbOf(hex: string): [number, number, number] {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim())
  if (!m) throw new RangeError(`not a #rrggbb colour: ${hex}`)
  const n = Number.parseInt(m[1] as string, 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** WCAG 2.x relative luminance of a #rrggbb colour. */
export function luminance(hex: string): number {
  const [r, g, b] = rgbOf(hex)
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** WCAG contrast ratio (L1 + 0.05) / (L2 + 0.05), lighter over darker: 1 for equal colours, 21 for black on white. */
export function contrastRatio(fgHex: string, bgHex: string): number {
  const a = luminance(fgHex)
  const b = luminance(bgHex)
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
}

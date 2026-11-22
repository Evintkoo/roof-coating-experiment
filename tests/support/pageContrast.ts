// The computed text contrast of every text-bearing element under a root, in the real page: the foreground and every ancestor
// background are read from Chrome's computed styles (alpha and color-mix composited), then WCAG 2.x. Used by the atom and the
// component suites (proof tier).
import type { Page } from "playwright"

export type ContrastRow = {
  key: string
  ratio: number
  /** A gradient sits behind the text: its contrast is covered by the token pair table, not this check. */
  gradient: boolean
  /** Inside a disabled control (exempt from WCAG contrast). */
  exempt: boolean
  text: string
}
type Row = ContrastRow

export async function textContrast(
  page: Page,
  root: string,
): Promise<ContrastRow[]> {
  return page.evaluate((root) => {
    type Rgba = [number, number, number, number]
    const parse = (c: string): Rgba => {
      // Chrome reports color-mix() as `color(srgb r g b / a)` with 0..1 channels, everything else as rgb()/rgba()
      const cs = /^color\(srgb ([^)]+)\)$/.exec(c)
      if (cs) {
        const v = (cs[1] ?? "").split(/[ /]+/).filter(Boolean).map(Number)
        return [
          (v[0] ?? 0) * 255,
          (v[1] ?? 0) * 255,
          (v[2] ?? 0) * 255,
          v[3] ?? 1,
        ]
      }
      const m = /^rgba?\(([^)]+)\)$/.exec(c)
      if (!m) throw new Error(`unparsed colour ${c}`)
      const v = (m[1] ?? "")
        .split(/[ ,/]+/)
        .filter(Boolean)
        .map(Number)
      return [v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1]
    }
    const over = (f: Rgba, b: Rgba): Rgba => [
      f[0] * f[3] + b[0] * (1 - f[3]),
      f[1] * f[3] + b[1] * (1 - f[3]),
      f[2] * f[3] + b[2] * (1 - f[3]),
      1,
    ]
    const lin = (x: number) => {
      const c = x / 255
      return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
    }
    const lum = (c: Rgba) =>
      0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2])
    const rows: Row[] = []
    for (const el of document.querySelectorAll(`${root} *`)) {
      const own = [...el.childNodes].some(
        (n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "",
      )
      if (!own) continue
      let bg: Rgba = [255, 255, 255, 1]
      const chain: Element[] = []
      for (let e: Element | null = el; e; e = e.parentElement) chain.unshift(e)
      let gradient = false
      for (const e of chain) {
        const s = getComputedStyle(e)
        if (s.backgroundImage !== "none") gradient = true
        bg = over(parse(s.backgroundColor), bg)
      }
      const fg = over(parse(getComputedStyle(el).color), bg)
      const [hi, lo] = [lum(fg), lum(bg)].sort((a, b) => b - a) as [
        number,
        number,
      ]
      const cell = el.closest("[data-atom]")
      rows.push({
        key: `${cell?.getAttribute("data-atom")}/${cell?.getAttribute("data-state")}`,
        ratio: (hi + 0.05) / (lo + 0.05),
        gradient,
        exempt: el.closest('[disabled], [data-state="disabled"]') !== null,
        text: (el.textContent ?? "").trim().slice(0, 40),
      })
    }
    return rows
  }, root)
}

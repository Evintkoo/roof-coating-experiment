// @font-face rules from embedded base64 woff2. The caller (src/node/report/design.ts) reads the files and supplies the
// family names, so this module holds no font name and does no I/O.
export type FontData = {
  family: string
  weight: number
  base64: string
}

const B64 = /^[A-Za-z0-9+/]+={0,2}$/
const FAMILY = /^[A-Za-z0-9 _-]+$/

export function fontFaceCss(fonts: readonly FontData[]): string {
  return fonts
    .map((f) => {
      if (!B64.test(f.base64))
        throw new Error("design: font data is not base64")
      if (!FAMILY.test(f.family))
        throw new Error("design: bad font family name")
      return `@font-face{font-family:"${f.family}";font-style:normal;font-weight:${Math.trunc(f.weight)};font-display:swap;src:url(data:font/woff2;base64,${f.base64}) format("woff2")}`
    })
    .join("\n")
}

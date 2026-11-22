// Plan 06 spike Q4: data-visualisation palette (categorical, sequential, diverging) validated on both plot backgrounds
// with simulated protan/deutan/tritan vision. Method: the dataviz skill's six checks, own implementation in lib/colour.ts.
// Run: bun docs/spikes/plan-06/q4_palette.ts   (exit 0 only when every expectation holds; writes q4-palette.json)
import { readFileSync, writeFileSync } from "node:fs"
import { dirname, join } from "node:path"
import {
  blend,
  CVDS,
  contrast,
  deltaE,
  deltaEcvd,
  deltaEpd,
  fromOklch,
  oklch,
  simulate,
} from "./lib/colour"

const HERE = dirname(new URL(import.meta.url).pathname)
const q3 = JSON.parse(readFileSync(join(HERE, "q3-contrast.json"), "utf8")) as {
  tokens: Record<"dark" | "light", Record<string, string>>
}

const fails: string[] = []
const expect = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`)
  if (!cond) fails.push(msg)
}
type Theme = "dark" | "light"
const THEMES: Theme[] = ["light", "dark"]
const SURF = [
  "surface-base",
  "surface-glass",
  "surface-raised",
  "surface-canvas",
  "surface-elevated",
  "surface-card",
]
const surfaces = (t: Theme) =>
  SURF.map((k) =>
    blend(q3.tokens[t][k] as string, q3.tokens[t]["surface-base"] as string),
  )
// The two plot backgrounds a figure sits on: the page surface and the card surface (paper colour of a Plotly figure).
const PLOT_BG: Record<Theme, string[]> = {
  light: [
    q3.tokens.light["surface-base"] as string,
    q3.tokens.light["surface-card"] as string,
  ],
  dark: [
    q3.tokens.dark["surface-base"] as string,
    q3.tokens.dark["surface-elevated"] as string,
  ],
}
const BAND: Record<Theme, [number, number]> = {
  light: [0.43, 0.77],
  dark: [0.48, 0.67],
}
const CVD_TARGET = 8
const NORMAL_FLOOR = 15
const GRAPHIC = 3

// 0. instrument check against the dataviz skill's published figures for its reference palette (worst adjacent pairs).
const REF = {
  light: [
    "#2a78d6",
    "#eb6834",
    "#1baf7a",
    "#eda100",
    "#e87ba4",
    "#008300",
    "#6250d6",
    "#e34948",
  ],
  dark: [
    "#3987e5",
    "#d95926",
    "#199e70",
    "#c98500",
    "#d55181",
    "#0ca30c",
    "#9085e9",
    "#e66767",
  ],
}
for (const [t, want] of [
  ["light", [9.1, 19.6]],
  ["dark", [8.4, 19.3]],
] as const) {
  const p = REF[t]
  let cvd = 99
  let nv = 99
  for (let i = 0; i < 7; i++) {
    cvd = Math.min(cvd, deltaEpd(p[i] as string, p[i + 1] as string))
    nv = Math.min(nv, deltaE(p[i] as string, p[i + 1] as string))
  }
  expect(
    Math.abs(cvd - want[0]) <= 0.05 && Math.abs(nv - want[1]) <= 0.05,
    `instrument: skill reference palette ${t} worst adjacent CVD ${cvd.toFixed(2)} / normal ${nv.toFixed(2)} (published ${want[0]} / ${want[1]})`,
  )
}

// 1. categorical: six hues (the brand orange is reserved for the recommended recipe, so no orange slot), each stepped
//    in its own hue until it clears 3:1 on every surface, in one fixed order shared by both themes.
const HUES: Record<string, Record<Theme, string>> = {
  green: { light: "#008300", dark: "#0ca30c" },
  magenta: { light: "#e87ba4", dark: "#d55181" },
  blue: { light: "#2a78d6", dark: "#3987e5" },
  yellow: { light: "#eda100", dark: "#c98500" },
  aqua: { light: "#1baf7a", dark: "#199e70" },
  violet: { light: "#6250d6", dark: "#9085e9" },
}
// Red is left out on purpose: it sits 4 to 6 units from the brand orange (the recommended-recipe accent) and is the
// reserved status-stop hue. Seven colours were tried first; the red fails the accent-distance gate in both themes.
const ORDER = ["green", "magenta", "blue", "yellow", "aqua", "violet"]
function fit(hex: string, theme: Theme): string {
  const { L, C, h } = oklch(hex)
  const ss = surfaces(theme)
  let l = L
  let out = hex
  for (
    let i = 0;
    i < 300 && Math.min(...ss.map((s) => contrast(out, s))) < GRAPHIC + 0.1;
    i++
  ) {
    l += theme === "dark" ? 0.005 : -0.005
    out = fromOklch(l, C, h)
  }
  return out
}
const categorical: Record<Theme, string[]> = { light: [], dark: [] }
for (const t of THEMES)
  categorical[t] = ORDER.map((n) =>
    fit((HUES[n] as Record<Theme, string>)[t], t),
  )

const report: Record<string, unknown> = {}
const recommended = Object.fromEntries(
  THEMES.map((t) => [t, q3.tokens[t]["viz-recommended"] as string]),
) as Record<Theme, string>
for (const t of THEMES) {
  const p = categorical[t]
  const ss = surfaces(t)
  const [lo, hi] = BAND[t]
  expect(
    p.length >= 6,
    `${t}: ${p.length} categorical colours (at least 6 required)`,
  )
  expect(
    p.every((c) => oklch(c).L >= lo && oklch(c).L <= hi),
    `${t}: every colour inside the lightness band ${lo} to ${hi}`,
  )
  expect(
    p.every((c) => oklch(c).C >= 0.1),
    `${t}: every colour above the chroma floor 0.10`,
  )
  const minContrast = Math.min(
    ...p.flatMap((c) => ss.map((s) => contrast(c, s))),
  )
  expect(
    minContrast >= GRAPHIC,
    `${t}: lowest contrast against any of the ${ss.length} surfaces is ${minContrast.toFixed(2)} (needs ${GRAPHIC})`,
  )
  let cvd = 99
  let nv = 99
  for (let i = 0; i < p.length - 1; i++) {
    cvd = Math.min(
      cvd,
      deltaEpd(p[i] as string, p[i + 1] as string),
      deltaEcvd(p[i] as string, p[i + 1] as string, "tritan"),
    )
    nv = Math.min(nv, deltaE(p[i] as string, p[i + 1] as string))
  }
  expect(
    cvd >= CVD_TARGET,
    `${t}: worst adjacent distance under protan, deutan and tritan simulation ${cvd.toFixed(2)} (target ${CVD_TARGET})`,
  )
  expect(
    nv >= NORMAL_FLOOR,
    `${t}: worst adjacent distance in normal vision ${nv.toFixed(2)} (floor ${NORMAL_FLOOR})`,
  )
  // all-pairs cap: the largest k such that the first k slots clear CVD 6 and normal 15 on every pair
  let cap = 1
  let capMin = { cvd: 99, nv: 99 }
  for (let k = 2; k <= p.length; k++) {
    let c2 = 99
    let n2 = 99
    for (let i = 0; i < k; i++)
      for (let j = i + 1; j < k; j++) {
        c2 = Math.min(c2, deltaEpd(p[i] as string, p[j] as string))
        n2 = Math.min(n2, deltaE(p[i] as string, p[j] as string))
      }
    if (c2 >= 6 && n2 >= NORMAL_FLOOR) {
      cap = k
      capMin = { cvd: c2, nv: n2 }
    } else break
  }
  expect(
    cap >= 3,
    `${t}: first ${cap} slots validate all-pairs (scatter, small multiples cap); worst pair CVD ${capMin.cvd.toFixed(2)}, normal ${capMin.nv.toFixed(2)}`,
  )
  let allCvd = 99
  let allNv = 99
  for (let i = 0; i < p.length; i++)
    for (let j = i + 1; j < p.length; j++) {
      allCvd = Math.min(allCvd, deltaEpd(p[i] as string, p[j] as string))
      allNv = Math.min(allNv, deltaE(p[i] as string, p[j] as string))
    }
  // recommended accent and neutral baseline: the role colours must be told apart from every series colour.
  let bestGray = ""
  let bestMin = -1
  // mid-grey range only: the aluminium baseline must read as a quiet reference, not as text ink
  for (
    let l = t === "light" ? 0.5 : 0.62;
    l <= (t === "light" ? 0.64 : 0.78);
    l += 0.005
  ) {
    const g = fromOklch(l, 0.02, 265)
    if (Math.min(...ss.map((s) => contrast(g, s))) < GRAPHIC + 0.1) continue
    const m = Math.min(...[...p, recommended[t]].map((c) => deltaE(g, c)))
    if (m > bestMin) {
      bestMin = m
      bestGray = g
    }
  }
  const roleMin = Math.min(...p.map((c) => deltaE(recommended[t], c)))
  const roleCvd = Math.min(...p.map((c) => deltaEpd(recommended[t], c)))
  expect(
    Math.min(...ss.map((s) => contrast(recommended[t], s))) >= GRAPHIC,
    `${t}: recommended accent ${recommended[t]} clears 3:1 on every surface`,
  )
  expect(
    roleMin >= 10,
    `${t}: recommended accent is at least 10 (OKLab x100) from every series colour, nearest ${roleMin.toFixed(1)} (CVD ${roleCvd.toFixed(1)})`,
  )
  expect(
    bestMin >= 10,
    `${t}: neutral aluminium baseline ${bestGray} is at least 10 from every series colour and the accent (${bestMin.toFixed(1)}) and clears 3:1`,
  )
  report[t] = {
    categorical: p,
    order: ORDER,
    recommended: recommended[t],
    baseline: bestGray,
    worst_adjacent_cvd: +cvd.toFixed(2),
    worst_adjacent_normal: +nv.toFixed(2),
    all_pairs_cap_slots: cap,
    all_pairs_cap_worst: {
      cvd: +capMin.cvd.toFixed(2),
      normal: +capMin.nv.toFixed(2),
    },
    min_pairwise_all_slots: {
      cvd: +allCvd.toFixed(2),
      normal: +allNv.toFixed(2),
    },
    min_contrast_vs_surfaces: +minContrast.toFixed(2),
    plot_backgrounds: PLOT_BG[t],
  }
}

// 2. sequential: one hue (blue), seven steps, lightness strictly monotone with room to spare, monotone and separated under CVD.
const BLUE_H = oklch("#2a78d6").h
const seq: Record<Theme, string[]> = { light: [], dark: [] }
for (const t of THEMES) {
  const ss = surfaces(t)
  // low end: the step nearest the surface that still clears 2:1 on every surface (ordinal floor); high end: the strongest.
  let a = t === "light" ? 0.76 : 0.4
  while (
    Math.min(...ss.map((x) => contrast(fromOklch(a, 0.12, BLUE_H), x))) < 2.05
  )
    a += t === "light" ? -0.005 : 0.005
  const b = t === "light" ? 0.32 : 0.88
  for (let i = 0; i < 7; i++)
    seq[t].push(
      fromOklch(
        a + ((b - a) * i) / 6,
        0.14 - (0.03 * Math.abs(i - 3)) / 3,
        BLUE_H,
      ),
    )
}
const diverging: Record<
  Theme,
  { blue: string[]; mid: string; orange: string[]; ramp: string[] }
> = { light: null as never, dark: null as never }
const ORANGE_H = oklch("#ff683b").h
for (const t of THEMES) {
  const mid =
    t === "light" ? fromOklch(0.92, 0.008, 265) : fromOklch(0.33, 0.012, 265)
  const Ls = t === "light" ? [0.78, 0.64, 0.5] : [0.46, 0.6, 0.74]
  const blue = Ls.map((l) => fromOklch(l, 0.13, BLUE_H))
  const orange = Ls.map((l) => fromOklch(l, 0.14, ORANGE_H))
  diverging[t] = {
    blue,
    mid,
    orange,
    ramp: [...blue.slice().reverse(), mid, ...orange],
  }
}
const lOf = (hex: string, k?: (typeof CVDS)[number]) =>
  oklch(k ? simulate(hex, k) : hex).L
for (const t of THEMES) {
  const s = seq[t]
  const ss = surfaces(t)
  const dir = t === "light" ? -1 : 1
  const mono = (k?: (typeof CVDS)[number]) =>
    s.every(
      (c, i) =>
        i === 0 || (lOf(c, k) - lOf(s[i - 1] as string, k)) * dir > 0.03,
    )
  expect(
    mono() && CVDS.every((k) => mono(k)),
    `${t}: sequential ramp lightness is monotone with steps above 0.03 in normal, protan, deutan and tritan vision`,
  )
  expect(
    Math.min(...ss.map((x) => contrast(s[0] as string, x))) >= 2,
    `${t}: lowest sequential step stays visible against every surface (>= 2:1, the ordinal floor)`,
  )
  expect(
    Math.min(...ss.map((x) => contrast(s[6] as string, x))) >= GRAPHIC,
    `${t}: strongest sequential step clears 3:1 on every surface`,
  )
  let minStep = 99
  for (let i = 1; i < 7; i++)
    for (const k of CVDS)
      minStep = Math.min(
        minStep,
        deltaEcvd(s[i - 1] as string, s[i] as string, k),
      )
  expect(
    minStep >= 4,
    `${t}: adjacent sequential steps differ by at least 4 (OKLab x100) under every simulated deficiency (${minStep.toFixed(1)})`,
  )
  const d = diverging[t]
  const armGap = Math.min(
    ...CVDS.flatMap((k) => [
      deltaEcvd(d.blue[2] as string, d.orange[2] as string, k),
      deltaEcvd(d.blue[0] as string, d.orange[0] as string, k),
    ]),
  )
  expect(
    armGap >= 12,
    `${t}: diverging poles stay apart under protan, deutan and tritan (nearest ends ${armGap.toFixed(1)}, floor 12)`,
  )
  expect(
    oklch(d.mid).C < 0.02,
    `${t}: diverging midpoint ${d.mid} is neutral (chroma ${oklch(d.mid).C.toFixed(3)} < 0.02)`,
  )
  const armsMono = [d.blue, d.orange].every((arm) =>
    arm.every(
      (c, i) => i === 0 || (lOf(c) - lOf(arm[i - 1] as string)) * dir > 0.05,
    ),
  )
  expect(
    armsMono &&
      deltaE(d.mid, d.blue[0] as string) >= 6 &&
      deltaE(d.mid, d.orange[0] as string) >= 6,
    `${t}: each diverging arm steps away from the midpoint with distinct steps`,
  )
  expect(
    Math.min(
      ...ss.map((x) => contrast(d.blue[2] as string, x)),
      ...ss.map((x) => contrast(d.orange[2] as string, x)),
    ) >= GRAPHIC,
    `${t}: the strongest diverging steps clear 3:1 on every surface`,
  )
  report[`${t}_scales`] = {
    sequential: s,
    diverging: d.ramp,
    diverging_mid: d.mid,
    min_adjacent_seq_cvd: +minStep.toFixed(1),
    pole_gap_cvd: +armGap.toFixed(1),
  }
}

// 3. negative control: a palette that must fail the same gate (two near-identical greens and a yellow-green pair).
const bad = ["#2a9d3a", "#3aa83a", "#e34948"]
expect(
  Math.min(deltaEpd(bad[0] as string, bad[1] as string)) < CVD_TARGET,
  "negative control: two near-identical greens fail the CVD gate (so the gate can fail)",
)

writeFileSync(
  join(HERE, "q4-palette.json"),
  `${JSON.stringify({ thresholds: { cvd_target: CVD_TARGET, cvd_floor: 6, normal_floor: NORMAL_FLOOR, graphic_contrast: GRAPHIC }, order: ORDER, method: "dataviz skill six checks, own implementation (docs/spikes/plan-06/lib/colour.ts); Machado 2009 severity 1.0", ...report }, null, 2)}\n`,
)
console.log(
  JSON.stringify(
    Object.fromEntries(
      THEMES.map((t) => [
        t,
        (report[t] as { categorical: string[] }).categorical,
      ]),
    ),
  ),
)
process.exit(fails.length ? 1 : 0)

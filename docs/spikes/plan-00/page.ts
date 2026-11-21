// Toy page script (browser). Bundled by spike.ts via Bun.build. Plotly is inlined separately.
declare const Plotly: any

const N = 96
const names = ["f1", "f2", "f3", "f4", "f5"]
let s = 12345
const rnd = () => {
  s = (s * 1664525 + 1013904223) % 4294967296
  return s / 4294967296
}
const rows = Array.from({ length: N }, () => names.map(() => rnd()))
const gd = document.getElementById("pc") as any
const sp = document.getElementById("splom") as any
const events: unknown[] = []
const w = window as any
w.__events = events
w.__rows = rows

const pcSpec = () => ({
  type: "parcoords",
  line: {
    color: rows.map((r) => r[0]),
    colorscale: [
      [0, "#2a6"],
      [1, "#a32"],
    ],
  },
  dimensions: names.map((n, i) => ({
    label: n,
    values: rows.map((r) => r[i]),
  })),
})
w.__spec = pcSpec
const layout = {
  uirevision: "spandek",
  paper_bgcolor: "#ffffff",
  font: { color: "#111111" },
  margin: { l: 60, r: 60, t: 40, b: 20 },
}

w.readRanges = () =>
  gd.data[0].dimensions.map((d: any) => d.constraintrange ?? null)

async function init() {
  await Plotly.newPlot(gd, [pcSpec()], layout)
  gd.on("plotly_restyle", (payload: unknown) => {
    events.push({
      payload: JSON.parse(JSON.stringify(payload ?? null)),
      read: w.readRanges(),
    })
  })
  await Plotly.newPlot(
    sp,
    [
      {
        type: "splom",
        dimensions: names.map((n, i) => ({
          label: n,
          values: rows.map((r) => r[i]),
        })),
        marker: { size: 3 },
      },
    ],
    {
      uirevision: "spandek",
      paper_bgcolor: "#ffffff",
      font: { color: "#111111" },
      width: 500,
      height: 400,
    },
  )
  const tb = document.getElementById("tbl") as HTMLTableElement
  tb.innerHTML = rows
    .map(
      (r, i) =>
        `<tr><td>${i}</td>${r.map((v) => `<td>${v.toFixed(3)}</td>`).join("")}</tr>`,
    )
    .join("")
  document.getElementById("sel")?.addEventListener("change", () => {
    Plotly.react(gd, [pcSpec()], layout)
  })
  w.ready = true
}
void init()

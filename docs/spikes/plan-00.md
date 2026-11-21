# Plan 00 browser spike (Q1-Q3)

Re-run inside the repo on 2026-11-21. Script: `bun run docs/spikes/plan-00/spike.ts` (writes the toy page to a temp dir, exits non-zero on any failed expectation; 25 expectations, all pass). Toy page source: `docs/spikes/plan-00/page.ts`. Screenshots: `docs/spikes/plan-00/theme-light.png`, `theme-dark.png`.

Versions: plotly.js-dist-min 4.3.0 (`Plotly.version` = 4.3.0), playwright 1.65.1, Google Chrome 157.0.8103.80 headless via `channel: "chrome"`, Bun 1.3.14.

## Q1 - brush, clear, reorder: events and payloads

Real mouse events (`page.mouse` down/move/up) on `#pc .axis-brush rect.background` (one rect per axis, found by DOM; 5 found). Every user action fires exactly one `plotly_restyle`, on mouse-up. The event argument is `[update, [traceIndices]]`; each value inside `update` is wrapped in a per-trace array.

| Action | Event | `update` entry | `gd.data[0].dimensions[i].constraintrange` afterwards |
|---|---|---|---|
| drag one range on axis 1 | 1 x `plotly_restyle` | `"dimensions[1].constraintrange": [[lo, hi]]` | flat `[lo, hi]` |
| drag on axis 3 (second axis) | 1 x restyle | `"dimensions[3].constraintrange": [[lo, hi]]` | axis 1 and axis 3 both flat; both readable |
| drag a second range on axis 1 | 1 x restyle | `"dimensions[1].constraintrange": [[[lo,hi],[lo,hi]]]` | nested `[[lo,hi],[lo,hi]]` |
| clear (click on the axis outside the brush) | 1 x restyle | `"dimensions[3].constraintrange": null` | `undefined`; other axes untouched |
| reorder (drag an axis heading) | 1 x restyle | key `dimensions` only; value is `[[dim0..dim4]]` with full `label`/`values` (about 5 x 96 numbers) | ranges stay attached to their dimension, but the array index changes with the order |
| programmatic `Plotly.restyle(...constraintrange...)` | 1 x restyle (same shapes) | as above | readable |

Reading procedure (confirms D9): on every `plotly_restyle`, ignore the payload and read `gd.data[0].dimensions[i].constraintrange` for all `i`, then pass each raw value through `normaliseRanges` (accepts `undefined`/`null`, flat `[lo, hi]`, nested `[[lo, hi], ...]`). In every case above the read gave the ranges. After a reorder, index by dimension label, not by position (the spike saw `f2` move to index 0 with its two ranges).

Correction to the Research evidence row: the "nested" payload for a single range, `[[lo,hi]]`, is the per-trace wrapper around the flat range, not a different range shape. A multi-range payload is `[[[lo,hi],[lo,hi]]]`. Unwrapping `payload[0][key][0]` would give the property form, but the property read is simpler and is what the plan uses.

### Finding that contradicts the plan: `uirevision` does not keep the brush

With `uirevision: "spandek"` in the layout, `Plotly.react(gd, [freshSpec], layout)` clears every brush range (`gd.data` and `gd._fullData` both read `null` afterwards; `layout._preGUI` is empty even before the react, because brush edits are not recorded as GUI edits). Also measured in a minimal page: layout-level only, layout plus trace-level, and none all clear it. Re-injecting the last read ranges into the spec as `constraintrange` before `Plotly.react` keeps the brush (reads back identical, spike expectation passes). Consequence for Tasks 3-5: D7/D9 and test T-BRW-4 (`brushSurvivesPlotlyReact`) should keep the explorer's ranges in app state and write them into each parcoords spec on every react; setting `uirevision` alone is not enough. This is not a Q1 failure (ranges are readable), so the task proceeds; the controller should amend the plan wording.

## Q2 - deterministic bundle

`Bun.build({ target: "browser", minify: true })` of the page script, wrapped in an HTML shell with `plotly.min.js` (4.6 MB) inlined, built twice in one process: byte-identical (4,844,767 bytes).

- build 1 sha256: `6bfdd060ed8efda6084ebc4b28ec05d6bf637e840bebbef5fadbc6f6c03caa34`
- build 2 sha256: `6bfdd060ed8efda6084ebc4b28ec05d6bf637e840bebbef5fadbc6f6c03caa34`

The hash changes when `page.ts` changes (expected); the pair is what matters. Inlined `</script` is escaped as `<\/script`.

## Q3 - theming keys (D7)

Toy page toggles `data-theme="dark"` on `:root`, then `Plotly.relayout(gd, {paper_bgcolor, "font.color"})` and `Plotly.restyle(gd, {"labelfont.color", "tickfont.color", "rangefont.color", "line.colorscale"}, [0])`, plus one CSS rule: `[data-theme=dark] #pc .parcoords .axis path, ... .axis line, ... .axis .domain { stroke: #eee !important }`.

Computed styles, light then dark: body background `rgb(255,255,255)` then `rgb(17,17,17)`; parcoords axis stroke `rgb(0,0,0)` (hard-coded black in light, so the override is required) then `rgb(238,238,238)`; tick and label text fill `rgb(17,17,17)` then `rgb(238,238,238)`. Trace after restyle holds `labelfont/tickfont/rangefont.color = #eeeeee` and the new colorscale. Screenshots (about 170 KB each) show a legible dark chart. No console errors in the whole run.

# Plan 06 spike: answers Q1 to Q6 (2026-11-22)

Scripts live in `docs/spikes/plan-06/`; `bun docs/spikes/plan-06/run_all.ts` runs them one after the other and exits 0 only when every expectation of every script holds (last run: all 8 steps pass). Each script also prints its expectations as `ok` or `FAIL` lines. Q2 needs `uv` and the network on the first run, Q5 needs the network for `bun install`; both use public registries and releases only.

| Script | Answers | Writes |
|---|---|---|
| `q1_page_budget.ts` | Q1 | `skeleton.html`, `skeleton-closed.jpg`, `skeleton-first-screen.png`, `q1-page-budget.json` |
| `q2_fonts.py` | Q2 | `fonts/*.woff2`, `fonts/charset.txt`, `fonts/OFL-*.txt`, `q2-result.json` |
| `q3_light_theme.ts` | Q3 | `q3-contrast.json` (tokens of both themes and the 144-row pair table) |
| `q4_palette.ts` | Q4 | `q4-palette.json` (reads `q3-contrast.json`) |
| `q5_svelte.ts` | Q5 | `q5-result.json` |
| `q6_comprehension_keys.ts`, `q6_score.ts`, `q6_strip_key_facts.ts`, `q6_selftest.ts` | Q6 | `tests/fixtures/comprehension.json` |
| `vendor-check.ts` | vendor manifest | `vendor/manifest.sha256` (65 files) |
| `lib/colour.ts`, `lib/csv.ts` | shared maths | none |

## Frozen values

| Item | Value |
|---|---|
| `T_page_px` | **9000** (the plan's value, frozen here, never edited afterwards). The closed skeleton measures 6,623 px at 1280 px (74 % of the budget, 78 % below the 30,240 px baseline) |
| Font decision (D4) | **embed**: Inter 400 and 600, JetBrains Mono 400 and 600, subset woff2, **74.1 KB** base64 in total (budget 300 KB) |
| D2 | **confirmed**: pure TypeScript component functions, no Svelte |
| Colour gates | text 4.5, large and graphics 3 (`T_contrast_*` unchanged); categorical adjacent CVD distance at least 8, normal-vision at least 15 (OKLab x100) |

## Q1 Page budget

Baseline measured in Chrome at 1280 px, reproduced exactly: 30,240 px; overview 528, live 1289, summary 356, explorer 4950, cards 9366, sensitivity 2888, optimisation 3679, indonesia 4736, limits 1750, manifest 597.

Closed-by-default structure, built from the real text and numbers of the run (`reports/plan-00-run`): the headline, recipe numbers, controls, limits and explorer rows are the run's own.

| New section | Closed height (px) | What is visible | Behind a disclosure |
|---|---|---|---|
| Verdict | 751 | computed headline, lead sentence, three recipe cards (cooling number, interval bar, cost, PROXY badge), honesty statement, limits link | none |
| Recipes | 666 | comparison table of three recipes and two controls | three per-recipe layer and number panels |
| Why it works | 874 | three-layer explainer, layer-thickness schematic, one day-2 temperature figure | none |
| Climate | 1185 | lead paragraph, one small-multiples benefit figure, five-site table | weather model, TMYx check, ageing scenario |
| Budget | 879 | priority and budget controls, three tiles, one budget curve, result sentence | recipe layers at the budget |
| Explore all 96 | 1085 | lead, sort and filter bar, 10-row table, "show all 96" (card view per row on demand) | parallel coordinates and scatter matrix, live simulator, sensitivity, optimisation details |
| Method and limits | 781 | method paragraph and nine limit statements in three columns | assumed constants, glossary |
| Provenance | 205 | run line and hashes | manifest |
| Total | **6,623** | | |

Findings.
- The 96 cards (9,366 px) become a table of rows plus an on-demand card; the explorer, the live simulator, sensitivity and the optimisation detail all move behind disclosures, which is where 24,000 of the 30,240 px went.
- No section is taller than two 800 px viewports (tallest 1,185 px, R9). The light theme renders the same height.
- H2 holds in the skeleton: the verdict, all three recipes, the honesty statement and the limits link sit inside the 1280x800 first screen (the first screen ends at about 740 px).
- Headroom is 2,377 px (26 %). Task 6 must treat real figure heights as the risk: the skeleton gives figures 260 to 400 px; a figure above 450 px or a tenth section would eat the headroom.
- At 768 px the skeleton is 7,917 px and at 390 px it is 9,660 px. H1 is defined at 1280 px only, so 9,000 is not applied to the phone width, but R9 and H10 need a phone-specific check in Task 6 (no overflow holds at both widths).
- Negative control: the current report is 30,240 px, over 9,000, so the gate can fail.

Evidence: `skeleton-closed.jpg` (full page, dark), `skeleton-first-screen.png`, `skeleton.html`.

## Q2 Fonts

Sources (upstream releases, not a mirror): Inter 4.1 (`github.com/rsms/inter` release `Inter-4.1.zip`, `extras/ttf/Inter-Regular.ttf` and `Inter-SemiBold.ttf`) and JetBrains Mono 2.304 (`github.com/JetBrains/JetBrainsMono` release `JetBrainsMono-2.304.zip`, `fonts/ttf/JetBrainsMono-Regular.ttf` and `-SemiBold.ttf`). Both are SIL Open Font License 1.1; the licence texts are saved at `docs/spikes/plan-06/fonts/OFL-Inter.txt` and `OFL-JetBrainsMono.txt` and checked against pinned sha256 values together with the zip archives and the four TTF files. The npm `@fontsource` packages were tried first and rejected: their `latin` subset lacks the arrows, comparison signs and the superscript minus (they sit in no fontsource subset).

Tool: fontTools 4.68.0 with brotli 1.2.1 (`pyftsubset` API), Python 3.12 through `uv`; layout features kept: kern, liga, calt, tnum, case, ccmp, locl, mark, mkmk; hinting dropped.

Charset (125 characters, `fonts/charset.txt`): printable ASCII, every non-ASCII character found in `src/` and in the current report text (`° ² µ · ¹ – ⁻`), plus the planned set `± ≥ ≤ → ← ↑ ↓ — ‘ ’ “ ” … • ³ ⁰ ≈ ≠ × ÷ − ′ ″`.

| File | woff2 bytes | base64 bytes |
|---|---|---|
| Inter-Regular-subset | 12,412 | 16,552 |
| Inter-SemiBold-subset | 12,764 | 17,020 |
| JetBrainsMono-Regular-subset | 15,552 | 20,736 |
| JetBrainsMono-SemiBold-subset | 16,160 | 21,548 |
| Total | 56,888 | **75,856 (74.1 KB)** |

Result: 74.1 KB is far below 300 KB, so **embed** (D4). Inter covers the whole charset; JetBrains Mono covers every numeral, sign and unit character except the superscript minus U+207B. Rule for Task 2: unit exponents such as `W m⁻²` are set in Inter, never in the mono face (the fallback would otherwise change the metrics inside a number). Reproducibility: two subsets in one process and one in a fresh interpreter are byte-identical to the committed files. Chrome loads all three families from the file in the skeleton (checked by `document.fonts`).

## Q3 Light theme

Derivation (`q3_light_theme.ts`): dark is the contract's semantic values exactly as shipped. Light keeps the orange for fills and the midnight label on it (6.58), takes surfaces from warm-white (`#f7f8fa` base, `#edf0f5` canvas, white elevated and card, glass and raised as midnight at 4 % and 7 %), and text from midnight (`#0b1020`, muted at 72 %). The brand orange as text on light is only 2.71:1 (the script asserts this as a negative control), so text-use inks are the brand hue and chroma with lightness lowered only as far as contrast demands; the hue drift is below 5 degrees for both the orange and the teal ink.

New semantic tokens (the brand contract has none; both themes carry them so components never branch on theme):

| Token | Dark | Light |
|---|---|---|
| `link` / `link-hover` | `#ff683b` / `#ff855f` | `#be3701` / `#a62f01` |
| `accent-secondary` (text) | `#22d3c5` (contract) | `#01746c` |
| `focus-ring` | `#22d3c5` (contract) | `#049389` |
| `status-go` | `#22d3c5` | `#02665f` |
| `status-stop` (red hue, the one added hue, for meaning) | `#ff726b` | `#b10a1e` |
| `status-proxy` (amber, the PROXY badge) | `#f9ac22` | `#7b5201` |
| `border-control` (inputs, 3:1) | `rgba(247,248,250,0.36)` | `rgba(11,16,32,0.47)` |
| `viz-recommended` (chart accent) | `#ff683b` | `#e65121` |

Pair table (`q3-contrast.json`, 144 rows, WCAG 2.x, alpha blended over the surface first; surfaces are base, glass, raised, canvas, elevated, card): both themes pass. Lowest text pair 4.58, lowest graphic pair 3.07. Badge text on its own 14 % tint passes in both themes. The instrument is checked first against the contract's own stated ratios (21, 6.58, 17.82, 10.09, 7.91, 9.44, 6.58, all within 0.01).

## Q4 Dataviz palette

Method: the `dataviz` skill's six checks, re-implemented in `lib/colour.ts` (OKLab, Machado 2009 severity 1.0 CVD simulation, WCAG contrast) so the instrument shares no code with the skill's validator. Instrument check: the skill's published reference palette gives worst adjacent CVD 9.12 and 8.36 and normal-vision 19.63 and 19.27, matching its published 9.1, 8.4, 19.6 and 19.3. Validated on six surfaces per theme, which include the two plot backgrounds (light `#f7f8fa` and `#ffffff`; dark `#0b1020` and `#101827`).

Categorical (six colours, one fixed order for both themes; red is excluded because it sits 4 to 6 units from the brand orange and is the status-stop hue; the brand orange is reserved for the recommended recipe):

| Slot | Hue | Light | Dark |
|---|---|---|---|
| 1 | green | `#008300` | `#0ca30c` |
| 2 | magenta | `#c95f89` | `#d55181` |
| 3 | blue | `#2a78d6` | `#3987e5` |
| 4 | yellow (amber) | `#b17702` | `#c98500` |
| 5 | aqua | `#019465` | `#199e70` |
| 6 | violet | `#6250d6` | `#9085e9` |
| recommended | orange | `#e65121` | `#ff683b` |
| aluminium baseline | neutral grey | `#5e636f` | `#b0b6c3` |

Gates: every colour at least 3.11:1 against every surface; lightness inside the skill's band; chroma at least 0.10; worst adjacent distance under protan, deutan and tritan 8.06 (light) and 8.36 (dark) against a target of 8; worst adjacent normal-vision 17.97 and 19.77 against 15; the recommended accent is at least 10 units from every series colour and the baseline at least 10 from every series colour and the accent. Minimum pairwise distance over all six slots is poor (CVD 1.75 light, 1.56 dark; normal 9.47 and 9.76), so the all-pairs cap applies: **the first three slots validate all-pairs** (worst pair CVD 12.34 light, 9.88 dark; normal 24.15 and 26.52). Rule for Task 6: scatter, small multiples and any chart that needs all pairs distinguishable use at most three categorical colours; the five Indonesian sites are shown as small multiples with one colour and direct labels, not five hues.

Sequential (one hue, blue, seven steps, low end nearest the surface but at least 2:1, monotone lightness in normal, protan, deutan and tritan vision, adjacent steps at least 5.8 apart under every deficiency):
light `#74a6e7 #5b91d7 #427cc7 #2868b6 #1a559c #0a4382 #003167`; dark `#295894 #386db0 #4781cc #5797e9 #71adfb #97c4ff #bedaff`.

Diverging (blue and orange poles, neutral midpoint, three steps per arm, poles at least 18.1 apart under every deficiency, strongest steps at least 3:1): light `#2963ab #538ed9 #86baff | #e2e5ea | #ff987a #d2694b #a33f20`; dark `#71adfb #4781cc #1c579e | #32353c | #963212 #c55d3f #f58869`. Use the diverging scale for deltas (for example hotter or cooler than bare aluminium); never place the recommended-recipe accent on a chart that also uses the diverging scale.

## Q5 Svelte 5 + Vite single file, measured

Throwaway directory; versions svelte 5.59.1, vite 8.3.8, @sveltejs/vite-plugin-svelte 7.3.1, vite-plugin-singlefile 2.3.4. Component: `Button.svelte` with `Icon.svelte` and the lib helpers, copied from `vendor/torviello-landing-ui`.

| Measure | Result |
|---|---|
| Build steps | `bun install` (4 devDependencies), `vite build` with the svelte and singlefile plugins and an alias for `@torviello/design/brand` |
| Output | one `dist/index.html`, 59,315 bytes for one button (the Svelte runtime is shipped; the markup is created in the browser, not at build time) |
| Install | 34 top-level packages, 35.4 MB of `node_modules`; first install 611 ms (cached 18 to 334 ms), build 1.5 s then 0.25 s |
| Byte reproducibility | two builds in the same directory byte-identical; a build in a different directory byte-identical (sha256 `09e9f618...dc1b4`) |

Conclusion: **D2 confirmed, with a corrected reason.** The plan's alternatives table cites a byte-reproducibility risk; the measurement does not support it (builds are reproducible). D2 stands on three other measured grounds: (1) a 59 KB client runtime for one button where a pure function costs a few hundred bytes of source and nothing at run time; (2) the report is produced by string-building code in `src/node/report` and the live worker needs the same markup as strings, which Svelte components do not provide without a second (server) compile path; (3) four new dev dependencies and 35 MB of tree, against NFR-2. Also noted: the vendored `lib/icons.ts` and `lib/brand.ts` import `@torviello/design/brand/...`, so the Svelte atoms do not copy "as is" even in Svelte; they need the alias (Task 3 reads the vendor sheets and the brand TypeScript files directly instead).

## Q6 Comprehension harness

`q6_comprehension_keys.ts` computes every answer key from the finished run (`results.csv`, `controls.csv`, `candidate_cards/*.md`, `refine/budget_table.json`, `indonesia/indonesia_summary.csv`, `run_manifest.json`) and writes `tests/fixtures/comprehension.json`; a choice key is only written when the data supports it (the script throws otherwise). Question wording and option texts are the only typed content.

| Id | Question (short) | Key | Derived from |
|---|---|---|---|
| Q1 | which recommended recipe cools the most | SP-075 | lowest scenario-mean peak temperature among the three cards |
| Q2 | its cooling in K against bare aluminium | 14.4 | C0 mean minus recipe mean peak temperature |
| Q3 | is the cooling number a measurement | C (a model prediction, not a measurement) | all result columns are predictions or proxies, no measured file in the manifest |
| Q4 | what PROXY means | A (a relative ranking index) | every `*_proxy` column lies in [0, 1] |
| Q5 | the knee of the balanced budget curve | 0.42 | `budget_table.json` balanced `knee_budget` |
| Q6 | site that benefits most | medan | largest weighted `dq_w_m2` of the pick, initial state |
| Q7 | what the report does not model | D (weathering, ageing, adhesion) | the pick's card limits |
| Q8 | next step for the pick | B (small samples tested in a laboratory) | the pick's card Decision is `go to coupon lab` |

The correct letters differ (C, A, D, B) so a position guess does not work. Scorer: `q6_score.ts <answers.json>` (exact match after normalising case, spaces, units and an option letter followed by text; exit 0 at 7 of 8 or more, 1 below, 2 on a usage error). Negative control: `q6_strip_key_facts.ts <in.txt> <out.txt>` drops every cell and sentence matching the key-fact patterns of the fixture. `q6_selftest.ts` proves: the fixture regenerates byte for byte; a perfect sheet scores 8, two wrong score 6 (below 7), one wrong scores 7; the scorer CLI exits 0, 1 and 2 correctly; every question's key facts occur in the current report text; the stripper removes every match and keeps 75 % of the text; the page no longer contains the pick, the site, the knee, "weathering" or "coupon" afterwards. The agent-based run (a fresh reviewer scoring the stripped text below 7, and the real page at 7 or more) is left to the orchestrator as instructed.

## Vendor manifest

`vendor/manifest.sha256` holds the sha256 of the 65 files under `vendor/` other than `VENDORED.md` and itself, sorted bytewise, and passes `cd vendor && shasum -a 256 -c manifest.sha256`. `vendor-check.ts` exports `vendorCheck(root)` returning `{ ok: true } | { ok: false, first, count }` (`first` is the index of the first offending manifest line, an unlisted file counts after the last line), exits 5 on drift with a `design.vendor.drift` JSON line, and `--selftest` proves it detects one flipped byte (located), a deleted file, an extra file and a missing manifest, and that `VENDORED.md` stays outside the manifest. `--write` rewrites the manifest and is for a deliberate re-sync only.

## Plan-text issues found (plans/ not edited)

1. D2's alternatives row cites a byte-reproducibility risk for Svelte; Q5 measured none. Keep D2, change the reason (runtime size, string builders, dependencies).
2. H3 asks for "its cooling number" without defining it; this spike defines it as bare aluminium C0 minus the recipe, scenario-mean peak temperature, in K. The page text must show that number and name the reference.
3. The brand contract has no link, status or control-border token and the brand is dark-only; Task 2's `themes.ts` needs the eight new tokens listed under Q3 in both themes. FR-5 ("semantic tokens only") then holds for the report.
4. D6 reserves orange for the recommended recipe, so the validated categorical set has six colours (not eight) with an all-pairs cap of three; Task 6's "small multiples where compared" must not rely on five hues for five sites.
5. T_page_px applies at 1280 px only; the phone skeleton is 9,660 px. Say so in H1 or add a phone threshold.
6. The vendored Svelte `lib/*.ts` files import `@torviello/design/brand/...`, so "copy as-is" needs an alias even in Svelte (moot under D2).
7. Task 1 asks for a "key facts stripped negative control" run by an agent; it needs the page's text, so it can only run in Task 7. This spike provides the scripts and a deterministic check only.
8. `biome.json` now ignores the generated spike outputs (`docs/spikes/plan-06/*.json`, `*.html`) and `tests/fixtures/comprehension.json` (a script-generated file that must stay byte-identical).

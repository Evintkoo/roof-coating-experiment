# BLOCKED register

Items that cannot be completed digitally. Owner of every entry: Evint. Entries are kept in id order; plan 4 added BLOCKED-9 and BLOCKED-10, plan 5 added BLOCKED-11, plan 6 added BLOCKED-12 and BLOCKED-13, plan 7 added BLOCKED-14 and BLOCKED-15.

## BLOCKED-1: Lab calibration

- Reason: needs coupon measurements (blueprint section 7); the models are uncalibrated until then.
- Owner: Evint
- Unblock condition: `validation/coupon_results.csv` exists.

## BLOCKED-2: Two-node thermal model

- Reason: no layer conductivities or film thermal data.
- Owner: Evint
- Unblock condition: measured or citable layer conductivities and film thermal data are supplied.

## BLOCKED-3: Polydisperse particle-size distribution

- Reason: no measured particle-size distribution (PSD).
- Owner: Evint
- Unblock condition: a measured PSD for each pigment/filler is supplied.

## BLOCKED-4: Real cost prices

- Reason: cost stays a relative scenario index until vendor prices exist.
- Owner: Evint
- Unblock condition: vendor prices are entered in `materials.yaml`.

## BLOCKED-5: Failure mechanisms and abrasion limit

- Reason: blueprint section 3.4 failure mechanisms are not modelled (soiling, abrasion/UV loss of hydrophobicity, edge and scratch corrosion), nor the section 5.2 step 4 abrasion limit; no data.
- Owner: Evint
- Unblock condition: measured degradation and abrasion data are supplied.

## BLOCKED-6: Substrate compatibility and viscosity/pot-life constraints

- Reason: blueprint section 5.2 step 3 constraints need vendor data.
- Owner: Evint
- Unblock condition: vendor data on substrate compatibility, viscosity and pot life is supplied.

## BLOCKED-7: Advanced routes (TiO2@SiO2, flexibiliser level)

- Reason: blueprint WP-B route B2 (TiO2@SiO2) and the WP-C flexibiliser level are advanced routes and are lab-gated.
- Owner: Evint
- Unblock condition: lab capacity and results for these routes exist.

## BLOCKED-8: Bare mill-finish aluminium optical and thermal constants

- Reason: no citable value found for solar reflectance and emittance of bare mill-finish aluminium sheet.
- Owner: Evint
- Unblock condition: a blank-coupon measurement of solar reflectance (reflectometer) and emittance (emissometer) of the actual bare mill-finish sheet is made, or a citable CRRC/ASTM value for mill-finish aluminium roofing is found. Until then `substrate.r_solar` 0.65 (bounds 0.55-0.75) and `substrate.emissivity` 0.09 in `configs/materials.yaml` stay `scenario`; searches in plan 2 (CRRC, LBNL, ORNL, ATAS guide) found none.

## BLOCKED-9: Field soiling and biological growth on Indonesian roofs

- Reason: no field exposure data for coated aluminium roofs in Indonesia; soiling, mould and algae loss of solar reflectance in a humid tropical climate is not measured, and rain-wash recovery is not modelled. Plan 4 replaces it with a labelled scenario range `loss` 0.14-0.26 (`configs/indonesia.yaml`, status `literature`, from three US three-year CRRC pairs), reported as "scenario, not an Indonesian measurement"; the humid tropics may be worse.
- Owner: Evint
- Unblock condition: field exposure data (initial and aged solar reflectance, at least 12 months, at one or more of the five sites) for a coated aluminium sheet is supplied; then `ageing.loss_lo` and `ageing.loss_hi` are replaced by the measured range and the status becomes `measured`.

## BLOCKED-10: Wind-driven rain and chloride deposition

- Reason: no data on wind-driven rain, chloride deposition or coastal salt load at the five sites; the corrosion exposure is reported only as time-of-wetness hours (RH above 80 % and air temperature above 0 C) beside the unchanged relative corrosion proxy, and no site multiplier is applied to the proxy.
- Owner: Evint
- Unblock condition: field exposure data (chloride deposition rate and wetting records, at least 12 months) at the coastal sites (Jakarta, Surabaya, Makassar) is supplied; then a site multiplier for the corrosion proxy can be calibrated.

## BLOCKED-11: Mass-based recipes and currency prices

- Reason: the plan 5 recipes and budget tables are in layer thicknesses, volume fractions and a relative cost index; converting them to masses per square metre (the lab recipe sheet) and to a price in currency needs sourced densities and binder solids for every ingredient, and vendor prices (see BLOCKED-4).
- Owner: Evint
- Unblock condition: a datasheet density and binder solids content for each ingredient (TiO2, BaSO4, binder, sol-gel precursors) are supplied; then the table column `cost_unit` can change from `relative` to `idr_per_m2` and the table must be rebuilt (the manifest hash guards stale tables).

## BLOCKED-12: Indonesian-language edition of the report

- Reason: the report is English only. The glossary and the plain-language outline are data (`src/web/design/terms.ts`, `src/core/report/outline.ts`), so a translation is another table of the same shape, but a translation of the honesty and limits wording must be reviewed by an Indonesian speaker who knows the statistics, or an inexact translation could overstate certainty.
- Owner: Evint
- Unblock condition: a reviewed Indonesian translation of every glossary entry, section title, role name, layer text and the honesty statement is supplied; then it is added as data with a locale key and a test that it covers every id.

## BLOCKED-13: Light theme of the dark-only Torviello brand

- Reason: the vendored Torviello brand (`vendor/torviello-design`) defines a dark theme only. The report ships a derived light theme (contrast-tested, plan 06) so it stays readable in a light system setting and in print, but it is not an official brand theme.
- Owner: Evint
- Unblock condition: the brand owner approves the derived light theme, or supplies an official one; the tokens in `src/web/design/themes.ts` are then replaced or the derivation is recorded as approved.

## BLOCKED-14: Export of the animation as video or GIF

- Reason: the day player and the screening panel are live SVG driven by one animation loop in the reader's browser; the report is one offline HTML file and plan 07 adds no encoder or runtime dependency. A recorded video or GIF needs a capture pipeline (headless Chrome frame capture plus an encoder such as ffmpeg) that is not part of the build and would ship a second, unlabelled copy of model output. The report offers still frames and a frame sequence strip (`reports/screenshots/`) instead, taken from the real page.
- Owner: Evint
- Unblock condition: a decision that a recorded animation is wanted for a named audience (slides, web) and which encoder may be used; then a capture script under `scripts/` renders the day at fixed frame times from the built report (the pure timeline already gives deterministic frames) and the file carries the "model output, not a measurement" label burned into every frame.

## BLOCKED-15: The screening on a phone

- Reason: the worker pool is sized `min(hardwareConcurrency - 1, 6)` with a floor of 1 (the spike measured 0.07 s for the 864 nominal cells on 4 desktop workers and 0.22 s on one, 4 workers over 1 at about 3x), but no phone or low-end tablet was measured: browsers cap or throttle workers on narrow-core devices, and thermal throttling is not under the page's control. The page reports the measured time of the run on the reader's own machine and labels it "this machine's measurement"; it does not promise a time, and the run with 32 uncertainty draws per cell (about 7 s on one desktop thread) may take much longer on a phone.
- Owner: Evint
- Unblock condition: the screening is timed on at least one phone and one low-end laptop (nominal and with draws, one run per device, device model and browser recorded); then the pool cap for narrow-core devices (2 workers) is confirmed or changed and the measured times are added to `docs/spikes/plan-07.md`.

## BLOCKED-16: The sweep varies one input at a time

- Reason: each sweep moves one variable over its configured range with every other input held at the live simulator's values. Interactions between variables are not shown, and a curve at the live settings is not a curve at other settings. The global sensitivity indices of plan 05 (Morris and Sobol) are the place for interactions.
- Owner: Evint
- Unblock condition: a decision that two-variable maps are wanted for a named question; then a second variable and a heat map are a new plan (the 41-point pool path is reusable, a 41 x 41 map is about 1,700 model runs per variable pair).

## BLOCKED-17: C1 is datasheet only

- Reason: the commercial control C1 is one US product (APOC 252 Sunwhite brochure: initial solar reflectance 0.90, emittance 0.87), not an Indonesian datasheet, and the models run it only for the thermal outcomes. Corrosion, delamination, wetting and cost have no C1 value, so the comparison and the sweep draw no C1 line for them and say "datasheet, not modelled". Ageing is not shown (initial values only).
- Owner: Evint
- Unblock condition: a datasheet, or a measured performance, of an Indonesian commercial roof coating for those quantities is supplied (see BLOCKED-4); then `configs/controls.yaml` gets the values with their source and the lines can be drawn.

## BLOCKED-18: No C2 or C3 lines in the comparison

- Reason: the controls C2 (no topcoat) and C3 (no primer) exist only for the shortlisted candidates in the batch run; the live result and the sweep carry C0 and C1 only, so the comparison does not show them.
- Owner: Evint
- Unblock condition: a decision that C2 and C3 are wanted next to the live recipe; then `liveSimulate` returns them (two more thermal solves per point) and the lanes and sweep charts get one more dashed line.

## BLOCKED-19: No temperature field through the layers

- Reason: the thermal model is one node (`thermal.ts`: one surface temperature, one areal heat capacity, one total resistance to the inside). No model of the repo holds a temperature per layer or through the substrate, so the live physics drawing joins the surface and inside temperatures with the model's own conduction law and says "Illustrative scale: one surface temperature, none per layer". A layered conduction model needs per-layer conductivity and heat capacity data that `configs/` does not hold, and a new model plan (owner decision O1 of plan 09).
- Owner: Evint
- Unblock condition: per-layer conductivity and heat capacity data with sources, and a decision to commission a layered 1D conduction model (a plan of the plan 02 kind).

## BLOCKED-20: Absorption is not resolved per layer

- Reason: the model has the stack reflectance `R(lambda)` and an opaque aluminium substrate, so the non-reflected sunlight is absorbed and nothing is transmitted; there is no absorbed share per layer. The rays show reflected against absorbed per band, never a split of the absorbed part between layers. The midcoat scattering visual is also dropped (plan 09 Q3): `S(lambda)` exists only inside `midcoatSpectrum`, and exposing it needs a Mie evaluation per slider move on the stepper lane.
- Owner: Evint
- Unblock condition: a per-layer optical model with its data, or a decision to expose `S(lambda)` additively and pay the per-move Mie cost.

## BLOCKED-21: Rays show fractions, not photons

- Reason: the rays are deterministic quotas of the model's band fractions (UV, visible, near infrared) and move on a fixed schedule; they are not photon trajectories and not Mie angular scattering, which the models do not compute. The panel says "Rays show fractions, not photons".
- Owner: Evint
- Unblock condition: a decision that a stochastic or angular scattering model is wanted, with its own plan and validation data.

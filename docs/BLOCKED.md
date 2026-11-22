# BLOCKED register

Items that cannot be completed digitally. Owner of every entry: Evint. Entries are kept in id order; plan 4 added BLOCKED-9 and BLOCKED-10, plan 5 added BLOCKED-11, plan 6 added BLOCKED-12 and BLOCKED-13.

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

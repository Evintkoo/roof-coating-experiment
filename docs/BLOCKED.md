# BLOCKED register

Items that cannot be completed digitally. Owner of every entry: Evint. Plan 4 Task 2 appends BLOCKED-9 and BLOCKED-10; plan 5 Task 6 appends BLOCKED-11.

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
- Unblock condition: a blank-coupon measurement of solar reflectance and emittance is made.

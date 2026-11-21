# Plan 05 spike: smoothness and step study (Q1-Q4)

Run 2026-11-21. Scripts: `docs/spikes/plan-05/gradient-study.ts` (study, `scan`, `zoom`, `pt` modes) and `docs/spikes/plan-05/analyse.ts` (tables). Scenario set generic9 (plan 1 L9), scenario mean of each plan-3 objective (`OBJECTIVES` read at run time: r_solar_pred, t_max_pred, corrosion_proxy, delam_proxy, cost_proxy), full three-layer stack, pH at the plan-1 midpoint. The grade sizes go in through the `mat` argument of `stackProps`/`thermalOutcomes` (D8). 20 feasible points (LHS seed 20261121, mapped into u in [0.12, 0.88] so that h = 0.1 stays inside the box; constraints m1 <= cpvc, DFT sum <= 332, delam <= 0.5).

## Q1: gradient step study

Central differences in scaled coordinates u = (x - lo)/(hi - lo), h in {1e-1 ... 1e-8}. Richardson difference R(h) = |G(h) - G(h/2)| / max(|G(h/2)|, 1e-3 x largest |G| of that pair); the table gives the 90th percentile over 20 points x the objectives on which the variable has a relevant gradient (largest |G| >= 1e-3 of the largest over all variables). Other objectives have identically zero gradient for that variable (e.g. p1 acts only on corrosion), so they are excluded.

| var | relevant objectives | h_i chosen | R_p90 at h_i | R_max at h_i | plateau (R_p90 <= 1e-4) | width (decades) | R_p90 at h/10 and 10h |
|---|---|---|---|---|---|---|---|
| p1 | corrosion | 1e-5 | 3.6e-10 | 5.8e-10 | 1e-8 .. 1e-2 | 7 | 1.6e-9 / 7.3e-9 |
| p2 | corrosion, cost | 1e-5 | 1.1e-9 | 3.5e-9 | 1e-8 .. 1e-3 | 6 | 7.6e-9 / 7.7e-8 |
| m1 | r_solar, t_max | 1e-4 | 1.1e-8 | 1.5e-8 | 1e-8 .. 1e-3 | 6 | 3.9e-8 / 1.1e-6 |
| m2 | r_solar, t_max | 1e-4 | 1.9e-8 | 2.4e-8 | 1e-8 .. 1e-3 | 6 | 2.0e-8 / 1.9e-6 |
| m3 | r_solar, t_max, cost | 1e-4 | 1.2e-8 | 1.4e-8 | 1e-8 .. 1e-3 | 6 | 2.7e-8 / 1.2e-6 |
| t1 | delam | 1e-5 | 5.2e-11 | 5.7e-11 | 1e-8 .. 1e-2 | 7 | 4.8e-10 / 5.5e-10 |
| t2 | r_solar, t_max, delam, cost | 1e-4 | 4.7e-10 | 1.0e-9 | 1e-8 .. 1e-2 | 7 | 4.0e-9 / 3.7e-8 |
| d_tio2_um | r_solar, t_max | 1e-5 | 3.4e-7 | 3.2e-6 | 1e-7 .. 1e-4 | 4 | 4.9e-6 / 4.6e-5 |
| d_baso4_um | r_solar, t_max | 1e-5 | 3.5e-6 | 4.4e-6 | 1e-6 .. 1e-4 | 3 | 3.5e-5 / 4.9e-6 |

(the study after the Q3 smoothing; the numbers before it are identical to the digits shown except where the S clamp mattered.) Every plateau is contiguous. The primer and topcoat DFT kinks suspected in the brief do not exist in the objectives: p2 and t2 plateaus are 6 and 7 decades wide. Largest Richardson difference over all variables at the chosen steps: 4.4e-6 (d_baso4_um), 3 orders of magnitude below the 1e-3 hard bound of H1. Rounding noise takes over below about 1e-6 for m1-m3 (R grows by 10 per decade) and truncation above 1e-3; for the two grade sizes the window is the narrowest (1e-6 .. 1e-4), the chosen h = 1e-5 is its centre. The one-sided second-order differences at a bound use the same h_i (D1).

Result: every variable has a plateau, including d_tio2_um (Mie ripple does not break it). No variable needs the exit-4 path. Noted for Task 3: the grade-size gradients have R ~ 1e-6 to 1e-5, so the frozen `T_grad_rel` should be set from the real run, not from these numbers.

## Q3: continuity and kinks

Method: 1000-sample scans over the full scaled range of each variable at 3 base points (`scan` mode); at each sample the second difference of an objective is compared with the median of its six neighbours. A smooth function gives ratios near 1, a kink one large isolated ratio. A `zoom` mode then re-samples around the worst location with the window shrinking by 100x each level: a kink keeps its slope jump as the step shrinks, a sharp smooth feature loses it.

- Wetting `r_max` / `f_solid_min`: not in the objectives. `wetting()` takes the Young angle as the nominal (`theta_pred`, `score`); the Wenzel and Cassie angles only set the `lo`/`hi` corner interval. Wetting is not one of the five plan-3 `OBJECTIVES`, so the five objectives are trivially continuous across that switch. Consequence for Task 2: the D12 profile weights keyed by objective name cover the five `OBJECTIVES` names (`delam_proxy` and the others); a `wetting` weight has no objective to act on (the nominal score also has a clip at 90 deg, a slope jump, which is another reason to keep it out). The profile config therefore uses the OBJECTIVES names only.
- Delamination and barrier crack saturations: `crackIndex = 1 - exp(-(L/h_c)^2)` and `1 - (1-y^2)(1-crack)` are C-infinity for rho_net in (0,1]; p1 <= 0.8 gives rho_net >= 0.2, so the rho_net = 0 point is never reached. Scans of p1, p2, t1, t2 show ratio 1.0 everywhere, no kink.
- DFT and PVC variables (p2, m1, m3, t2, m2): ratio 1.0 (max 1.2 at m2 near u = 0.09-0.13, a smooth bend).
- FOUND: the Kubelka-Munk coefficient clamp `S = max(0, S)` in `kmCoefficients` (src/core/models/optics.ts). In the UV band the Eddington S crosses zero, and the clamp has a slope jump there. At a base point with d_baso4 = 2.5 um, the second difference of the midcoat spectrum at 0.34 um jumped by 0.27 across the zero crossing (slope jump, persists as the step shrinks to 1e-7), and zooming on d_tio2_um around u = 0.571 showed max slope change 7e-4 persisting at 3e-7 step. This is a true kink, entering r_solar and t_max through d_tio2_um and d_baso4_um.
- Decision D14 (C1 smoothing, implemented, commit d3601a4): replace max(0, S) by `smoothClampS`: 0 for S <= 0, S for S >= eps, the cubic 2 S^2/eps - S^3/eps^2 between (value and slope match at both ends), with eps = 1e-3 x 3/4 (1-g) sigma_s (the scattering part of S, per wavelength). The change is confined to 0 < S < eps and is at most 0.125 eps in S. Plan-2 tests stay green (232 core tests pass, no pinned value moved by the 1e-9 tolerance); a new test pins the C1 properties.
- After the smoothing: the zoom at d_tio2_um u = 0.571 shows the max slope change falling from 7e-4 to 6.7e-6 at step 3.3e-7 (the median is 5e-7), i.e. no persistent kink; the same holds for d_baso4_um at u = 0.209. The remaining large ratios of 6.6 to 23 at d_tio2_um u ~ 0.55-0.57 and 11 at d_baso4_um u ~ 0.21 are narrow Mie-resonance features (smooth, they pass Richardson at h = 1e-5 with R <= 3.2e-6), so the plateau study above stands.

Effect on plan 3: results change only where 0 < S < eps in some wavelength (about 1e-3 relative band); the plan-3 reports already produced were not regenerated by this spike and Task 5 must read the same `results.csv` normalisation from a rerun if byte equality with the pre-smoothing run matters.

## Q2: pigment grade sizes (D8 bounds 0.15-0.40 um TiO2, 0.30-3.0 um BaSO4)

Status: `scenario` for both bounds; datasheet evidence is partial.

- TiO2: public paint-grade rutile sheets give average particle size 0.34-0.40 um (Ruichem RC-635, https://www.scribd.com/document/704385693/TiO2-RC-635 , "Average particle size, um: 0.34~0.40") and about 0.38 um (NTR-606 sheet, https://www.scribd.com/document/632536974/TiO2-NTR-606-TDS-CW). Third-party reposts, not manufacturer pages; vendors' own sheets (Brenntag 566/578/580/592, Titanos TR1030 on specialchem.com) hide the size behind a login. The 0.15-0.30 um part of the range is not confirmed by any sheet read here; the existing `materials.yaml` secondary note (scatter optimum 0.2-0.3 um) remains the only support. The upper 0.40 is supported, the lower 0.15 is a scenario bound.
- BaSO4: Solvay Blanc Fixe, https://www.solvay.com/en/brands/blanc-fixe : average particle size 0.7 / 0.8 / 1 (HD 80) / 1.7 (N) / 4 um (G) by grade (the 0.7 row has an inconsistent conductivity value). Range 0.3-3.0 um: 0.7-1.7 um are sold grades; 0.3 um (micronized) and 3.0 um are not confirmed (the 4 um grade G lies above the upper bound; JM3B micronized size hidden). A Chinese supplier lists 0.7 um with D50 0.6 (https://xm-chemical.en.made-in-china.com/product/lCIEDQkOhUWH/China-Precipitated-Barium-Sulphate-with-Uniform-Particle-Size-Distribution-0-7-Micron.html).

Conclusion: bounds stay as D8 with status `scenario`; the config records this. A refined optimum at a bound for either grade size must be read as "ask a supplier for that grade", not as an available product.

## Q4: Indonesian prices (D11)

Status `scenario` (indicative) at best; none is a quotation. Searched 2026-11-21.

| Ingredient | Finding | URL | Unit | Status |
|---|---|---|---|---|
| TiO2 | listings of Rp 123 and Rp 137 per kg (25 kg sack), repeated across unrelated products, so likely placeholder prices; a global average of 4.49 USD/kg (12 months to 2026-05-31) is not Indonesia-specific | https://en.indotrading.com/jual-titanium-dioxide ; https://dir.tridge.com/prices/titanium-dioxide | IDR/kg, USD/kg | scenario, not usable |
| BaSO4 | one listing, 200 mesh, Rp 10,000 per kg excl. VAT (a coarse mineral grade, not Blanc Fixe) | https://en.indotrading.com/jual-barium-sulphate | IDR/kg | scenario (indicative) |
| GPTES | no Indonesian page found | - | - | none found |
| TEOS | no Indonesian page found; catalogue prices abroad only (TCI 18 USD per 25 mL, https://www.tcichemicals.com/MY/en/p/T0100, undated; lab scale) | - | - | none found |
| MTES | no Indonesian page found | - | - | none found |
| Acrylic binder | no price page found (search not conclusive) | - | - | none found |

Written answer: public Indonesian prices are not available for four of the six ingredients and the two found are unreliable, so the budget table stays in relative `cost_proxy` units (D11) and BLOCKED-4/BLOCKED-11 remain open.

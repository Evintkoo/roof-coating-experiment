# Plan 02 spikes: Q1-Q4 answers

Date 2026-11-21. Condensed from four research spikes and an adversarial check (working notes in `.superpowers/sdd/02-physical-models/spikes/`, not committed). Wording:

- **read**: the page or paper text was opened and the number is quoted from it.
- **secondary**: seen only in a search snippet, a review or a vendor summary; original not read. Never called literature.
- **scenario**: a design assumption; no citation is claimed for the number.
- **unverified**: could not be checked.

No DOI or citation here is invented; DOIs are given only where the source page that was read printed them.

## Q1: Mie to Kubelka-Munk mapping

Per-length coefficients (independent scattering): `sigma_s = 1.5 phi Q_sca / d`, `sigma_a = 1.5 phi Q_abs / d`, Mie with `m = n_p / n_med`, `x = 2 pi n_med a / lambda`. Film: `a = 1 + K/S`, `b = sqrt(a^2 - 1)`, `R = (1 - Rg (a - b coth(b S X))) / (a - Rg + b coth(b S X))` (Kubelka 1948 form, identical in two sources); the `K = 0` limit is `b coth(b S X) -> 1/(S X)`. Interface term `R = Rde + (1-Rdi)(1-Rde) R_KM / (1 - Rdi R_KM)`.

**Verdict (ruling R1, binding).** The Eddington closure `S = 3/4 (1-g) sigma_s - sigma_a/4` with `K = 2 sigma_a` stands as the default. The hemispheric closure `S = (1-g) sigma_s` stays selectable. Spike Q1's headline "S must change to `2 B sigma_s`" is overruled. Reason: Q1 argued that `3/4 (1-g) sigma_s` fails the isotropic diffuse-light identity (`S = sigma_s` at `g = 0`), which is true of the thin, weakly scattering limit; but the adversarial check compared both closures against exact transport (Chandrasekhar H-function) for opaque white films and found the Eddington form 5-10 times closer than `S = sigma_s`. Semi-infinite isotropic diffuse-incidence reflectance R∞ (adversarial check, python3 -I, Chandrasekhar H-function for the exact value):

| σ_a/σ_s | exact transport | KM with S = σ_s | KM with Eddington S = ¾σ_s − σ_a/4 |
|---|---|---|---|
| 0.001 | 0.9297 | 0.9387 | 0.9296 |
| 0.01 | 0.7955 | 0.8190 | 0.7939 |
| 0.05 | 0.6043 | 0.6417 | 0.5975 |
 The pair satisfies `K(K + 2S) = 3 sigma_a (sigma_a + sigma_s')` (derivation by the spike, unsourced).

Sources read: F. Curiel, W. E. Vargas, R. G. Barrera, Applied Optics 41(28), 5969-5978 (2002) (`S = 2(1 - sigma_d) s`, `K = 2k`, film solution, interface term; independent scattering degrades above filling fraction about 0.10 for 0.25 um rutile); Levinson, Berdahl, Akbari, LBNL draft "Solar Spectral Optical Properties of Pigments, Part II" (10 Feb 2005, marked do-not-quote, support only). Context, not adopted: Schirmacher and Ruocco preprint (different K, S convention); Zeller arXiv:2603.09139 (preprint). Unverified: Vargas and Niklasson 1997 and Mudgett and Richards 1971 (abstract or bibliographic data only); the Curiel DOI.

Numeric tests (film formula, computed, not published values): `S=2,K=0,X=0.5,Rg=0 -> 0.5` (and `Rg=1 -> 1.0`); `S=1,K=0.75,X=1,Rg=0 -> 0.2977637056984597` (`Rg=0.5 -> 0.3250749871241361`); `S=10,K=0.5,X=100,Rg=0.3 -> 0.7298437881283575` (= R_inf). Limits for the model card: crowding above PVC about 0.10 is outside independent scattering; two-flux holds for optically thick films; no size distribution (BLOCKED-3).

## Q2: constants of `configs/materials.yaml`

Status vocabulary is the plan-01 schema (literature / vendor / scenario); snippet-only values are stored as `scenario` with "secondary" in the source string. Sources are shortened here; the full text is in the YAML.

| key | value | unit | source | status |
|---|---|---|---|---|
| tio2.diameter_um | 0.25 | um | secondary, scenario midpoint of 0.2-0.3 um: PCI Magazine 'TiO2 Basics for Paint Appearance and Performance' (pcimag.com/articles/83622; page returned 403, text seen only in a search snippet: well-dispersed TiO2 scatters visible... | scenario |
| baso4.diameter_um | 1.0 | um | Solvay Blanc Fixe product page (solvay.com/en/brands/blanc-fixe, fetched): average particle size 0.7 / 0.8 / 1 / 1.7 / 4 um by grade; 1.0 um = grade HD 80, the grade choice is a scenario choice | vendor |
| baso4.n | 1.64 | 1 | scenario constant, k = 0 assumed (no tabulated BaSO4 n,k in refractiveindex.info-database or any reachable source). Secondary: Solvay product text seen only in a search snippet, 'refractive index (1.64 of BaSO4)' | scenario |
| binder.n | 1.48 | 1 | secondary (snippet): PCI Magazine 'Hollow Latex Particles: Binders That Provide Opacity' (pcimag.com/articles/88550; page returned 403, text seen only in a search snippet: n = 1.48 for the acrylic binder). 1.49-1.50 could not b... | scenario |
| substrate.r_solar | 0.65 | 1 | scenario for bare mill-finish aluminium sheet, bounds 0.55-0.75 (ruling R3). No CRRC/ENERGY STAR/LBNL/ORNL value found; the ATAS guide lists mill finish aluminium as N/A. Galvalume manufacturer values were not used. Needs a bla... | scenario |
| substrate.emissivity | 0.09 | 1 | secondary: Engineering Toolbox emissivity table (engineeringtoolbox.com/emissivity-coefficients-d_447.html, page fetched): 'Aluminum Commercial sheet 0.09' at about 300 K. A generic engineering table, not a roofing test; that i... | scenario |
| substrate.c_j_m2k | 1218.9 | J/(m2 K) | secondary: rho * cp * thickness = 2730 kg/m3 * 893 J/(kg K) * 0.0005 m (arithmetic exact). Alloy 3003 density and specific heat seen in a supplier datasheet search snippet (supplier not captured); the 0.5 mm sheet thickness is... | scenario |
| coating.emissivity | 0.87 | 1 | secondary (vendor-reported via search snippet): APOC 252 Sunwhite brochure on buildsite.com, CRRC-reported initial thermal emittance 0.87, weathered 0.90; the PDF was not opened. Verify against the PDF before citing | scenario |
| topcoat.mu_per_um | 0.002 | 1/um | scenario, bounds 0.0005-0.01, no source: a dense silica film (n about 1.45) is nearly transparent over 0.3-2.5 um, exp(-mu d) = 0.99-0.999 for 1-5 um at 0.002. Replace with a measured film transmittance | scenario |
| wetting.theta_silica_deg | 30 | deg | scenario, range 6-60, anchored on Xia et al. RSC Adv. 2018, 8, 6091 (DOI 10.1039/c7ra12817g; fully condensed hydrophilic silica 6 deg, base-catalysed recipe) and Vishnevskiy et al. Polymers 2025 (MTEOS/TEOS 34.8 deg at CH3/Si 0... | scenario |
| wetting.theta_mtes_deg | 100 | deg | scenario, range 90-110, anchored on 112.2 deg (Vishnevskiy et al. Polymers 2025, CH3/Si 1.0, porous, 400 C bake); other values seen only in search summaries. Means a mostly MTES-derived film | scenario |
| wetting.theta_binder_deg | 75 | deg | secondary (search summary): US patent comparative examples of acrylic latex films, 73 and 81 deg (patent number not retained); scenario, range 65-85; no value for a cured acrylic roof coating found. Needs a goniometer measurement | scenario |
| wetting.r_max | 1.5 | 1 | scenario upper corner of Wenzel roughness (r = actual/projected area); sprayed pigmented topcoat plausibly 1.1-1.5; no source | scenario |
| wetting.f_solid_min | 0.5 | 1 | scenario lower bound of the Cassie solid fraction; no hierarchical texture is modelled so 0.5 does not assert superhydrophobicity; no source | scenario |
| barrier.eps_lo | 0.05 | 1 | scenario shape constant of the network porosity-like index, not a measured porosity; no source | scenario |
| barrier.eps_hi | 0.4 | 1 | scenario shape constant of the network porosity-like index, not a measured porosity; no source | scenario |
| barrier.h_c0_primer_um | 1.0 (SUPERSEDED by R4: 5.0) | um | scenario, deliberately conservative: organosilica films crack-free to at least 1.25 um (secondary, search summary of a koreascience.kr paper, not opened) | scenario |
| barrier.h_c0_top_um | 0.3 (SUPERSEDED by R4: 50.0) | um | scenario: Lei et al., J. Am. Ceram. Soc. 103, 70 (2019), PMC7316397, 'critical thickness of sol-gel derived thin films is about a few hundred nanometers' (read); 0.3 um is the scenario pick | scenario |
| barrier.crack_exponent | 1.0 | 1 | scenario, sensitivity 0.5-2, encodes denser network cracking at lower thickness; not measurable | scenario |
| barrier.t_ref_rel | 1.0 (SUPERSEDED by R4: 100.0) | 1 | scenario normalisation of the ingress time, first value, re-frozen by R4; no source | scenario |
| sol_gel.k_h | 0.15 | L/(mol s) | scenario, range 0.03-6, order of magnitude only; a pseudo-first-order constant per [H+] with water folded in, k_h = k_H 10^-pH. Anchored on Aelion, Loebel, Eirich, J. Am. Chem. Soc. 72, 5705 (1950) as quoted in the Polymers 201... | scenario |
| sol_gel.k_c | 1e-05 | 1/s | scenario, range 1e-6 to 1e-4, a model constant not an elementary rate constant; chosen so reference gel time is 1-3 days; no source | scenario |
| sol_gel.t_end_s | 2592000.0 | s | scenario horizon of 30 days, derived by running the bisection model; brackets gel times of 17 h to 7 d with margin; no source | scenario |
| cost.rc_primer | 1.0 | relative per area | scenario relative cost index (mid-coat = 1), no prices used (BLOCKED-4) | scenario |
| cost.rc_mid | 1.0 | relative per area | scenario relative cost index (mid-coat = 1), no prices used (BLOCKED-4) | scenario |
| cost.rc_top | 1.5 | relative per area | scenario relative cost index (mid-coat = 1), specialty silane topcoat, no prices used (BLOCKED-4) | scenario |
| baseline_corrosion_risk | 1.0 | 1 | scenario convention: bare aluminium sheet without barrier = 1 (relative index; literature found covers AA2024/AA6xxx, none for AA3003) | scenario |
| unc.diameter_rel | 0.1 | relative | scenario: supplier d50 tolerance plus size-distribution width; no source | scenario |
| unc.n_rel | 0.03 | relative | scenario: spread among tabulated refractive indices; no source | scenario |
| unc.mu_rel | 0.2 | relative | scenario: transferred extinction-type coefficient, least certain; no source | scenario |
| unc.eps_rel | 0.3 | relative | scenario: eps is a proxy index spanning 0.05-0.40; no source | scenario |
| unc.h_c0_rel | 0.4 | relative | scenario: cracking threshold varies 2x-4x with cure and recipe in the sources read; no source | scenario |
| unc.substrate_r_abs | 0.05 | absolute | scenario: mill-finish aluminium has no citable value (BLOCKED-8) | scenario |
| unc.theta_deg | 10 | deg | scenario: spread of reported contact angles is 8-25 deg; 10 is a conservative lower pick | scenario |

Notes. `baso4.n` is an addition to the brief's key list (BaSO4 rule: constant n, k = 0). Ruling R3 (binding): no citable CRRC, ENERGY STAR, LBNL or ORNL value for bare mill-finish aluminium was found (the ATAS guide lists it N/A), so `substrate.r_solar` 0.65 (bounds 0.55-0.75) is a scenario, Galvalume values (0.58-0.78, 0.06-0.08) are not used, and BLOCKED-8 stays open with a blank-coupon measurement as its unblock condition; the CRRC directory itself was not queried. Corrosion: the proxy is a relative index for pitting and crevice attack of aluminium under chloride (barrier plus GPTES adhesion), not zinc loss; the literature found covers AA2024 and AA6xxx, none for AA3003. Unverified: the PCI Magazine, APOC and interlockroofing pages (403 or not opened), the 3003 datasheet supplier, Pohl and Osterholtz 1985, Assink and Kay numbers, Schmidt, and the J. Sol-Gel Sci. Technol. 2022 TEOS-MTES paper. All `unc.*` and `cost.*` values are proposals.

## Q3: sol-gel kinetics (TEOS/GPTES, acid)

No source opened gives `k_H` for TEOS or GPTES in the model's form. Order of magnitude from secondary values: Aelion, Loebel, Eirich, J. Am. Chem. Soc. 72, 5705 (1950), TEOS in dioxane at 20 C, 3.06 per M HCl per min as quoted by the Polymers 2019, 11, 537 review (the review's exponent sign looks like a typo; original not read); the review also quotes 4.6 and 6.1 per M per min at 39 C and activation energies of 31-33 kJ/mol. With water about 3 M folded in: scenario `k_H = 0.15 L/(mol s)` (range 0.03-6), so `k_h = k_H 10^-pH` is 8.4e-6 /s at pH 4.25. GPTES: no value found; GPTMS aqueous data (0.026 /min at pH 5.4, search summary only) is not comparable; scenario ratio about 3 (range 1-10), not modelled separately. `k_c = 1e-5 /s` is a model constant (scenario, 1e-6 to 1e-4). `t_end_s = 2.592e6` (30 d).

Gel-time check (bisection model, `k_H = 0.15`, `k_c = 1e-5`, `p_c = 1/3`): 17.57 h at pH 3.5, 40.99 h at pH 4.25, 122 h at pH 5, all inside the 30 d horizon. Correction of the spike's wording: at pH 5 with `k_H = 0.03` the gel time is about 17 d, which is also inside the 30 d horizon; it does not "never gel". Caveats: GPTES epoxy ring opening below pH 4 (Wacker data sheet, search summary) is not modelled; gel times are proxy-level.

## Q4: public data sources

Fetched by `bun run spandek fetch-data` (read-only GET, https only, 5 MB cap, no redirects), frozen in `data/literature/SHA256SUMS`, checked by `bun run spandek verify-data`.

| file | URL | licence / status | sha256 |
|---|---|---|---|
| raw/ASTMG173.csv | https://raw.githubusercontent.com/pvlib/pvlib-python/main/pvlib/data/ASTMG173.csv | pvlib repo BSD-3; **redistributed copy** of the NREL/ASTM G173-03 file, byte identity with NREL unproven, NREL terms not retrieved (NREL hosts did not resolve from the spike sandbox); cite NREL/ASTM G173-03 as origin | 91964ac23c0ec82dbbda4a7f160a5f5faf551dfe18ffae7e2446d74b57ee7859 |
| raw/TiO2_Bond-o.yml | https://raw.githubusercontent.com/polyanskiy/refractiveindex.info-database/main/database/data/main/TiO2/nk/Bond-o.yml | database CC0 1.0 | 0483ad44352fb5e3d94ac33da41339c2ae596c9e5e430f25684578e2196515d0 |
| raw/TiO2_Bond-e.yml | same base, `Bond-e.yml` | CC0 1.0 | c00a4f91f4891163ba6ecf4eb4dc8093f2654d17da3d69e7d13e6163b01af94f |
| raw/TiO2_Siefke.yml | same base, `Siefke.yml` (350 nm ALD film, not crystal rutile) | CC0 1.0 | 9b03947949e54cd98f58a989bd031a5fddb1a36a9d9f7fd64d5ff2bd68c2885c |
| g173_global_tilt.csv | converted (nm to um, W/m2/nm to W/m2/um, global tilt column) | derived | a925ccd35f79bd282beaadd3bb16ccff2e59142a5efb31807f8f8b0936234c88 |
| tio2_rutile_bond_o.csv / _e.csv | converted | derived | 326884109280a9c9c012400b8f8d04a050e59adc64a580860e0e6d3b1590c2be / 590353131c14bf77d7ffb1a58734da0e6d33964d8e60c1733f88e65ed636be20 |
| tio2_ald_film_siefke_0p3_2p5.csv | converted, clipped 0.3-2.5 um | derived | 0975fd2e1a7f27203d9f69e00ddcb0ff43d5a501d25a19d7da605b3e2f8066ff |
| tio2_nk.csv | assembled by rule R2 | derived | 31ec1136e53b0c165a4de5c0d47118a218f36cd64d6ed2182fe7a4e290cce27c |

The trapezoid integral of the global-tilt CSV is 1000.37 W/m2 (the pvlib documentation says "about 1000.37 W/m2", read; test `g173IntegralIs1000p37`, tolerance 0.005).

**TiO2 table rule R2 (binding).** Below 0.45 um the Siefke film n,k (scenario: rutile crystal data stop at 0.43-0.45 um, the UV edge carries 3-5 % of solar energy, film values differ from crystal); from 0.45 um the mean of Bond ordinary and extraordinary n with k = 0 (assumption: transparent range, k not tabulated). The join at 0.45 um is a step in n (film 2.56 to crystal mean 2.98), accepted and labelled. **BaSO4**: not in the refractiveindex.info database (tree of 5333 entries searched), no other reachable table; constant `n = 1.64`, `k = 0`, scenario.

Limits: the TiO2 table starts at 0.300 um and ends at 2.4 um, and `nkAt` clamps outside it (below 0.3 um and above 2.4 um); the binder and BaSO4 are constants. The Mie code must evaluate on the grid wavelengths of the G173 spectrum, using `nkAt` at those wavelengths. Not checked: NREL's own file and terms; PMMA data (not fetched); Devore 1951 (not needed by R2).

## Ruling R4: shape constants of the barrier and delamination proxies

`barrier.h_c0_primer_um`, `barrier.h_c0_top_um`, `barrier.t_ref_rel` are model-shape constants (status scenario, not measurable). With the first values (1.0 um, 0.3 um, t_ref 1) the crack index saturated at 1.0 over most of the plan-1 grid, delamination was about 1 everywhere, and `corrosion_risk` fell monotonically in GPTES (no interior optimum). Re-frozen by a throwaway grid search (formulas D5/D7 unchanged) under four criteria: (a) over primer DFT 2-12 um x GPTES 0.2-0.8, at least 30 % of crack values below 0.9 and at least 30 % above 0.1; (b) `corrosion_risk` has an interior minimum in GPTES at 6 um primer DFT within 0.35-0.65; (c) delamination over topcoat DFT 3-20 um x MTES 0.2-0.8 spans below and above 0.5, is non-decreasing in MTES and in DFT; (d) all in [0, 1].

Chosen: `h_c0_primer_um` = 5.0, `h_c0_top_um` = 50.0, `t_ref_rel` = 100.0; `crack_exponent` = 1.0 and `eps_lo`/`eps_hi` = 0.05/0.4 unchanged. Minimum of `corrosion_risk` at 6 um is at GPTES about 0.47. The interior optimum is the assumed blueprint-H1 shape, tuned in; it is not evidence for H1. Test: `shapeConstantsKeepProxiesInformative`.

R4 caveats (from the Task 7-8 review): `h_c0_top_um` = 50 um overrides the Lei et al. 2019 anchor (a few hundred nm) by about two orders of magnitude, so a 3-20 um silane topcoat counts as crack-safe in this proxy and the delamination proxy no longer reflects that anchor. The interior optimum of `corrosion_risk` in GPTES exists only near 6 um primer DFT (argmin 0.47); at 2 and 4 um it is at the 0.2 edge and at 8 and 12 um at the 0.8 edge, so plan 3 statements about "the optimum" depend on the DFT. `delamination.ts` and `optics.ts` accept topcoat DFT 0 (no topcoat) although D9 says 3-20 um; plan 3 enforces 3-20 um at the layer level.

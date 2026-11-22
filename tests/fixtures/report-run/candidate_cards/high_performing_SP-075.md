# Candidate card SP-075 (high_performing)

Initial-state predictions from uncalibrated scenario models. Every PROXY number is a relative index, and every interval covers parameter uncertainty only.

### Candidate ID

SP-075 (role: high_performing)

### Primer chemistry

GPTES:TEOS mole fraction 0.62:0.38, target dry film thickness 7.8 µm.

### Midcoat

TiO2:BaSO4 volume ratio 0.78:0.22, total PVC 0.338, target DFT 205 µm.

### Topcoat

MTES:TEOS mole fraction 0.62:0.38, target DFT 3.9 µm.

### Predictive outcome

Scenario means over the 9 weather scenarios (day-2 peak temperatures), interval = p5–p95 parameter uncertainty (mean of the per-scenario bounds).

| Quantity | Value |
|---|---|
| Solar reflectance r_solar, initial | 0.944 [0.942, 0.947] |
| Peak surface temperature, mean of scenarios (°C) | 31.2 [31.1, 31.3] |
| Peak surface temperature, hottest scenario W9 (°C) | 35.4 [35.3, 35.5] |
| Mean heat flux into the building q_in (W/m²) | 0.0 [-0.1, 0.1] |
| Corrosion index (PROXY) | 0.701 [0.595, 0.827] |
| Water-repellence index (PROXY) | 0.000 [0.000, 0.347] |
| Contact angle (PROXY, uncalibrated, deg) | 73.2 [64.3, 110.8] |
| Delamination index (PROXY) | 0.382 [0.381, 0.382] |
| Cost index (PROXY) | 0.639, nominal only (no interval) |
| Relative gel time of the primer sol | 1.032, nominal only (no interval) |

Contact angle: the blueprint 8.1 target of 110° is not reached by the nominal prediction (73.2°, upper bound 110.8°). Contact angle and sliding are lab-verified.

Controls (nominal values from the same models or the datasheet; scenario means; no interval):

| Control | r_solar | Peak temperature (°C) |
|---|---|---|
| C0 bare aluminium substrate | 0.650, nominal, no interval | 45.6, nominal, no interval (not modelled: wetting_proxy, wetting_theta_pred, delam_proxy, gel_time_rel) |
| C1 commercial datasheet (APOC 252 Sunwhite (CRRC brochure, US product, not an Indonesian datasheet)) | 0.900, datasheet, no interval | 32.6, nominal, no interval (thermal model on datasheet values) |
| C2 primer + midcoat (no topcoat) | 0.959, nominal, no interval | 30.7, nominal, no interval (not modelled: delam_proxy) |
| C3 midcoat + topcoat (no primer) | 0.944, nominal, no interval | 31.2, nominal, no interval (not modelled: gel_time_rel) |
| C4 this candidate | 0.944, nominal, no interval | 31.2, nominal, no interval |

### Limit / risk

Static model limits:

- Optics assume independent scattering (no dependent-scattering correction); no NIR binder absorption is modelled and R is held outside the 300–2500 nm range.
- The wind level of 6 m/s is beyond the usual McAdams range of the convection correlation (about 5 m/s).
- Every PROXY index is uncalibrated: a relative ranking number, not a measurement and not a probability.
- Intervals are parameter-uncertainty only (p5–p95 over the uncertainty draws of the uncertain inputs); they exclude model-form error and are not prediction intervals for a real roof.
- The sol-gel water ratio has no effect in the range 1–5 in the model.
- Sol-gel condensation is taken as pH-independent in the model.
- Contact angle and sliding angle are lab-verified quantities; the smooth-film model rarely reaches 110°.
- Adhesion is unknown, binder compatibility is unknown, and optical constants for several materials are missing (scenario values stand in).
- All values are initial (as-applied); weathering and adhesion are not modelled and ageing is not measured (the Indonesia section, when present, shows it only as a labelled scenario).

Scenario constants used (status: scenario, i.e. assumed, not measured):

- tio2.diameter_um = 0.25 um
- baso4.n = 1.64
- binder.n = 1.48
- substrate.r_solar = 0.65
- substrate.emissivity = 0.09
- substrate.c_j_m2k = 1218.9 J/(m2 K)
- coating.emissivity = 0.87
- topcoat.mu_per_um = 0.002 1/um
- wetting.theta_silica_deg = 30 deg
- wetting.theta_mtes_deg = 100 deg
- wetting.theta_binder_deg = 75 deg
- wetting.r_max = 1.5
- wetting.f_solid_min = 0.5
- barrier.eps_lo = 0.05
- barrier.eps_hi = 0.4
- barrier.h_c0_primer_um = 5 um
- barrier.h_c0_top_um = 50 um
- barrier.crack_exponent = 1
- barrier.t_ref_rel = 100
- sol_gel.k_h = 0.15 L/(mol s)
- sol_gel.k_c = 0.00001 1/s
- sol_gel.t_end_s = 2592000 s
- cost.rc_primer = 1 relative per area
- cost.rc_mid = 1 relative per area
- cost.rc_top = 1.5 relative per area
- baseline_corrosion_risk = 1
- unc.diameter_rel = 0.1 relative
- unc.n_rel = 0.03 relative
- unc.mu_rel = 0.2 relative
- unc.eps_rel = 0.3 relative
- unc.h_c0_rel = 0.4 relative
- unc.substrate_r_abs = 0.05 absolute
- unc.theta_deg = 10 deg
- weather.irradiance_w_m2 = [600,800,1000] W/m2 peak irradiance (half-sine 06:00-18:00)
- weather.t_air_c = [28,32,36] degC held constant
- weather.wind_m_s = [1,3,6] m/s
- weather.roof.c_substrate_j_m2k = 1218.9 J/m2K
- weather.roof.rho_c_coating_j_m3k = 1800000 J/m3K
- weather.roof.r_total_m2k_w = 0.3 m2K/W
- weather.roof.t_inside_c = 30 degC

### Decision

go

go to coupon lab. This means the candidate is worth a coupon test, not that it performs on a roof.

Rule inputs: pareto frequency 1.00 (go needs at least 0.5), mean r_solar 0.944 against C1 0.900, delamination index 0.382 (go needs at most 0.5), r_solar upper bound 0.947 against substrate 0.650.

export const DESIGN_COLUMNS = [
  "candidate_id",
  "primer_gptes_molfrac",
  "primer_dft_um",
  "midcoat_pvc",
  "midcoat_tio2_fraction",
  "midcoat_dft_um",
  "topcoat_mtes_molfrac",
  "topcoat_dft_um",
] as const
export const DESIGN_FLAG_COLUMNS = ["feasible", "violations"] as const

export const RESULT_COLUMNS = [
  ...DESIGN_COLUMNS,
  "scenario_id",
  "r_solar_pred",
  "r_solar_lo",
  "r_solar_hi",
  "t_max_pred",
  "t_max_lo",
  "t_max_hi",
  "corrosion_proxy",
  "corrosion_proxy_lo",
  "corrosion_proxy_hi",
  "wetting_proxy",
  "wetting_proxy_lo",
  "wetting_proxy_hi",
  "wetting_theta_pred",
  "wetting_theta_lo",
  "wetting_theta_hi",
  "q_in_mean_w_m2",
  "q_in_mean_w_m2_lo",
  "q_in_mean_w_m2_hi",
  "delam_proxy",
  "delam_proxy_lo",
  "delam_proxy_hi",
  "cost_proxy",
  "gel_time_rel",
  "feasible",
] as const

export const NOT_NAN = new Set<string>([
  ...DESIGN_COLUMNS,
  "scenario_id",
  "feasible",
])
export const RESULT_NAN_COLUMNS: ReadonlySet<string> = new Set(
  RESULT_COLUMNS.filter((c) => !NOT_NAN.has(c)),
)

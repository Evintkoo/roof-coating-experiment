// Plan 09 FR-8: the through-thickness drawing holds only what the model has: the surface temperature, the inside temperature and the
// model's own conduction law q = (T_s - T_in) / R_total. There is no temperature per layer in any model of the repo (BLOCKED-19).
import { PhysicsRangeError } from "../errors"

export type Drop = { qWM2: number; tSurfaceK: number; tInsideK: number }

export function conductionDrop(
  tSurfaceK: number,
  tInsideK: number,
  rTotal: number,
): Drop {
  if (!(Number.isFinite(tSurfaceK) && Number.isFinite(tInsideK)))
    throw new PhysicsRangeError(
      "t_surface_k",
      "profile: temperatures must be finite",
    )
  if (!(Number.isFinite(rTotal) && rTotal > 0))
    throw new PhysicsRangeError(
      "r_total_m2k_w",
      "profile: R_total must be positive",
    )
  return { qWM2: (tSurfaceK - tInsideK) / rTotal, tSurfaceK, tInsideK }
}

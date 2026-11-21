import type { Materials } from "../config"
import { requireIn } from "./ranges"
import { crackIndex } from "./shared"

/** Topcoat DFT domain (um); 0 = no topcoat (nothing to delaminate from cracks). Blueprint 3.3 gives 3-20 um. */
const TOP_DFT_MAX_UM = 20

/**
 * PROXY: delamination index of the topcoat, plan 02 D7: 1 - (1 - y^2)(1 - crack_top), y = MTES fraction,
 * crack_top from h_c0_top and rho_net_top = 1 - y. Stands for blueprint H3's direction (more MTES, more
 * delamination) by assumption; it is not evidence for it.
 */
export function delaminationProxy(
  yMtes: number,
  topDftUm: number,
  mat: Materials,
): number {
  requireIn("delamination", "yMtes", yMtes, 0, 1)
  requireIn("delamination", "topDftUm", topDftUm, 0, TOP_DFT_MAX_UM)
  const crackTop = crackIndex(
    1 - yMtes,
    topDftUm,
    mat.barrier.h_c0_top_um.value,
    mat.barrier.crack_exponent.value,
  )
  return 1 - (1 - yMtes * yMtes) * (1 - crackTop)
}

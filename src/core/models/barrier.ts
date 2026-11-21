import type { Materials } from "../config"
import { requireIn } from "./ranges"
import { crackIndex } from "./shared"

/** Primer DFT domain (um), plan 02 D9 / blueprint 3.3. */
const PRIMER_DFT_MIN_UM = 2
const PRIMER_DFT_MAX_UM = 12

export type BarrierResult = {
  perm_index: number
  crack_index: number
  corrosion_risk: number
  proxy: true
}

/**
 * PROXY: barrier indices of the GPTES primer, plan 02 D5. rho_net = 1 - x; eps = eps_lo + (eps_hi - eps_lo) x;
 * D_eff = eps^1.5; t_ing = L^2 / (6 D_eff); perm = 1 / (1 + t_ing / t_ref); crack from shared.crackIndex;
 * corrosion_risk = 1 - (1 - perm)(1 - crack). This encodes blueprint H1's shape by assumption;
 * it is not evidence for it. Larger x raises perm_index (more open network) and lowers crack_index.
 */
export function barrier(
  xGptes: number,
  dftUm: number,
  mat: Materials,
): BarrierResult {
  requireIn("barrier", "xGptes", xGptes, 0, 1)
  requireIn("barrier", "dftUm", dftUm, PRIMER_DFT_MIN_UM, PRIMER_DFT_MAX_UM)
  const b = mat.barrier
  const eps = b.eps_lo.value + (b.eps_hi.value - b.eps_lo.value) * xGptes
  const dEff = eps ** 1.5
  const tIng = (dftUm * dftUm) / (6 * dEff)
  const perm = 1 / (1 + tIng / b.t_ref_rel.value)
  const crack = crackIndex(
    1 - xGptes,
    dftUm,
    b.h_c0_primer_um.value,
    b.crack_exponent.value,
  )
  return {
    perm_index: perm,
    crack_index: crack,
    corrosion_risk: 1 - (1 - perm) * (1 - crack),
    proxy: true,
  }
}

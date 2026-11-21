import { requireIn } from "./ranges"

const BIG = Number.MAX_VALUE

/**
 * Crack index: h_c = h_c0 * rho_net^(-p); crack = 1 - exp(-(L/h_c)^2).
 * rho_net = 0 gives h_c = Infinity, so crack = 0 for any finite DFT (no net density, nothing to crack).
 */
export function crackIndex(
  rhoNet: number,
  dftUm: number,
  hC0Um: number,
  exponent: number,
): number {
  requireIn("crackIndex", "rhoNet", rhoNet, 0, 1)
  requireIn("crackIndex", "dftUm", dftUm, 0, BIG)
  requireIn("crackIndex", "hC0Um", hC0Um, Number.MIN_VALUE, BIG)
  requireIn("crackIndex", "exponent", exponent, Number.MIN_VALUE, BIG)
  const hC = hC0Um * rhoNet ** -exponent
  const r = dftUm / hC
  return -Math.expm1(-(r * r))
}

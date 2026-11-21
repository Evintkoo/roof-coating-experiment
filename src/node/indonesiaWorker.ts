// Worker entry for runIndonesia (plan 04 Task 5, reusing the plan-3 worker pattern of simWorker.ts). Evaluates a contiguous
// slice of evaluation indices: index 0 is the nominal pass (it also runs the 96 nominal candidates), index i >= 1 is
// uncertainty draw i - 1 (material draw i - 1 of plan 3 D4 and ageing loss i - 1). No logic of its own beyond marshalling.

import { SpandekError } from "../core/errors"
import { type Level, setEventSink } from "../core/events"
import type { HourlySeries } from "../core/indonesia/series"
import { simulateSeriesDay } from "../core/models/thermalSeries"
import type { ModelContext } from "../core/pipeline/context"
import {
  CONTROL_LAYERS,
  type StackProps,
  stackProps,
} from "../core/pipeline/stackProps"
import { drawMaterials } from "../core/pipeline/uncertainty"
import { deriveSeed, Xoshiro128 } from "../core/rng"
import type { FlaggedDesignRow } from "../core/schema"

/** Uncertain subjects in output order: C0, C1, then the three cards (shortlist order high, balanced, low). */
export const N_UNCERTAIN = 5
export const STATES = 2
/** t_max_c and q_in_mean_w_m2. */
export const OUT = 2
/** Seed stream of the ageing-loss draws (plan 04 D8; plan 01 D13 registry). */
export const LOSS_STREAM = 400

export type IndonesiaJob = {
  ctx: ModelContext
  /** The three shortlisted candidates (high, balanced, low), each evaluated as its C4 system. */
  cards: FlaggedDesignRow[]
  /** All 96 candidates in candidate_id order; infeasible ones are left out of the evaluation (NaN rows). */
  candidates: FlaggedDesignRow[]
  days: HourlySeries[]
  nMc: number
  seed: number
  lossLo: number
  lossHi: number
  lo: number
  hi: number
  forwardDebug: boolean
}
type EventFields = Record<string, string | number | boolean>
export type IndonesiaMsg =
  | {
      type: "events"
      list: { event: string; level: Level; fields: EventFields }[]
    }
  | { type: "eval"; idx: number }
  | {
      type: "done"
      /** Per evaluation: [subject][state][day][t_max_c, q] (N_UNCERTAIN * STATES * S * OUT). */
      data: Float64Array
      /** Only when the slice holds evaluation 0: the nominal block of the candidates, [candidate][state][day][t, q]. */
      nominal: Float64Array | null
      /** Only when the slice holds evaluation 0: effective reflectance [subject][state] then [candidate][state]. */
      rEff: Float64Array | null
    }
  | {
      type: "error"
      error: { code?: number; phase?: string; key?: string; message: string }
    }

/** Ageing losses of the nMc draws (uniform in [lo, hi]); the nominal evaluation uses the midpoint. */
export function lossDraws(
  seed: number,
  nMc: number,
  lo: number,
  hi: number,
): Float64Array {
  const rng = new Xoshiro128(deriveSeed(seed, LOSS_STREAM))
  const out = new Float64Array(nMc)
  for (let i = 0; i < nMc; i++) out[i] = lo + (hi - lo) * rng.next()
  return out
}

type Thermal = Pick<StackProps, "r_solar" | "emissivity" | "c_a_j_m2k">

/** The five uncertain subjects of one evaluation (state 0 initial, 1 aged), as thermal inputs. */
function subjects(
  cards: readonly FlaggedDesignRow[],
  ctx: ModelContext,
  mat: ModelContext["mat"],
  loss: number,
): Thermal[][] {
  const c0 = stackProps(
    cards[0] as FlaggedDesignRow,
    CONTROL_LAYERS.C0,
    ctx,
    mat,
  )
  const k = ctx.controls
  const out: Thermal[][] = [
    // C0 bare aluminium: no substrate ageing is modelled (BLOCKED-9)
    [c0, c0],
    // C1: its own datasheet weathered values, not the loss draw
    [
      {
        r_solar: k.c1_r_solar.value,
        emissivity: k.c1_emissivity.value,
        c_a_j_m2k: ctx.weather.roof.c_substrate_j_m2k.value,
      },
      {
        r_solar: k.c1_r_solar_aged.value,
        emissivity: k.c1_emissivity_aged.value,
        c_a_j_m2k: ctx.weather.roof.c_substrate_j_m2k.value,
      },
    ],
  ]
  for (const card of cards)
    out.push(aged(stackProps(card, CONTROL_LAYERS.C4, ctx, mat), loss))
  return out
}

/** [initial, aged]: the loss applies to the coating's effective reflectance only; emissivity and capacity are unchanged. */
function aged(sp: StackProps, loss: number): Thermal[] {
  return [sp, { ...sp, r_solar: sp.r_solar * (1 - loss) }]
}

const w = self as unknown as {
  onmessage: ((e: MessageEvent<IndonesiaJob>) => void) | null
  postMessage: (m: IndonesiaMsg, transfer?: Transferable[]) => void
}

w.onmessage = (e) => {
  const job = e.data
  let buffered: { event: string; level: Level; fields: EventFields }[] = []
  const flush = () => {
    if (buffered.length === 0) return
    w.postMessage({ type: "events", list: buffered })
    buffered = []
  }
  setEventSink((event, level, fields) => {
    if (level === "debug" && !job.forwardDebug) return
    buffered.push({ event, level, fields })
  })
  try {
    const { ctx, cards, candidates, days, lo, hi } = job
    const S = days.length
    const roof = ctx.weather.roof
    const hA = ctx.weather.h_conv_a.value
    const hB = ctx.weather.h_conv_b.value
    const tIn = roof.t_inside_c.value + 273.15
    const rTot = roof.r_total_m2k_w.value
    const mats = drawMaterials(ctx.mat, job.nMc, deriveSeed(job.seed, 100))
    const losses = lossDraws(job.seed, job.nMc, job.lossLo, job.lossHi)
    const mid = 0.5 * (job.lossLo + job.lossHi)
    const sim = (t: Thermal, s: number): [number, number] => {
      const r = simulateSeriesDay(
        {
          r_solar: t.r_solar,
          emissivity: t.emissivity,
          t_inside_k: tIn,
          r_total_m2k_w: rTot,
          c_a_j_m2k: t.c_a_j_m2k,
        },
        days[s] as HourlySeries,
        hA,
        hB,
      )
      return [r.t_max_c, r.q_in_mean_w_m2]
    }
    const perEval = N_UNCERTAIN * STATES * S * OUT
    const data = new Float64Array((hi - lo) * perEval)
    let nominal: Float64Array | null = null
    let rEff: Float64Array | null = null
    for (let idx = lo; idx < hi; idx++) {
      const mat = (idx === 0 ? ctx.mat : mats[idx - 1]) as ModelContext["mat"]
      const loss = idx === 0 ? mid : (losses[idx - 1] as number)
      const subj = subjects(cards, ctx, mat, loss)
      let o = (idx - lo) * perEval
      subj.forEach((states) => {
        for (const t of states)
          for (let s = 0; s < S; s++) {
            const [tm, q] = sim(t, s)
            data[o++] = tm
            data[o++] = q
          }
      })
      if (idx === 0) {
        const r = new Float64Array(
          N_UNCERTAIN * STATES + candidates.length * STATES,
        )
        for (let u = 0; u < subj.length; u++)
          for (let st = 0; st < STATES; st++)
            r[u * STATES + st] = (subj[u] as Thermal[])[st]?.r_solar as number
        const nom = new Float64Array(candidates.length * STATES * S * OUT).fill(
          Number.NaN,
        )
        let p = 0
        for (let ci = 0; ci < candidates.length; ci++) {
          const c = candidates[ci] as FlaggedDesignRow
          const base = N_UNCERTAIN * STATES + ci * STATES
          if (!c.feasible) {
            r[base] = Number.NaN
            r[base + 1] = Number.NaN
            p += STATES * S * OUT
            continue
          }
          const pair = aged(stackProps(c, CONTROL_LAYERS.C4, ctx, ctx.mat), mid)
          for (let st = 0; st < STATES; st++) {
            const t = pair[st] as Thermal
            r[base + st] = t.r_solar
            for (let s = 0; s < S; s++) {
              const [tm, q] = sim(t, s)
              nom[p++] = tm
              nom[p++] = q
            }
          }
        }
        rEff = r
        nominal = nom
      }
      flush()
      w.postMessage({ type: "eval", idx })
    }
    flush()
    w.postMessage({ type: "done", data, nominal, rEff }, [data.buffer])
  } catch (err) {
    flush()
    w.postMessage({
      type: "error",
      error:
        err instanceof SpandekError
          ? {
              code: err.code,
              phase: err.phase,
              ...(err.key !== undefined ? { key: err.key } : {}),
              message: err.message,
            }
          : { message: err instanceof Error ? err.message : String(err) },
    })
  }
}

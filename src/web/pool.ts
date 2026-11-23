// Worker pool for the live screening (plan 07 D4, D10, H7 to H9): one lane per worker, one candidate (9 cells) per message, results
// placed by task index and never by arrival, newest run wins, a dead or hung lane is visible and its chunk is re-queued, and a
// missing Worker API falls back to one inline lane. No clock decides a number: the schedule changes only who computes what, when.
import type { ScreeningData, ScreenValue } from "../core/anim/screening"
import { mergeOrdered } from "../core/anim/screening"
import { type SweepVar, sweepChunkSafe } from "../core/anim/sweep"
import { contextFromJson } from "../core/pipeline/contextJson"
import type { LiveInputs } from "../core/pipeline/live"

export type Task = { index: number; candidate: number; scenario: number }
export type Run<T> = { done: Promise<T[]>; cancel(): void }
export type LaneState = "idle" | "busy" | "failed"
export type LaneInfo = {
  id: number
  state: LaneState
  tasks: number
  ms: number
  inline: boolean
}
export type PoolStats = { created: number; terminated: number; live: number }
type Fields = Record<string, string | number | boolean>
export type Evaluator = (
  tasks: readonly Task[],
) => { index: number; value: unknown }[]
/** Plan 08 D4: the sweep payload of a run; one task per sweep point (`task.index` indexes `values`). */
export type SweepKind = {
  sweep: {
    base: LiveInputs
    v: SweepVar
    values: readonly number[]
    nDraws: number
    seed: number
  }
}
export type PoolOpts = {
  /** Absent for a pool that only runs sweeps (plan 08). */
  screening?: ScreeningData
  /** null: nominal only (fast); a number: that many material draws per cell (honest "with uncertainty" run). */
  draws?: number | null
  /** The inline lane (F5 and the last resort after every worker failed); built by the page from the same pure functions. */
  inline?: (
    ctxJson: string,
    data: ScreeningData,
    draws: number | null,
  ) => Evaluator
  /** The inline lane for sweeps (plan 08 F6), built by the page from the same pure functions. */
  inlineSweep?: (ctxJson: string, k: SweepKind["sweep"]) => Evaluator
  onEvent?: (name: string, level: "debug" | "info" | "error", f: Fields) => void
  onLane?: (lanes: readonly LaneInfo[]) => void
  /** T_hang_s: a chunk or a start that makes no progress for this long fails its lane (default 10 000 ms). */
  hangMs?: number
}
export type Pool = {
  size: number
  mode: "workers" | "inline"
  run<T = ScreenValue>(
    tasks: readonly Task[],
    onResult: (index: number, v: T) => void,
    kind?: SweepKind,
  ): Run<T>
  lanes(): readonly LaneInfo[]
  stats(): PoolStats
  /** `#test` hook (H9, F6): terminate one worker mid-run as if it had died. */
  killLane(id: number): void
  terminate(): void
}

export class PoolError extends Error {
  constructor(
    readonly reason: "cancelled" | "failed" | "init" | "no_worker",
    message: string,
  ) {
    super(message)
    this.name = "PoolError"
  }
}

/** One task per sweep point (plan 08 D4): task `i` is point `i`, so a chunk of one candidate is one point. */
export function sweepTasks(n: number): Task[] {
  return Array.from({ length: n }, (_, i) => ({
    index: i,
    candidate: i,
    scenario: 0,
  }))
}

/** The inline lane of a sweep (plan 08 F6): the same pure function the worker calls. */
export const inlineSweepLane: NonNullable<PoolOpts["inlineSweep"]> = (
  ctxJson,
  k,
) => {
  const ctx = contextFromJson(ctxJson)
  return (tasks) =>
    sweepChunkSafe(
      ctx,
      k.base,
      k.v,
      k.values,
      tasks.map((t) => t.index),
      k.nDraws,
      k.seed,
    )
}

/** D10: `min(hardwareConcurrency - 1, 6)`, floor 1. */
export function autoSize(hardwareConcurrency: number | undefined): number {
  const n = Number.isFinite(hardwareConcurrency)
    ? (hardwareConcurrency as number)
    : 2
  return Math.max(1, Math.min(Math.floor(n) - 1, 6))
}

/** Consecutive tasks of one candidate form one chunk (spike Q1: stackProps is reused across the scenarios). */
export function chunkByCandidate(tasks: readonly Task[]): Task[][] {
  const out: Task[][] = []
  for (const t of tasks) {
    const last = out[out.length - 1]
    if (last && (last[0] as Task).candidate === t.candidate) last.push(t)
    else out.push([t])
  }
  return out
}

type Lane = {
  id: number
  worker: Worker | null
  evaluator: Evaluator | null
  state: LaneState
  inflight: Task[] | null
  timer: ReturnType<typeof setTimeout> | null
  tasks: number
  ms: number
}
type Msg =
  | { type: "ready" }
  | {
      type: "screened"
      id: number
      out: { index: number; value: unknown }[]
      ms: number
    }
  | { type: "error"; id: number }

export async function createPool(
  size: number | "auto",
  workerUrl: string,
  ctxJson: string,
  opts: PoolOpts,
): Promise<Pool> {
  const hangMs = opts.hangMs ?? 10_000
  const draws = opts.draws ?? null
  const emit = (n: string, l: "debug" | "info" | "error", f: Fields) =>
    opts.onEvent?.(n, l, f)
  const want =
    size === "auto"
      ? autoSize(globalThis.navigator?.hardwareConcurrency)
      : Math.max(1, Math.floor(size))
  const hasWorker = typeof Worker !== "undefined"
  if (!hasWorker && !opts.inline && !opts.inlineSweep)
    throw new PoolError("no_worker", "this browser cannot start workers")
  const n = hasWorker ? want : 1
  const stats = { created: 0, terminated: 0 }
  let lanes: Lane[] = []
  let active: { cancel: () => void } | null = null
  let dead = false
  const info = (): LaneInfo[] =>
    lanes.map((l) => ({
      id: l.id,
      state: l.state,
      tasks: l.tasks,
      ms: l.ms,
      inline: l.worker === null,
    }))
  const publish = () => opts.onLane?.(info())
  const kill = (l: Lane) => {
    if (l.timer) clearTimeout(l.timer)
    l.timer = null
    if (l.worker) {
      l.worker.onmessage = null
      l.worker.onerror = null
      l.worker.terminate()
      l.worker = null
      stats.terminated++
    }
  }

  // Workers that were started but have not said "ready" yet: a cancel terminates them at once (H8), not when they come up.
  const spawning = new Map<Lane, (e: PoolError) => void>()
  const abortSpawning = () => {
    for (const [l, abort] of [...spawning]) {
      kill(l)
      abort(new PoolError("cancelled", "start cancelled"))
    }
    spawning.clear()
  }
  const spawn = (id: number): Promise<Lane> =>
    new Promise((resolve, reject) => {
      if (!hasWorker) {
        emit("pool.fallback", "info", { reason: "no_worker" })
        resolve({
          id,
          worker: null,
          evaluator: null,
          state: "idle",
          inflight: null,
          timer: null,
          tasks: 0,
          ms: 0,
        })
        return
      }
      const w = new Worker(workerUrl)
      stats.created++
      const lane: Lane = {
        id,
        worker: w,
        evaluator: null,
        state: "idle",
        inflight: null,
        timer: null,
        tasks: 0,
        ms: 0,
      }
      const bad = (why: string) => {
        clearTimeout(t)
        spawning.delete(lane)
        kill(lane)
        emit("pool.worker.failed", "error", {
          worker: id,
          reason: why,
          phase: "init",
        })
        reject(new PoolError("init", `worker ${id} did not start (${why})`))
      }
      const t = setTimeout(() => bad("timeout"), hangMs)
      spawning.set(lane, (e) => {
        clearTimeout(t)
        reject(e)
      })
      w.onerror = () => bad("error")
      w.onmessage = (e: MessageEvent<Msg>) => {
        if (e.data.type === "ready") {
          clearTimeout(t)
          resolve(lane)
        } else bad("message")
      }
      w.postMessage({
        type: "init",
        ctxJson,
        ...(opts.screening
          ? { screening: { data: opts.screening, draws } }
          : {}),
      })
    })

  // Lanes are started one batch at a time; a batch that finishes after a cancel (generation changed) is terminated, never adopted.
  let gen = 0
  let starting: Promise<void> = Promise.resolve()
  const startLanes = (): Promise<void> => {
    const step = async (): Promise<void> => {
      const mine = gen
      const missing = n - lanes.filter((l) => l.state !== "failed").length
      if (missing <= 0) return
      const base =
        lanes.length === 0 ? 0 : Math.max(...lanes.map((l) => l.id)) + 1
      const made = await Promise.all(
        Array.from({ length: missing }, (_, i) => spawn(base + i)),
      )
      for (const l of made) spawning.delete(l)
      if (mine !== gen || dead) {
        for (const l of made) kill(l)
        return
      }
      lanes = [...lanes, ...made]
      publish()
    }
    starting = starting.then(step, step)
    return starting
  }
  try {
    await startLanes()
  } catch (e) {
    for (const l of lanes) kill(l)
    throw e
  }

  const pool: Pool = {
    size: n,
    mode: hasWorker ? "workers" : "inline",
    lanes: info,
    stats: () => ({
      created: stats.created,
      terminated: stats.terminated,
      live: stats.created - stats.terminated,
    }),
    killLane(id) {
      const l = lanes.find((x) => x.id === id)
      if (l && l.state !== "failed") failHook?.(l, "killed")
    },
    terminate() {
      dead = true
      active?.cancel()
      abortSpawning()
      for (const l of lanes) kill(l)
      lanes = []
    },
    run<T = ScreenValue>(
      tasks: readonly Task[],
      onResult: (index: number, v: T) => void,
      kind?: SweepKind,
    ): Run<T> {
      active?.cancel() // newest wins
      // the inline evaluator of this run (built on first use): screening cells, or sweep points when `kind` is given
      let inlineEval: Evaluator | null = null
      const evaluatorOf = (): Evaluator => {
        if (inlineEval) return inlineEval
        if (kind) {
          if (!opts.inlineSweep) throw new Error("no inline sweep lane")
          inlineEval = opts.inlineSweep(ctxJson, kind.sweep)
        } else {
          if (!opts.inline || !opts.screening)
            throw new Error("no inline screening lane")
          inlineEval = opts.inline(ctxJson, opts.screening, draws)
        }
        return inlineEval
      }
      const runId = ++seq
      let cancelled = false
      let finished = false
      const queue = chunkByCandidate(tasks)
      const pos = new Map<number, number>()
      tasks.forEach((t, i) => {
        pos.set(t.index, i)
      })
      const parts: { index: number; value: T }[] = []
      let resolveDone: (v: T[]) => void = () => {}
      let rejectDone: (e: PoolError) => void = () => {}
      const done = new Promise<T[]>((a, b) => {
        resolveDone = a
        rejectDone = b
      })
      done.catch(() => {})
      const stop = () => {
        finished = true
        for (const l of lanes) {
          if (l.timer) clearTimeout(l.timer)
          l.timer = null
        }
      }
      const fail = (message: string) => {
        if (finished) return
        stop()
        emit("pool.run.failed", "error", { run: runId, message })
        rejectDone(new PoolError("failed", message))
      }
      const accept = (
        l: Lane,
        out: { index: number; value: unknown }[],
        ms: number,
      ) => {
        if (l.timer) clearTimeout(l.timer)
        l.timer = null
        l.inflight = null
        l.tasks += out.length
        l.ms += ms
        emit("pool.task.done", "debug", {
          worker: l.id,
          tasks: out.length,
          ms: Math.round(ms * 10) / 10,
        })
        for (const o of out) {
          const p = pos.get(o.index)
          if (p === undefined) return fail(`unexpected index ${o.index}`)
          parts.push({ index: p, value: o.value as unknown as T })
          onResult(o.index, o.value as unknown as T)
        }
        if (parts.length === tasks.length) {
          stop()
          for (const x of lanes) if (x.state === "busy") x.state = "idle"
          publish()
          emit("pool.done", "info", { run: runId, tasks: tasks.length })
          try {
            resolveDone(mergeOrdered(parts, tasks.length))
          } catch {
            fail("merge refused the result set")
          }
          return
        }
        l.state = "idle"
        pump(l)
      }
      const pump = (l: Lane) => {
        if (cancelled || finished || l.state === "failed") return
        const chunk = queue.shift()
        if (!chunk) {
          l.state = "idle"
          publish()
          return
        }
        l.state = "busy"
        l.inflight = chunk
        publish()
        if (l.worker) {
          l.timer = setTimeout(() => failLane(l, "hang"), hangMs)
          l.worker.postMessage(
            kind
              ? {
                  type: "sweep",
                  id: runId,
                  ...kind.sweep,
                  idx: chunk.map((c) => c.index),
                }
              : { type: "screen", id: runId, tasks: chunk },
          )
        } else {
          setTimeout(() => {
            if (cancelled || finished) return
            const t0 = performance.now()
            try {
              accept(l, evaluatorOf()(chunk), performance.now() - t0)
            } catch {
              fail("inline lane failed")
            }
          }, 0)
        }
      }
      const failLane = (l: Lane, reason: string) => {
        if (l.state === "failed" || cancelled || finished) return
        const chunk = l.inflight
        kill(l)
        l.state = "failed"
        l.inflight = null
        emit("pool.worker.failed", "error", {
          worker: l.id,
          reason,
          phase: "run",
        })
        publish()
        if (chunk) queue.unshift(chunk)
        const alive = lanes.filter((x) => x.state !== "failed")
        if (alive.length === 0) {
          if (kind ? !opts.inlineSweep : !opts.inline)
            return fail("every worker failed")
          emit("pool.fallback", "info", { reason: "all_failed" })
          const il: Lane = {
            id: Math.max(...lanes.map((x) => x.id)) + 1,
            worker: null,
            evaluator: null,
            state: "idle",
            inflight: null,
            timer: null,
            tasks: 0,
            ms: 0,
          }
          lanes.push(il)
          publish()
          pump(il)
          return
        }
        for (const x of alive) if (x.state === "idle") pump(x)
      }
      failHook = failLane
      const wire = (l: Lane) => {
        const w = l.worker
        if (!w) return
        w.onmessage = (e: MessageEvent<Msg>) => {
          const m = e.data
          if (cancelled || finished) return
          if (m.type === "screened" && m.id === runId) accept(l, m.out, m.ms)
          else if (m.type === "error") failLane(l, "error")
        }
        w.onerror = () => failLane(l, "error")
      }
      const me = {
        cancel() {
          if (cancelled || finished) return
          cancelled = true
          gen++
          abortSpawning()
          stop()
          for (const l of lanes) {
            kill(l)
            l.state = "failed"
          }
          lanes = []
          publish()
          if (active === me) active = null
          emit("pool.cancel", "info", { run: runId })
          rejectDone(new PoolError("cancelled", "run cancelled"))
        },
      }
      active = me
      emit("pool.start", "info", { workers: n, tasks: tasks.length })
      ;(async () => {
        try {
          if (dead) throw new PoolError("failed", "pool terminated")
          await startLanes()
        } catch (e) {
          if (!cancelled) fail(e instanceof Error ? e.message : "start failed")
          return
        }
        if (cancelled || finished) return
        if (tasks.length === 0) {
          stop()
          resolveDone([])
          return
        }
        for (const l of lanes) wire(l)
        for (const l of lanes) pump(l)
      })()
      return { done, cancel: me.cancel }
    },
  }
  let seq = 0
  let failHook: ((l: Lane, reason: string) => void) | null = null
  return pool
}

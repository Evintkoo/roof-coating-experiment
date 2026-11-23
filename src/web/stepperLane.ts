// Plan 09 Task 3: the live stepper on a worker with an inline fallback, behind one interface. One request in flight at a time, every
// message stamped with a version; a reply older than the newest version is dropped ("stale") so a slider change never paints an old
// frame. Both lanes run the same pure stepper (createPair), so the result does not depend on the lane, the frame timing or the machine.
// The lane keeps a request log (the parameter changes and the steps between them): a killed worker is replaced by an inline lane that
// replays the log, so it resumes from the last good state and produces the same bytes (F4).
import {
  createPair,
  MAX_STEPS_PER_REQUEST,
  type Pair,
  type PaneFrames,
} from "../core/anim/stepper"
import { SpandekError } from "../core/errors"
import { contextFromJson } from "../core/pipeline/contextJson"
import type { LiveInputs } from "../core/pipeline/live"

export type { PaneFrames }
export type LaneReply = { version: number; frames: PaneFrames }
type Fields = Record<string, string | number | boolean>
export type LaneDeps = {
  /** Absent (or undefined) means no Worker in this browser: the inline lane. */
  Worker?: typeof Worker
  workerUrl?: string | URL
  /** T_hang_s: a worker call without an answer for this long fails the worker lane (default 10 000 ms). */
  hangMs?: number
  log?: (event: string, level: "debug" | "info" | "error", f: Fields) => void
}
export type LogEntry =
  | { op: "init"; inputs: LiveInputs }
  | { op: "params"; inputs: LiveInputs }
  | { op: "step"; n: number }
export interface StepperLane {
  /** Resolves when the first state exists (day 1 spun up); rejects when neither lane could build it (F11). */
  ready: Promise<void>
  request(n: number, version: number): Promise<LaneReply | "stale">
  setParams(inputs: LiveInputs, version: number): void
  /** Reseed both panes from the day-1 end state of these parameters (Restart day). */
  restart(inputs: LiveInputs, version: number): void
  close(): void
  kind(): "worker" | "inline"
  /** The reason of the last failed parameter change ("physics_range"), or null. */
  lastError(): string | null
  /** `#test` hook (F4): the worker dies as if it had crashed. */
  kill(): void
  /** The request log, steps merged between parameter changes (H3: replaying it gives the same bytes). */
  requestLog(): readonly LogEntry[]
}

class WorkerFailed extends Error {}

type Backend = {
  kind: "worker" | "inline"
  call(
    op: "init" | "params" | "step",
    version: number,
    payload: { inputs?: LiveInputs; n?: number },
  ): Promise<PaneFrames | null>
  close(): void
}

function inlineBackend(ctxJson: string): Backend {
  const ctx = contextFromJson(ctxJson)
  let pair: Pair | null = null
  return {
    kind: "inline",
    call: async (op, _v, payload) => {
      if (op === "init") pair = createPair(ctx, payload.inputs as LiveInputs)
      else if (pair === null) throw new Error("stepper used before its init")
      else if (op === "params") pair.setParams(payload.inputs as LiveInputs)
      else return pair.stepN(payload.n ?? 0)
      return null
    },
    close() {
      pair = null
    },
  }
}

function workerBackend(
  deps: Required<Pick<LaneDeps, "Worker">> & LaneDeps,
  ctxJson: string,
  onDead: (reason: string) => void,
  onSpawn: (w: { terminate(): void }) => void,
): Promise<Backend> {
  return new Promise((resolve, reject) => {
    const hangMs = deps.hangMs ?? 10_000
    const w = new deps.Worker(deps.workerUrl as string | URL)
    onSpawn(w)
    let dead = false
    let nextId = 1
    const pending = new Map<
      number,
      {
        res: (f: PaneFrames | null) => void
        rej: (e: Error) => void
        timer: ReturnType<typeof setTimeout>
      }
    >()
    const failAll = (e: Error): void => {
      for (const p of pending.values()) {
        clearTimeout(p.timer)
        p.rej(e)
      }
      pending.clear()
    }
    const die = (reason: string): void => {
      if (dead) return
      dead = true
      try {
        w.terminate()
      } catch {}
      failAll(new WorkerFailed(reason))
      onDead(reason)
    }
    const backend: Backend = {
      kind: "worker",
      call: (op, version, payload) =>
        new Promise((res, rej) => {
          if (dead) return rej(new WorkerFailed("dead"))
          const id = nextId++
          const timer = setTimeout(() => die("hang"), hangMs)
          pending.set(id, { res, rej, timer })
          w.postMessage({ type: "stepper", id, op, version, payload })
        }),
      close() {
        dead = true
        try {
          w.terminate()
        } catch {}
        failAll(new WorkerFailed("closed"))
      },
    }
    // `kill` reaches the same path as a crash
    ;(backend as Backend & { die: (r: string) => void }).die = die
    w.onerror = () => {
      if (!ready) reject(new WorkerFailed("init"))
      die("error")
    }
    let ready = false
    w.onmessage = (e: MessageEvent) => {
      const m = e.data as {
        type: string
        id?: number
        ok?: boolean
        frames?: PaneFrames | null
        error?: { code: number; phase: string; key: string }
      }
      if (m.type === "ready") {
        ready = true
        resolve(backend)
        return
      }
      if (m.type !== "stepper" || m.id === undefined) return
      const p = pending.get(m.id)
      if (!p) return
      pending.delete(m.id)
      clearTimeout(p.timer)
      if (m.ok) p.res(m.frames ?? null)
      else
        p.rej(
          new SpandekError(
            (m.error?.code || 4) as 4,
            m.error?.phase ?? "worker",
            m.error?.key,
            "stepper request failed",
          ),
        )
    }
    w.postMessage({ type: "init", ctxJson })
  })
}

export function openStepperLane(
  ctxJson: string,
  inputs: LiveInputs,
  deps: LaneDeps = {},
): StepperLane {
  const log: LogEntry[] = [{ op: "init", inputs }]
  let backend: Backend | null = null
  let latest = 0
  let closed = false
  let spawned: { terminate(): void } | null = null
  let onClose: () => void = () => {}
  const closedP = new Promise<null>((res) => {
    onClose = () => res(null)
  })
  let failed: Error | null = null
  let lastErr: string | null = null
  let tail: Promise<unknown> = Promise.resolve()
  const emit = deps.log ?? (() => {})

  const note = (e: LogEntry): void => {
    const last = log[log.length - 1]
    if (e.op === "step" && last?.op === "step") last.n += e.n
    else {
      if (e.op === "init") log.length = 0
      log.push(e)
    }
  }

  /** The inline backend caught up with the log: the same steps, so the same state. */
  const inlineFromLog = async (): Promise<Backend> => {
    const b = inlineBackend(ctxJson)
    for (const e of log) {
      if (e.op === "init") await b.call("init", 0, { inputs: e.inputs })
      else if (e.op === "params")
        await b.call("params", 0, { inputs: e.inputs })
      // a merged entry can exceed one request (MAX_STEPS_PER_REQUEST), so it is replayed in pieces
      else
        for (let left = e.n; left > 0; left -= MAX_STEPS_PER_REQUEST)
          await b.call("step", 0, { n: Math.min(left, MAX_STEPS_PER_REQUEST) })
    }
    return b
  }
  const fallback = async (reason: string): Promise<void> => {
    if (closed) return
    emit("physics.lane.failed", "error", {
      reason: reason === "no_worker" ? "no_worker" : "worker_failed",
    })
    const b = await inlineFromLog()
    if (!closed) backend = b
  }

  // serialised: every operation waits for the one before it
  const queue = <T>(fn: () => Promise<T>): Promise<T> => {
    const r = tail.then(fn, fn)
    tail = r.catch(() => undefined)
    return r
  }

  /** One backend call; a dead worker is replaced by the inline lane and the call is made again (the log has not seen it yet). */
  const run = async (
    op: "init" | "params" | "step",
    version: number,
    payload: { inputs?: LiveInputs; n?: number },
  ): Promise<PaneFrames | null> => {
    if (backend === null) throw failed ?? new Error("lane not ready")
    try {
      return await backend.call(op, version, payload)
    } catch (e) {
      if (!(e instanceof WorkerFailed) || closed) throw e
      await fallback(e.message)
      if (backend === null) throw new WorkerFailed("closed")
      return backend.call(op, version, payload)
    }
  }

  const ready: Promise<void> = (async () => {
    let b: Backend | null = null
    if (deps.Worker && deps.workerUrl !== undefined) {
      try {
        const started = await Promise.race([
          workerBackend(
            deps as Required<Pick<LaneDeps, "Worker">> & LaneDeps,
            ctxJson,
            (reason) => {
              // a worker that dies later is replaced on the next call (see run)
              if (!closed)
                emit("physics.lane.failed", "error", {
                  reason: "worker_failed",
                })
              void reason
            },
            (w) => {
              spawned = w
            },
          ),
          closedP,
        ])
        if (started === null || closed) {
          started?.close()
          return // closed while starting: nothing was built and nothing is posted
        }
        b = started
        backend = b
        await b.call("init", 0, { inputs })
        emit("physics.open", "info", {
          panes: 2,
          renderer: "svg",
          lane: "worker",
        })
        return
      } catch {
        b?.close()
        backend = null
      }
    }
    try {
      backend = inlineBackend(ctxJson)
      await backend.call("init", 0, { inputs })
      emit("physics.open", "info", {
        panes: 2,
        renderer: "svg",
        lane: "inline",
      })
    } catch (e) {
      backend = null
      failed = e instanceof Error ? e : new Error("stepper init failed")
      emit("physics.error", "error", {
        reason: e instanceof SpandekError ? e.phase : "init",
        pane: "both",
      })
      throw failed
    }
  })()
  ready.catch(() => undefined)

  return {
    ready,
    request(n, version) {
      latest = Math.max(latest, version)
      return queue(async () => {
        await ready
        if (closed || version < latest) return "stale" // nothing is stepped for a request already overtaken
        const frames = await run("step", version, { n })
        note({ op: "step", n: frames?.recipe.length ?? 0 })
        if (closed || version < latest) return "stale"
        return { version, frames: frames as PaneFrames }
      })
    },
    setParams(next, version) {
      latest = Math.max(latest, version)
      void queue(async () => {
        await ready
        if (closed) return
        await run("params", version, { inputs: next })
        note({ op: "params", inputs: next })
        lastErr = null
      }).catch((e) => {
        lastErr = e instanceof SpandekError ? "physics_range" : "worker_failed"
        emit("physics.lane.failed", "error", { reason: lastErr })
      })
    },
    restart(next, version) {
      latest = Math.max(latest, version)
      void queue(async () => {
        await ready
        if (closed) return
        await run("init", version, { inputs: next })
        note({ op: "init", inputs: next })
      }).catch(() => {
        lastErr = "physics_range"
        emit("physics.error", "error", { reason: "restart", pane: "both" })
      })
    },
    close() {
      closed = true
      onClose()
      // a worker still starting up dies now, not when it answers; a started one is closed by its backend (one terminate each)
      if (backend) backend.close()
      else spawned?.terminate()
      backend = null
    },
    kind: () => backend?.kind ?? "inline",
    lastError: () => lastErr,
    kill() {
      const b = backend as (Backend & { die?: (r: string) => void }) | null
      b?.die?.("killed")
    },
    requestLog: () => log,
  }
}

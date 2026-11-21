import { appendFileSync } from "node:fs"
import { join } from "node:path"
import { type Level, setEventSink } from "../core/events"

type Fields = Record<string, string | number | boolean>

const MAX_BYTES = 2048
const RANK: Record<Level, number> = { debug: 0, info: 1, warn: 2, error: 3 }
/** error.raised may carry only these fields: never free text. */
const ERROR_RAISED_FIELDS = new Set(["code", "phase", "key"])

let runId = "unconfigured"
let minLevel: Level = "info"
let runDir: string | undefined
let mirror = false

const issued = new Set<string>()

export function newRunId(): string {
  for (;;) {
    const id = makeRunId()
    if (!issued.has(id)) {
      issued.add(id)
      return id
    }
  }
}

function makeRunId(): string {
  const d = new Date()
  const p = (n: number, w = 2) => String(n).padStart(w, "0")
  const ts = `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}${p(d.getUTCMilliseconds(), 3)}`
  return `${ts}-${crypto.randomUUID().replaceAll("-", "").slice(0, 8)}`
}

export function configureLogging(opts: {
  runId: string
  level: Level
  runDir?: string
  /** Also write each line to stderr (the CLI does; plan 01 "Logging"). */
  mirrorStderr?: boolean
}): void {
  runId = opts.runId
  minLevel = opts.level
  runDir = opts.runDir
  mirror = opts.mirrorStderr ?? false
  setEventSink(emit)
}

/** Whether an event at this level would be written (lets a worker skip forwarding debug events). */
export function levelEnabled(level: Level): boolean {
  return RANK[level] >= RANK[minLevel]
}

const json = (r: Record<string, unknown>) => JSON.stringify(r)
const bytes = (s: string) => Buffer.byteLength(s)

/** Bound a caller-controlled string: 200 chars, control chars replaced. */
const clamp = (s: string) =>
  // biome-ignore lint/suspicious/noControlCharactersInRegex: intentional
  s.slice(0, 200).replace(/[\u0000-\u001f\u007f]/g, "?")

function sanitize(v: string | number | boolean): string | number | boolean {
  if (typeof v === "number" && !Number.isFinite(v)) {
    return Number.isNaN(v) ? "NaN" : v > 0 ? "Infinity" : "-Infinity"
  }
  return v
}

export function emit(event: string, level: Level, fields: Fields): void {
  try {
    if (RANK[level] < RANK[minLevel]) return
    const base: Record<string, unknown> = {
      ts: new Date().toISOString(),
      run: clamp(runId),
      level,
      event: clamp(event),
    }
    let line = json(base)
    const restricted = event === "error.raised"
    let truncated = event.length > 200 || runId.length > 200
    for (const [k, raw] of Object.entries(fields)) {
      if (k in base || k === "truncated") continue
      if (restricted && !ERROR_RAISED_FIELDS.has(k)) continue
      const next = { ...base, [k]: sanitize(raw) }
      const nextLine = json(next)
      // reserve room for the ` "truncated":true` marker
      if (bytes(nextLine) > MAX_BYTES - 20) {
        truncated = true
        continue
      }
      Object.assign(base, next)
      line = nextLine
    }
    if (truncated) {
      base.truncated = true
      line = json(base)
    }
    if (runDir) appendFileSync(join(runDir, "run.jsonl"), `${line}\n`)
    if (!runDir || mirror) process.stderr.write(`${line}\n`)
  } catch {
    // logging must never mask the real error
    try {
      process.stderr.write("log write failed\n")
    } catch {
      // nothing more to do
    }
  }
}

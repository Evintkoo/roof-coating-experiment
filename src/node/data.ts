import { createHash } from "node:crypto"
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { DataError } from "../core/errors"
import { emit } from "./logging"

export const SUMS_FILE = "SHA256SUMS"

export const sha256Hex = (b: Uint8Array | string): string =>
  createHash("sha256").update(b).digest("hex")

function walk(root: string, dir: string = root): string[] {
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(root, p))
    else out.push(relative(root, p).split("\\").join("/"))
  }
  return out.sort()
}

/** Every file under dir except SHA256SUMS, as POSIX relative paths. */
export const listDataFiles = (dir: string): string[] =>
  walk(dir).filter((f) => f !== SUMS_FILE)

function mismatch(file: string, reason: string): never {
  emit("data.mismatch", "error", { file, reason })
  throw new DataError(file, reason)
}

/** Check every file against SHA256SUMS; any mismatch, missing, unlisted file or missing SHA256SUMS is DataError (exit 5). */
export async function verifyData(dir: string): Promise<void> {
  let text: string
  try {
    text = readFileSync(join(dir, SUMS_FILE), "utf8")
  } catch {
    emit("data.mismatch", "error", { file: SUMS_FILE, reason: "missing" })
    throw new DataError(SUMS_FILE, "SHA256SUMS missing or unreadable")
  }
  const listed = new Map<string, string>()
  for (const line of text.split("\n")) {
    if (line === "") continue
    const m = /^([0-9a-f]{64}) {2}(\S.*)$/.exec(line)
    if (!m) mismatch(SUMS_FILE, "malformed line")
    const [, hash, path] = m as unknown as [string, string, string]
    if (path.startsWith("/") || path.split("/").includes(".."))
      mismatch(SUMS_FILE, "path escapes the data directory")
    listed.set(path, hash)
  }
  if (listed.size === 0) mismatch(SUMS_FILE, "no entries")
  for (const [path, hash] of listed) {
    let bytes: Uint8Array
    try {
      bytes = readFileSync(join(dir, path))
    } catch {
      mismatch(path, "listed file missing")
    }
    if (sha256Hex(bytes) !== hash) mismatch(path, "sha256 differs")
  }
  for (const f of listDataFiles(dir))
    if (!listed.has(f)) mismatch(f, "file not listed in SHA256SUMS")
  emit("data.verified", "info", { n_files: listed.size })
}

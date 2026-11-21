// Shared test helpers; later tasks add to this file.
import { readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"

export const repoRoot = join(import.meta.dir, "..")

/** Recursively list files under dir (relative POSIX paths), [] if dir is missing. */
export function listFiles(dir: string): string[] {
  const out: string[] = []
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else out.push(relative(dir, p).split("\\").join("/"))
    }
  }
  try {
    statSync(dir)
  } catch {
    return out
  }
  walk(dir)
  return out.sort()
}

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

export const mirrorOf = (src: string) => src.replace(/\.ts$/, ".test.ts")

/** Source files lacking a mirror test (tests/<path>.test.ts). */
export function missingMirrors(
  srcFiles: string[],
  testFiles: string[],
  noMirrorNeeded: Set<string>,
): string[] {
  return srcFiles
    .filter((f) => !noMirrorNeeded.has(f))
    .filter((f) => !testFiles.includes(mirrorOf(f)))
}

/** Test files that neither mirror a source file nor are whitelisted. */
export function orphanTests(
  srcFiles: string[],
  testFiles: string[],
  nonMirror: Set<string>,
): string[] {
  const srcSet = new Set(srcFiles.map(mirrorOf))
  return testFiles.filter((t) => !nonMirror.has(t) && !srcSet.has(t))
}

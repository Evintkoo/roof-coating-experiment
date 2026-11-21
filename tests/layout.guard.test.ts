import { expect, test } from "bun:test"
import { join } from "node:path"
import { listFiles, repoRoot } from "./helpers"

const srcFiles = listFiles(join(repoRoot, "src")).filter((f) =>
  f.endsWith(".ts"),
)
const testFiles = listFiles(join(repoRoot, "tests")).filter((f) =>
  f.endsWith(".test.ts"),
)

// Tests that are not mirrors of one source file.
const NON_MIRROR = new Set(["layout.guard.test.ts", "library.smoke.test.ts"])
// Source files that need no mirror (entry-point glue with no logic of its own).
const NO_MIRROR_NEEDED = new Set<string>()

const mirrorOf = (src: string) => src.replace(/\.ts$/, ".test.ts")

test("everySourceFileHasOneMirror", () => {
  const missing = srcFiles
    .filter((f) => !NO_MIRROR_NEEDED.has(f))
    .filter((f) => !testFiles.includes(mirrorOf(f)))
  expect(missing).toEqual([])
})

test("noOrphanTests", () => {
  const srcSet = new Set(srcFiles.map(mirrorOf))
  const orphans = testFiles.filter((t) => !NON_MIRROR.has(t) && !srcSet.has(t))
  expect(orphans).toEqual([])
})

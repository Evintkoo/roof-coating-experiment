// Plan 06 vendor drift check (H5, F2). The vendored Torviello material under vendor/ is recorded in vendor/manifest.sha256
// (sha256 of every file except VENDORED.md and manifest.sha256 itself, sorted by path, `shasum -a 256 -c` compatible
// when run from vendor/). Task 2 moves vendorCheck into src/node/report/design.ts unchanged.
//
//   bun docs/spikes/plan-06/vendor-check.ts                check ./vendor (exit 0 ok, 5 drift, 2 manifest unreadable)
//   bun docs/spikes/plan-06/vendor-check.ts --write        rewrite vendor/manifest.sha256 (a deliberate re-sync only)
//   bun docs/spikes/plan-06/vendor-check.ts --selftest     prove the check detects one flipped byte, a missing and an extra file
//
// Exit 0 only when the tree equals the manifest (or, for --selftest, when every detection works).
import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, relative } from "node:path"

export const MANIFEST = "manifest.sha256"
const EXCLUDED = new Set(["VENDORED.md", MANIFEST])

export type VendorResult =
  | { ok: true }
  | { ok: false; first: number; count: number }

function walk(dir: string, base = dir): string[] {
  const out: string[] = []
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, base))
    else if (e.isFile()) out.push(relative(base, p).split("\\").join("/"))
  }
  return out
}
const sha256 = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex")
/** Plain bytewise order, the same as `LC_ALL=C sort`. */
const byBytes = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function listVendorFiles(root: string): string[] {
  return walk(root)
    .filter((f) => !EXCLUDED.has(f))
    .sort(byBytes)
}
export function writeManifest(root: string): number {
  const files = listVendorFiles(root)
  writeFileSync(
    join(root, MANIFEST),
    `${files.map((f) => `${sha256(join(root, f))}  ${f}`).join("\n")}\n`,
  )
  return files.length
}
/** `first` is the index of the first offending line in the manifest (an unlisted extra file counts after the last line); `count` is how many entries differ. */
export function vendorCheck(root: string): VendorResult {
  const mp = join(root, MANIFEST)
  if (!existsSync(mp)) return { ok: false, first: 0, count: 1 }
  const lines = readFileSync(mp, "utf8")
    .split("\n")
    .filter((l) => l.length > 0)
  const bad: number[] = []
  const listed = new Set<string>()
  for (const [i, line] of lines.entries()) {
    const m = /^([0-9a-f]{64}) {2}(.+)$/.exec(line)
    if (!m) {
      bad.push(i)
      continue
    }
    const path = m[2] as string
    listed.add(path)
    const p = join(root, path)
    if (!existsSync(p) || !statSync(p).isFile() || sha256(p) !== m[1])
      bad.push(i)
  }
  let extra = 0
  for (const f of listVendorFiles(root)) {
    if (!listed.has(f)) {
      bad.push(lines.length + extra)
      extra++
    }
  }
  if (bad.length === 0) return { ok: true }
  return { ok: false, first: Math.min(...bad), count: bad.length }
}

function selftest(root: string): number {
  let fails = 0
  const expect = (c: boolean, m: string) => {
    console.log(`${c ? "ok  " : "FAIL"} ${m}`)
    if (!c) fails++
  }
  const tmp = mkdtempSync(join(tmpdir(), "plan06-vendor-"))
  const copy = join(tmp, "vendor")
  cpSync(root, copy, { recursive: true })
  expect(vendorCheck(copy).ok === true, "a pristine copy passes")
  const target = "torviello-design/contracts/design-tokens.json"
  const lines = readFileSync(join(copy, MANIFEST), "utf8")
    .split("\n")
    .filter(Boolean)
  const idx = lines.findIndex((l) => l.endsWith(`  ${target}`))
  const bytes = readFileSync(join(copy, target))
  bytes[10] = (bytes[10] as number) ^ 1
  writeFileSync(join(copy, target), bytes)
  const r = vendorCheck(copy)
  expect(
    !r.ok && r.first === idx && r.count === 1,
    `one flipped byte in ${target} is detected and located (index ${idx})`,
  )
  bytes[10] = (bytes[10] as number) ^ 1
  writeFileSync(join(copy, target), bytes)
  expect(vendorCheck(copy).ok === true, "restoring the byte passes again")
  rmSync(join(copy, "torviello-landing-ui/styles/base.css"))
  const r2 = vendorCheck(copy)
  expect(!r2.ok && r2.count === 1, "a deleted file is detected")
  cpSync(
    join(root, "torviello-landing-ui/styles/base.css"),
    join(copy, "torviello-landing-ui/styles/base.css"),
  )
  writeFileSync(join(copy, "torviello-design/extra.txt"), "x")
  const r3 = vendorCheck(copy)
  expect(
    !r3.ok && r3.first === lines.length && r3.count === 1,
    "an unlisted extra file is detected",
  )
  rmSync(join(copy, "torviello-design/extra.txt"))
  writeFileSync(join(copy, "VENDORED.md"), "edited provenance note")
  expect(
    vendorCheck(copy).ok === true,
    "VENDORED.md is outside the manifest by design",
  )
  rmSync(join(copy, MANIFEST))
  expect(!vendorCheck(copy).ok, "a missing manifest fails closed")
  rmSync(tmp, { recursive: true, force: true })
  return fails
}

if (import.meta.main) {
  const root = join(
    dirname(new URL(import.meta.url).pathname),
    "..",
    "..",
    "..",
    "vendor",
  )
  const arg = process.argv[2]
  if (arg === "--write") {
    console.log(`wrote ${join(root, MANIFEST)}: ${writeManifest(root)} files`)
  } else if (arg === "--selftest") {
    process.exit(selftest(root) === 0 ? 0 : 1)
  } else {
    if (!existsSync(join(root, MANIFEST))) {
      console.error("manifest unreadable")
      process.exit(2)
    }
    const r = vendorCheck(root)
    if (r.ok)
      console.log(
        `vendor ok (${readFileSync(join(root, MANIFEST), "utf8").split("\n").filter(Boolean).length} files)`,
      )
    else
      console.error(
        JSON.stringify({
          event: "design.vendor.drift",
          file_count: r.count,
          first_id: r.first,
        }),
      )
    process.exit(r.ok ? 0 : 5)
  }
}

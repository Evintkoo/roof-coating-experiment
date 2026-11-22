// Plan 06 vendor drift check (H5, F2). The vendored Torviello material under vendor/ is recorded in vendor/manifest.sha256
// (sha256 of every file except VENDORED.md and manifest.sha256 itself, sorted by path, `shasum -a 256 -c` compatible
// when run from vendor/). Task 2 moved vendorCheck into src/node/report/design.ts; this script is now only the CLI and the self-test.
//
//   bun docs/spikes/plan-06/vendor-check.ts                check ./vendor (exit 0 ok, 5 drift, 2 manifest unreadable)
//   bun docs/spikes/plan-06/vendor-check.ts --write        rewrite vendor/manifest.sha256 (a deliberate re-sync only)
//   bun docs/spikes/plan-06/vendor-check.ts --selftest     prove the check detects one flipped byte, a missing and an extra file
//
// Exit 0 only when the tree equals the manifest (or, for --selftest, when every detection works).
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import {
  MANIFEST,
  vendorCheck,
  writeManifest,
} from "../../../src/node/report/design"

export {
  listVendorFiles,
  MANIFEST,
  vendorCheck,
  writeManifest,
} from "../../../src/node/report/design"

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

import { expect, test } from "bun:test"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { buildGallery } from "../../../src/node/report/gallery"

const dir = () => mkdtempSync(join(tmpdir(), "gallery-"))

test("twoBuildsGiveTheSameBytes", () => {
  const a = join(dir(), "a.html")
  const b = join(dir(), "b.html")
  expect(buildGallery(a)).toBe(buildGallery(b))
  expect(readFileSync(a, "utf8")).toBe(readFileSync(b, "utf8"))
  expect(readFileSync(a, "utf8")).toContain("Spandek component gallery")
})

test("unwritableDirectoryIsExit6AndLeavesNothing", () => {
  const d = dir()
  const sub = join(d, "locked")
  mkdirSync(sub)
  chmodSync(sub, 0o500)
  let code = 0
  try {
    buildGallery(join(sub, "g.html"))
  } catch (e) {
    code = (e as { code: number }).code
  }
  chmodSync(sub, 0o700)
  expect(code).toBe(6)
  expect(existsSync(join(sub, "g.html"))).toBe(false)
  expect(existsSync(join(sub, "g.html.tmp"))).toBe(false)
  // a missing directory is the same failure
  let missing = 0
  try {
    buildGallery(join(d, "nope", "g.html"))
  } catch (e) {
    missing = (e as { code: number }).code
  }
  expect(missing).toBe(6)
})

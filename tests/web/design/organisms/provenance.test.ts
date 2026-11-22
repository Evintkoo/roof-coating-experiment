import { expect, test } from "bun:test"
import { ORGANISM_CSS } from "../../../../src/web/design/css"
import { provenance } from "../../../../src/web/design/organisms/provenance"
import {
  elementsOf,
  expectBuildError,
  expectSheet,
  expectTokenOnly,
  XSS,
} from "../../../support/designComponents"

const H = (c: string) => c.repeat(64)
const ok = {
  runId: "20261121T172730601-6a7a8fba",
  seed: 20260101,
  draws: 256,
  coreHash: H("a"),
  commit: "ad40a46f8a75153ecbe6f4461612763688ef0de5",
  build: [
    { label: "Bun", value: "1.3.14" },
    { label: "Design CSS", value: "41234 bytes" },
  ],
  extra: [
    { path: "refine_recipes.csv", kind: "refine", bytes: 1234, sha256: H("b") },
    { path: "budget_table.json", kind: "budget", bytes: 99, sha256: H("c") },
  ],
  files: [{ path: "results.csv", bytes: 5000, sha256: H("d") }],
}

test("sheetEntryExistsBeforeTheCode", () => {
  expectSheet("R20 Provenance", [])
})

test("showsRunSeedDrawsCoreHashBuildAndEveryExtraFileWithItsHash", async () => {
  const html = provenance(ok)
  const els = await elementsOf(html)
  expect(els[0]?.attrs["data-provenance"]).toBe("")
  for (const k of [
    "20261121T172730601-6a7a8fba",
    "20260101",
    ">256<",
    H("a"),
    "ad40a46f8a75153ecbe6f4461612763688ef0de5",
    "1.3.14",
    "41234 bytes",
  ])
    expect(html).toContain(k)
  for (const f of ok.extra) {
    expect(html).toContain(f.path)
    expect(html).toContain(f.sha256)
    expect(html).toContain(`>${f.kind}<`)
  }
  expect(html).toContain("Later outputs embedded in this page")
  expect(html).toContain(
    "verify-report flags a page whose core hash no longer matches the manifest",
  )
  // the extra table is outside any disclosure; the manifest is inside a closed one
  const details = html.slice(html.indexOf("<details"))
  expect(details).toContain("results.csv")
  expect(html.slice(0, html.indexOf("<details"))).toContain(
    "refine_recipes.csv",
  )
  expect(els.find((e) => e.tag === "details")?.attrs.open).toBeUndefined()
  expect(html).toContain("tv-cell--mono")
})

test("noExtraFilesIsSaidInWordsAndNoManifestMeansNoDisclosure", async () => {
  const { files: _f, ...rest } = ok
  const html = provenance({ ...rest, extra: [] })
  expect(html).toContain("No later outputs are embedded")
  expect(html).not.toContain("<details")
  expect(html).not.toContain("Later outputs embedded in this page")
})

test("escapesEveryFieldF8", async () => {
  const html = provenance({
    ...ok,
    runId: XSS,
    commit: XSS,
    build: [{ label: XSS, value: XSS }],
    extra: [{ path: XSS, kind: XSS, bytes: 1, sha256: H("e") }],
    files: [{ path: XSS, bytes: 1, sha256: H("f") }],
  })
  expect((await elementsOf(html)).some((e) => e.tag === "img")).toBe(false)
})

test("badHashesCountsOrIdsAreBuildErrorsF7", () => {
  expectBuildError(() => provenance({ ...ok, coreHash: "abc" }), "Provenance")
  expectBuildError(() => provenance({ ...ok, coreHash: H("A") }), "Provenance")
  expectBuildError(
    () =>
      provenance({
        ...ok,
        extra: [{ path: "p", kind: "k", bytes: 1, sha256: "zz" }],
      }),
    "Provenance",
  )
  expectBuildError(
    () =>
      provenance({
        ...ok,
        extra: [{ path: "p", kind: "k", bytes: -1, sha256: H("a") }],
      }),
    "Provenance",
  )
  expectBuildError(() => provenance({ ...ok, seed: 1.5 }), "Provenance")
  expectBuildError(() => provenance({ ...ok, draws: 0 }), "Provenance")
  expectBuildError(() => provenance({ ...ok, runId: " " }), "Provenance")
  expectBuildError(() => provenance({ ...ok, id: "a b" }), "Provenance")
  expectBuildError(
    () => provenance({ ...ok, headingLevel: 2 as never }),
    "Provenance",
  )
})

test("cssIsTokenOnly", () => {
  expectTokenOnly(ORGANISM_CSS.provenance as string)
})

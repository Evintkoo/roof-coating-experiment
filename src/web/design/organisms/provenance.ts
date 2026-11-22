// Report sheet R20: where the numbers came from. Run, seed, draws, core hash, commit, build information, the extra files the
// page embeds with their hashes (plan 00 finding S2), and the full manifest behind a closed disclosure.
import { codeBlock } from "../atoms/codeBlock"
import { buildError, esc, tag } from "../html"
import { disclosure } from "../molecules/disclosure"
import { dataTable } from "./dataTable"

export type HashedFile = { path: string; bytes: number; sha256: string }
export type ExtraFile = HashedFile & { kind: string }

export type ProvenanceProps = {
  runId: string
  seed: number
  draws: number
  coreHash: string
  commit?: string
  /** Report build information as label and value pairs (tool versions, sizes). */
  build?: readonly { label: string; value: string }[]
  extra: readonly ExtraFile[]
  files?: readonly HashedFile[]
  /** Licence notices of what the page embeds (the fonts): each one's full text behind one closed "Licences" disclosure. */
  licences?: readonly { name: string; text: string }[]
  /** Put the extra files table behind a closed Disclosure (the page does; the sentence about the core hash stays visible). */
  extraInDisclosure?: boolean
  id?: string
  headingLevel?: 3 | 4
}

const C = "Provenance"
const HEX64 = /^[0-9a-f]{64}$/

function checkFile(f: HashedFile): void {
  if (typeof f.path !== "string" || f.path.trim() === "")
    buildError(C, "a file needs its path")
  if (!Number.isInteger(f.bytes) || f.bytes < 0)
    buildError(C, "bytes must be a non-negative integer")
  if (!HEX64.test(f.sha256))
    buildError(C, "a hash is 64 lower-case hex characters")
}

export function provenance(p: ProvenanceProps): string {
  const id = p.id ?? "provenance"
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(id))
    return buildError(C, "id must be a plain identifier")
  const level = p.headingLevel ?? 3
  if (level !== 3 && level !== 4) return buildError(C, "headingLevel is 3 or 4")
  if (typeof p.runId !== "string" || p.runId.trim() === "")
    return buildError(C, "the run id is required")
  if (!Number.isInteger(p.seed)) return buildError(C, "seed must be an integer")
  if (!Number.isInteger(p.draws) || p.draws < 1)
    return buildError(C, "draws must be a positive integer")
  if (!HEX64.test(p.coreHash))
    return buildError(C, "the core hash is 64 lower-case hex characters")
  for (const f of [...p.extra, ...(p.files ?? [])]) checkFile(f)
  const fact = (term: string, value: string) =>
    tag(
      "div",
      { class: "tv-provenance__fact" },
      tag("dt", {}, esc(term)) +
        tag("dd", {}, codeBlock({ code: value, variant: "inline" })),
    )
  const facts = [
    fact("Run", p.runId),
    fact("Seed", String(p.seed)),
    fact("Uncertainty draws", String(p.draws)),
    fact("Core hash", p.coreHash),
    ...(p.commit ? [fact("Commit", p.commit)] : []),
    ...(p.build ?? []).map((b) => fact(b.label, b.value)),
  ].join("")
  const columns = (kind: boolean) => [
    {
      key: "path",
      label: "File",
      kind: "text" as const,
      rowHeader: true,
      mono: true,
    },
    ...(kind ? [{ key: "kind", label: "Kind", kind: "text" as const }] : []),
    {
      key: "bytes",
      label: "Size",
      unit: "bytes",
      kind: "number" as const,
      digits: 0,
    },
    { key: "sha256", label: "SHA-256", kind: "text" as const, mono: true },
  ]
  const wrapExtra = (table: string): string =>
    p.extraInDisclosure === true
      ? disclosure({
          summary: `The ${p.extra.length} later files this page was built from, with hashes`,
          level: "detail",
        })(table)
      : table
  const extra =
    p.extra.length === 0
      ? tag(
          "p",
          { class: "tv-provenance__none" },
          "No later outputs are embedded in this page (no refine, budget table or Indonesia files).",
        )
      : tag(
          `h${level}`,
          { class: "tv-provenance__title" },
          "Later outputs embedded in this page",
        ) +
        tag(
          "p",
          { class: "tv-provenance__note" },
          esc(
            `These files are listed in the manifest's extra entries and were checked against the hashes below before the page was built. The page was built against core hash ${p.coreHash}; verify-report flags a page whose core hash no longer matches the manifest.`,
          ),
        ) +
        wrapExtra(
          dataTable({
            id: `${id}-extra`,
            caption: "Later outputs embedded in this page",
            columns: columns(true),
            rows: p.extra.map((f) => ({ ...f })),
          }),
        )
  const manifest =
    p.files === undefined || p.files.length === 0
      ? ""
      : disclosure({ summary: "Manifest and file hashes", level: "detail" })(
          dataTable({
            id: `${id}-files`,
            caption: "Core files of the run",
            columns: columns(false),
            rows: p.files.map((f) => ({ ...f })),
          }),
        )
  for (const l of p.licences ?? [])
    if (l.name.trim() === "" || l.text.trim() === "")
      return buildError(C, "a licence needs its name and its text")
  const licences =
    p.licences === undefined || p.licences.length === 0
      ? ""
      : disclosure({
          summary: "Licences",
          level: "detail",
          id: `${id}-licences`,
        })(
          tag(
            "p",
            { class: "tv-provenance__note" },
            "The page embeds these fonts as data; each is distributed under the licence below.",
          ) +
            p.licences
              .map(
                (l) =>
                  tag("h4", { class: "tv-provenance__title" }, esc(l.name)) +
                  tag("pre", { class: "tv-provenance__licence" }, esc(l.text)),
              )
              .join(""),
        )
  return tag(
    "section",
    { class: "tv-provenance", id, "data-provenance": true },
    tag("dl", { class: "tv-provenance__facts" }, facts) +
      extra +
      manifest +
      licences,
  )
}

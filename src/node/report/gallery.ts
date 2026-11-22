// `design-gallery --out FILE` (FR-11, F9): one offline file with every component in every state, built from the same builders
// as the report. The write is atomic; a directory that cannot be written is exit 6 and leaves no partial file.
import { createHash } from "node:crypto"
import { renameSync, rmSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { ResourceError } from "../../core/errors"
import { galleryDocument } from "../../web/design/templates/galleryPage"
import { emit } from "../logging"
import { buildDesignAssets } from "./design"

const REPO = join(import.meta.dir, "..", "..", "..")

/** Writes the gallery and returns its sha256. */
export function buildGallery(outPath: string): string {
  const assets = buildDesignAssets({
    vendorRoot: join(REPO, "vendor"),
    fontsDir: join(REPO, "src", "node", "report", "fonts"),
    componentCount: 3,
  })
  const html = galleryDocument({ css: `${assets.fontCss}\n${assets.css}` })
  assets.done(Buffer.byteLength(html))
  const tmp = `${outPath}.tmp`
  try {
    writeFileSync(tmp, html)
    renameSync(tmp, outPath)
  } catch {
    rmSync(tmp, { force: true })
    emit("design.gallery.refused", "error", { code: "unwritable" })
    throw new ResourceError("the gallery file could not be written")
  }
  const digest = createHash("sha256").update(html).digest("hex")
  emit("design.gallery.written", "info", {
    bytes: Buffer.byteLength(html),
    sha256: digest,
  })
  return digest
}

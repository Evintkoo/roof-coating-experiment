// Regenerates docs/design/theme-mapping.md from the code: `bun run tests/support/writeThemeMapping.ts`.
import { readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { mappingMarkdown } from "../../src/web/design/themeMapping"
import { THEMES } from "../../src/web/design/themes"
import { resolveTheme } from "../../src/web/design/tokens"

const root = join(import.meta.dir, "..", "..")
const contract = JSON.parse(
  readFileSync(
    join(root, "vendor/torviello-design/contracts/design-tokens.json"),
    "utf8",
  ),
)
writeFileSync(
  join(root, "docs/design/theme-mapping.md"),
  mappingMarkdown(
    resolveTheme(contract, THEMES, "light"),
    resolveTheme(contract, THEMES, "dark"),
  ),
)

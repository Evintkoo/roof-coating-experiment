// Plan 06 spike Q5: measure the Svelte 5 + Vite single-file alternative (decision D2) in a throwaway directory.
// One component (Button, which pulls in Icon and the lib helpers) from vendor/torviello-landing-ui is built to one HTML file
// twice; the script records size, build steps, installed package count and byte-reproducibility.
// Needs network for `bun install` (public npm registry only). Run: bun docs/spikes/plan-06/q5_svelte.ts [work_dir]
// Exit 0 only when the measurement completed and its expectations hold (single file produced, rebuilds compared).

import { createHash } from "node:crypto"
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"

const HERE = dirname(new URL(import.meta.url).pathname)
const ROOT = join(HERE, "..", "..", "..")
const work = process.argv[2] ?? mkdtempSync(join(tmpdir(), "plan06-svelte-"))
const fails: string[] = []
const expect = (cond: boolean, msg: string) => {
  console.log(`${cond ? "ok  " : "FAIL"} ${msg}`)
  if (!cond) fails.push(msg)
}
const sha = (p: string) =>
  createHash("sha256").update(readFileSync(p)).digest("hex")
const run = (cmd: string[], cwd: string) => {
  const t0 = performance.now()
  const r = Bun.spawnSync(cmd, { cwd, stdout: "pipe", stderr: "pipe" })
  return {
    ok: r.exitCode === 0,
    ms: Math.round(performance.now() - t0),
    out: r.stdout.toString() + r.stderr.toString(),
  }
}
function dirBytes(d: string): number {
  let n = 0
  for (const e of readdirSync(d, { withFileTypes: true }))
    n += e.isDirectory()
      ? dirBytes(join(d, e.name))
      : statSync(join(d, e.name)).size
  return n
}

const VERSIONS = {
  svelte: "5.59.1",
  vite: "8.3.8",
  "@sveltejs/vite-plugin-svelte": "7.3.1",
  "vite-plugin-singlefile": "2.3.4",
}
mkdirSync(join(work, "src/lib"), { recursive: true })
mkdirSync(join(work, "src/components/ui"), { recursive: true })
mkdirSync(join(work, "src/design/brand"), { recursive: true })
const v = join(ROOT, "vendor")
for (const f of ["Button.svelte", "Icon.svelte"])
  cpSync(
    join(v, "torviello-landing-ui/components/ui", f),
    join(work, "src/components/ui", f),
  )
for (const f of ["link.ts", "icons.ts"])
  cpSync(join(v, "torviello-landing-ui/lib", f), join(work, "src/lib", f))
cpSync(
  join(v, "torviello-design/brand/icons.ts"),
  join(work, "src/design/brand/icons.ts"),
)
cpSync(
  join(v, "torviello-landing-ui/styles/tokens.css"),
  join(work, "src/tokens.css"),
)
writeFileSync(
  join(work, "package.json"),
  JSON.stringify(
    { name: "q5", private: true, type: "module", devDependencies: VERSIONS },
    null,
    2,
  ),
)
writeFileSync(
  join(work, "index.html"),
  `<!doctype html><html><head><meta charset="utf-8"><title>q5</title></head><body><div id="app"></div><script type="module" src="/src/main.ts"></script></body></html>\n`,
)
writeFileSync(
  join(work, "src/main.ts"),
  `import { mount } from "svelte"\nimport "./tokens.css"\nimport Button from "./components/ui/Button.svelte"\nmount(Button, { target: document.getElementById("app")!, props: { label: "Open the report", variant: "primary", icon: "arrow-right" } })\n`,
)
writeFileSync(
  join(work, "vite.config.ts"),
  `import { defineConfig } from "vite"\nimport { svelte } from "@sveltejs/vite-plugin-svelte"\nimport { viteSingleFile } from "vite-plugin-singlefile"\nexport default defineConfig({ plugins: [svelte(), viteSingleFile()], resolve: { alias: { "@torviello/design/brand": new URL("./src/design/brand", import.meta.url).pathname } }, build: { minify: true } })\n`,
)
writeFileSync(
  join(work, "tsconfig.json"),
  JSON.stringify({
    compilerOptions: {
      target: "esnext",
      module: "esnext",
      moduleResolution: "bundler",
      strict: true,
      skipLibCheck: true,
      types: [],
    },
  }),
)
writeFileSync(join(work, "svelte.config.js"), "export default {}\n")

const install = run(["bun", "install", "--no-save"], work)
expect(install.ok, `bun install in the throwaway directory (${install.ms} ms)`)
const pkgCount = readdirSync(join(work, "node_modules")).filter(
  (d) => !d.startsWith("."),
).length
const nmBytes = dirBytes(join(work, "node_modules"))

const out: Record<string, unknown> = {
  versions: VERSIONS,
  install_ms: install.ms,
  node_modules_top_level_entries: pkgCount,
  node_modules_mb: +(nmBytes / 1048576).toFixed(1),
}
const hashes: string[] = []
const sizes: number[] = []
for (let i = 1; i <= 2; i++) {
  rmSync(join(work, "dist"), { recursive: true, force: true })
  const b = run(["bunx", "--bun", "vite", "build"], work)
  expect(b.ok, `vite build ${i} (${b.ms} ms)`)
  if (!b.ok) console.log(b.out)
  const f = join(work, "dist/index.html")
  expect(existsSync(f), `build ${i} produced a single dist/index.html`)
  if (!existsSync(f)) break
  expect(
    readdirSync(join(work, "dist")).length === 1,
    `build ${i} produced exactly one file (no side assets)`,
  )
  hashes.push(sha(f))
  sizes.push(statSync(f).size)
  out[`build_${i}_ms`] = b.ms
}
if (hashes.length === 2) {
  expect(
    hashes[0] === hashes[1],
    "two builds in the same directory are byte-identical",
  )
  out.single_file_bytes = sizes[0]
  out.sha256 = hashes[0]
  const html = readFileSync(join(work, "dist/index.html"), "utf8")
  expect(
    /<script[^>]*>[\s\S]*mount|<script/.test(html),
    "the output carries a client runtime script (static markup is not produced; the component hydrates itself)",
  )
  // second location: reproducibility must not depend on the path of the build directory
  const work2 = join(work, "..", `${work.split("/").pop()}-b`)
  rmSync(work2, { recursive: true, force: true })
  Bun.spawnSync(["cp", "-R", work, work2]) // cp keeps the node_modules symlinks intact
  rmSync(join(work2, "dist"), { recursive: true, force: true })
  const b2 = run(["bunx", "--bun", "vite", "build"], work2)
  if (!b2.ok) console.log(b2.out)
  const same = b2.ok && sha(join(work2, "dist/index.html")) === hashes[0]
  out.same_bytes_in_another_directory = same
  expect(same, "a build in a different directory path is byte-identical")
  rmSync(work2, { recursive: true, force: true })
}
out.component_count_measured = 1
out.build_steps = [
  "bun install (4 devDependencies)",
  "vite build (svelte plugin + singlefile plugin + alias for @torviello/design/brand)",
]
writeFileSync(join(HERE, "q5-result.json"), `${JSON.stringify(out, null, 2)}\n`)
console.log(JSON.stringify(out))
process.exit(fails.length ? 1 : 0)

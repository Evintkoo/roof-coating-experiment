// Runs every plan 08 spike script one after the other; exits 0 only when each one exits 0.
const steps = [
  "preflight.ts",
  "q5_heat.ts",
  "q4_controls.ts",
  "q6_wiring.ts",
  "q1_cost.ts",
  "q2_height.ts",
]
let bad = 0
for (const s of steps) {
  const p = Bun.spawnSync(
    ["nice", "-n", "10", "bun", new URL(`./${s}`, import.meta.url).pathname],
    { stdout: "pipe", stderr: "pipe" },
  )
  const out = p.stdout
    .toString()
    .split("\n")
    .filter((l) => !l.startsWith('{"ts"'))
  console.log(`== ${s}: exit ${p.exitCode}`)
  console.log(out.join("\n"))
  if (p.exitCode !== 0) {
    bad++
    console.log(p.stderr.toString().slice(0, 2000))
  }
}
process.exit(bad === 0 ? 0 : 1)

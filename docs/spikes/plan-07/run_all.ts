// Runs every plan 07 spike script one after the other; exits 0 only when each one exits 0.
const steps = [
  "q1_cost_and_merge.ts",
  "q5_q6_data_and_rays.ts",
  "q1_q2_q4_chrome.ts",
  "q3_height.ts",
]
let bad = 0
for (const s of steps) {
  const p = Bun.spawnSync(
    ["bun", new URL(`./${s}`, import.meta.url).pathname],
    { stdout: "pipe", stderr: "pipe" },
  )
  const out = p.stdout
    .toString()
    .split("\n")
    .filter((l) => !l.startsWith('{"ts"'))
  console.log(`== ${s}: exit ${p.exitCode}`)
  console.log(out.join("\n"))
  if (p.exitCode !== 0) bad++
}
process.exit(bad === 0 ? 0 : 1)

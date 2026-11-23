// Runs every plan 09 spike script one after the other; exits 0 only when each one exits 0 (Q2 and Q6 need Chrome and run last).
const steps = [
  "preflight.ts",
  "q4_stepper.ts",
  "q3_bands.ts",
  "q1_cost.ts",
  "q2_q6_chrome.ts",
]
let bad = 0
for (const s of steps) {
  const p = Bun.spawnSync(
    ["nice", "-n", "10", "bun", new URL(`./${s}`, import.meta.url).pathname],
    { stdout: "pipe", stderr: "pipe" },
  )
  console.log(`== ${s}: exit ${p.exitCode}`)
  console.log(
    p.stdout
      .toString()
      .split("\n")
      .filter((l) => !l.startsWith('{"ts"'))
      .join("\n"),
  )
  if (p.exitCode !== 0) {
    bad++
    console.log(p.stderr.toString().slice(0, 2000))
  }
}
process.exit(bad === 0 ? 0 : 1)

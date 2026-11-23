import { expect, test } from "bun:test"
import { run } from "./helpers"

test("aCliChildPastTheTimeoutIsKilledAndTheCallRejectsWithAReason", async () => {
  // 1 ms is far below any CLI start-up, so the child is still running when the timer fires
  await expect(run(["--help"], {}, 1)).rejects.toThrow(
    /cli hung: killed after 1 ms/,
  )
})

test("aCliChildWithinTheTimeoutStillReturnsItsResult", async () => {
  const r = await run(["--help"])
  expect(typeof r.exitCode).toBe("number")
})

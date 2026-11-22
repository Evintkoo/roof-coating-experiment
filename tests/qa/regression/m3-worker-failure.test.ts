// Regression for docs/qa/bugs.md m3: a failed live worker (cannot start, or crashes after the first run) leaves a visible, loud
// message, unavailable tiles and disabled controls; nothing stays stale or climbs. Pre-fix commit 39adac6: blank tiles, tiny status,
// active sliders, and no message at all after a crash.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

const state = (page: Awaited<ReturnType<QaBrowser["open"]>>) =>
  page.evaluate(() => {
    const s = document.getElementById("live-status") as HTMLElement
    const live = document.getElementById("live-root") as HTMLElement
    return {
      text: s.textContent ?? "",
      role: s.getAttribute("role"),
      px: Number.parseFloat(getComputedStyle(s).fontSize),
      body: Number.parseFloat(getComputedStyle(document.body).fontSize),
      enabled: [...live.querySelectorAll("input,select")].filter(
        (e) => !(e as HTMLInputElement).disabled,
      ).length,
      tiles: [...live.querySelectorAll(".tile-value")].map((e) =>
        (e.textContent ?? "").trim(),
      ),
      requested: live.dataset.requested,
    }
  })

test("workerThatCannotStartIsLoudAndControlsAreOff", async () => {
  const page = await qa.open({
    init: "window.Worker = function () { throw new Error('no workers') }",
  })
  const s = await state(page)
  expect(s.text.length).toBeGreaterThan(20)
  expect(s.role).toBe("alert")
  expect(s.px).toBeGreaterThanOrEqual(s.body)
  expect(s.enabled).toBe(0)
  expect(s.tiles.every((t) => t !== "")).toBe(true)
}, 60_000)

test("workerThatCrashesAfterStartIsLoudAndNothingStaysStale", async () => {
  const init = `(() => {
    const Real = window.Worker
    window.Worker = class extends Real {
      constructor(u) { super(u); this.n = 0 }
      postMessage(m) {
        if (m && m.type === "run" && ++this.n === 2) { this.terminate(); setTimeout(() => this.dispatchEvent(new ErrorEvent("error", { message: "crash" })), 10); return }
        super.postMessage(m)
      }
    }
  })()`
  const page = await qa.open({ init })
  await page.evaluate(() => {
    ;(document.getElementById("details-live") as HTMLDetailsElement).open = true
  })
  await page.waitForFunction(
    () =>
      (document.getElementById("live-root") as HTMLElement).dataset.shown !==
      "0",
  )
  await page.locator("#live-num-midcoat_tio2_fraction").fill("0.3")
  await page.waitForFunction(
    () => (document.getElementById("live-status")?.textContent ?? "") !== "",
  )
  const s = await state(page)
  expect(s.role).toBe("alert")
  expect(s.px).toBeGreaterThanOrEqual(s.body)
  expect(s.enabled).toBe(0)
  expect(s.tiles.every((t) => t === "unavailable")).toBe(true)
  const r = s.requested
  await page.waitForTimeout(200)
  expect((await state(page)).requested).toBe(r)
}, 60_000)

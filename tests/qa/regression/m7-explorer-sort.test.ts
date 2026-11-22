// Regression for docs/qa/bugs.md m7: the explorer caption says "sort by any column header", so every column header has a sort
// button, and a text column sorts. Pre-fix commit 041ab2d: two (earlier three) of ten headers had none.
import { afterAll, beforeAll, expect, test } from "bun:test"
import { type QaBrowser, startQa } from "../../support/qaPage"

let qa: QaBrowser
beforeAll(async () => {
  qa = await startQa()
}, 120_000)
afterAll(() => qa?.close())

test("everyExplorerHeaderSortsIncludingTheTextColumns", async () => {
  const page = await qa.open()
  const heads = await page.evaluate(() =>
    [...document.querySelectorAll("#tbl-explorer thead th")].map((t) => ({
      label: t.textContent?.trim() ?? "",
      button: !!t.querySelector("button"),
      sort: t.getAttribute("aria-sort"),
    })),
  )
  expect(heads.length).toBe(10)
  for (const h of heads) {
    expect(h.button, h.label).toBe(true)
    expect(h.sort, h.label).toBe("none")
  }
  await page.evaluate(() => {
    ;(document.getElementById("details-explorer") as HTMLDetailsElement).open =
      true
  })
  const btn = page
    .locator("#tbl-explorer thead th", { hasText: "Shortlist role" })
    .locator("button")
  await btn.click()
  const roles = await page.evaluate(() =>
    [...document.querySelectorAll("#tbl-explorer tbody tr")].map((r) =>
      (r.lastElementChild?.textContent ?? "").trim(),
    ),
  )
  const filled = roles.filter((r) => r !== "")
  expect(filled).toEqual(
    [...filled].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())),
  )
}, 60_000)

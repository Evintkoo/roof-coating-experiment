// Regression for docs/qa/bugs.md m4: "How the layers work" does not call W8 the hottest day for the recipes (it is hottest for bare
// aluminium only; the cards name the recipes' own hottest scenario). Pre-fix commit 041ab2d: "On the hottest modelled day (W8) ... recipes at ...".
import { expect, test } from "bun:test"
import { visibleText } from "../../helpers"
import { qaReport } from "../../support/qaPage"

test("theWhySentenceScopesTheHottestDayToBareAluminium", async () => {
  const { html } = await qaReport()
  const text = visibleText(html).replace(/\s+/g, " ")
  expect(text).not.toContain("On the hottest modelled day")
  expect(text).toMatch(
    /On the day bare aluminium is hottest \(W\d\) it peaks at [\d.]+ °C and the three recipes at/,
  )
})

// Regression for docs/qa/bugs.md c5: the visible page has no role codes (high_performing, low_cost) and no unexplained
// "s p90 train nominal". Pre-fix commit 041ab2d.
import { expect, test } from "bun:test"
import { visibleText } from "../../helpers"
import { qaReport } from "../../support/qaPage"

test("noRoleCodesOrRawRobustNamesInTheVisibleText", async () => {
  const { html } = await qaReport()
  // file names in the provenance listing (candidate_cards/high_performing_SP-075.md) are paths, not wording
  const text = visibleText(html).replace(/candidate_cards\/\S+/g, "")
  expect(text).not.toMatch(/high_performing|low_cost/)
  expect(text).not.toMatch(/s p90 train nominal|s p95 fresh|regret p95/)
  expect(text).toContain("Highest cooling")
  expect(text).toContain("p90 over the training draws")
})

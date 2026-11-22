import { buildTestRun } from "../../helpers"
import { optimisationSuite } from "../../suites/optimisation"

// Proof tier (bun run proof): the same suite body on a run directory built by the real `run` CLI (4 draws), as the file did before
// the fast tier moved to the committed fixture.
optimisationSuite({ tier: "proof", base: buildTestRun })

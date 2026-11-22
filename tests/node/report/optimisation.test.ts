import { bareFixtureRun } from "../../helpers"
import { optimisationSuite } from "../../suites/optimisation"

// Fast tier (bun run check): the run directory is the committed fixture (tests/fixtures/report-run) with its refine and indonesia
// outputs stripped, so no `run` is executed and no hook can time out under load. The proof twin builds the same base with the real CLI.
optimisationSuite({ tier: "fast", base: bareFixtureRun })

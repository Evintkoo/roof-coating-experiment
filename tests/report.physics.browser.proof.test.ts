import { PHYSICS_PROOF, physicsBrowserSuite } from "./suites/physicsBrowser"

// Proof tier (bun run proof): the same suite body with 200 live moves, 20 open and close cycles and the frame budget at 1x and 4x throttle.
physicsBrowserSuite(PHYSICS_PROOF)

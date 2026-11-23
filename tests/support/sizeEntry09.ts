// Everything the page would bundle for plans 07 to 09: the plan 08 entry plus the live physics panel (stepper lane, stepper, bands, view,
// components).
import "./sizeEntry08"
import { mountPhysicsPanel } from "../../src/web/anim/physicsPanel"
import { openStepperLane } from "../../src/web/stepperLane"

Object.assign(window, { mountPhysicsPanel, openStepperLane })

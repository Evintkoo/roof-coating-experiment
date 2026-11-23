// Everything the page would bundle for plans 07 and 08: the plan 07 entry plus the comparison and sweep panels and the sweep inline lane.
import "./sizeEntry"
import { mountComparePanel } from "../../src/web/anim/comparePanel"
import { mountSweepPanel } from "../../src/web/anim/sweepPanel"
import { inlineSweepLane } from "../../src/web/pool"

Object.assign(window, { mountComparePanel, mountSweepPanel, inlineSweepLane })

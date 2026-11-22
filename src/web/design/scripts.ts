// The inline behaviour of the components, in one string for the page and the gallery: header sort, tabs, slider fields and the
// disclosure that opens for an anchor inside it. No dependency; each piece is delegated from `document`, so markup added later
// (the budget result) needs no wiring.
import { DISCLOSURE_SCRIPT } from "./molecules/disclosure"
import { SLIDER_SCRIPT } from "./molecules/sliderField"
import { TABS_SCRIPT } from "./molecules/tabs"
import { TABLE_SORT_SCRIPT } from "./organisms/dataTable"

export const COMPONENT_SCRIPT = [
  TABLE_SORT_SCRIPT,
  TABS_SCRIPT,
  SLIDER_SCRIPT,
  DISCLOSURE_SCRIPT,
].join("\n")

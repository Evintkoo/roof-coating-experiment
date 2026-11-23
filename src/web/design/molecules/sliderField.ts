// Report sheet R12: a labelled numeric input (range, optional number box, output) whose value is always text.
import { buildError, esc, finite, fixed, oneOf, tag } from "../html"

export const SLIDER_STATES = ["idle", "disabled", "error"] as const
export type SliderState = (typeof SLIDER_STATES)[number]

export type SliderFieldProps = {
  id: string
  label: string
  min: number
  max: number
  step: number
  value: number
  unit?: string
  digits?: number
  numberInput?: boolean
  state?: SliderState
  /** Required for `error`. */
  message?: string
}

const C = "SliderField"

export function sliderField(p: SliderFieldProps): string {
  const state = oneOf(C, SLIDER_STATES, p.state ?? "idle")
  if (!/^[A-Za-z][A-Za-z0-9_-]*$/.test(p.id))
    return buildError(C, "id must be a plain identifier")
  if (typeof p.label !== "string" || p.label.trim() === "")
    return buildError(C, "a slider needs a label")
  const min = finite(C, "min", p.min)
  const max = finite(C, "max", p.max)
  const step = finite(C, "step", p.step)
  const value = finite(C, "value", p.value)
  if (!(min < max) || !(step > 0) || value < min || value > max)
    return buildError(C, "need min < max, step > 0 and min <= value <= max")
  if (state === "error" && (p.message === undefined || p.message.trim() === ""))
    return buildError(C, "the error state needs a message")
  const shown = fixed(C, value, p.digits)
  const disabled = state === "disabled"
  const invalid = state === "error"
  const msgId = `${p.id}-msg`
  const describedBy = `${p.id}-out${invalid ? ` ${msgId}` : ""}`
  const common = {
    min,
    max,
    step,
    disabled,
    "aria-invalid": invalid ? true : undefined,
  }
  const range = tag(
    "input",
    {
      type: "range",
      id: p.id,
      class: "tv-slider__range",
      value,
      "aria-describedby": describedBy,
      ...common,
    },
    undefined,
  )
  const num = p.numberInput
    ? tag(
        "input",
        {
          type: "number",
          id: `${p.id}-num`,
          class: "tv-slider__number",
          "aria-label": `${p.label} (number)`,
          value,
          "aria-describedby": describedBy,
          ...common,
        },
        undefined,
      )
    : ""
  const out = tag(
    "output",
    {
      id: `${p.id}-out`,
      class: "tv-slider__out",
      for: p.numberInput ? `${p.id} ${p.id}-num` : p.id,
    },
    esc(shown),
  )
  return tag(
    "div",
    {
      class: "tv-slider",
      "data-slider": true,
      "data-state": state,
      "data-digits": p.digits ?? 2,
    },
    tag("label", { class: "tv-slider__label", for: p.id }, esc(p.label)) +
      (p.unit ? tag("span", { class: "tv-slider__unit" }, esc(p.unit)) : "") +
      tag("div", { class: "tv-slider__row" }, range + num + out) +
      (invalid
        ? tag(
            "p",
            { class: "tv-slider__msg", id: msgId },
            esc(p.message as string),
          )
        : ""),
  )
}

/** A value within 1e-9 of the range of a bound is the bound (Chrome rounds a range value 4e-16 below its exact maximum). */
export function snapToBounds(v: number, min: number, max: number): number {
  const eps = (max - min) * 1e-9
  return v >= max - eps ? max : v <= min + eps ? min : v
}

/** Keeps range, number box and output in step; clamps a typed value on change; fires `slider-change` with `detail.value`. */
export const SLIDER_SCRIPT = `(function(){
function parts(root){return{range:root.querySelector('input[type="range"]'),num:root.querySelector('input[type="number"]'),out:root.querySelector("output")}}
function show(root,v){var p=parts(root);var d=Number(root.getAttribute("data-digits"))||0;if(p.range)p.range.value=String(v);if(p.num)p.num.value=String(v);if(p.out)p.out.textContent=Number(v).toFixed(d)}
function snap(p,v){var lo=Number(p.range.min),hi=Number(p.range.max),e=(hi-lo)*1e-9;return v>=hi-e?hi:v<=lo+e?lo:v}
function clamp(p,v){var lo=Number(p.range.min),hi=Number(p.range.max);return Math.min(hi,Math.max(lo,v))}
function fire(root,v){root.dispatchEvent(new CustomEvent("slider-change",{bubbles:true,detail:{value:v}}))}
document.addEventListener("input",function(ev){var el=ev.target;var root=el&&el.closest&&el.closest("[data-slider]");if(!root)return;var v=Number(el.value);if(el.value===""||!isFinite(v))return;var p=parts(root);if(el.type==="number"&&(v<Number(p.range.min)||v>Number(p.range.max)))return;if(el.type==="range")v=snap(p,v);show(root,v);fire(root,v)});
document.addEventListener("change",function(ev){var el=ev.target;var root=el&&el.closest&&el.closest("[data-slider]");if(!root||el.type!=="number")return;var p=parts(root);var v=Number(el.value);if(el.value===""||!isFinite(v))v=snap(p,Number(p.range.value));v=clamp(p,v);show(root,v);fire(root,v)});
})();`

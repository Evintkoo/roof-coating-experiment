// Report sheet R41: the live physics panel (plan 09): the recipe and bare aluminium side by side, each a scene and a temperature drop,
// the play and step controls, three sliders bound to the live simulator, the live difference and the notes. Markup only;
// src/web/anim/physicsPanel.ts runs the stepper and moves it. Nothing here moves until Play is pressed; under reduced motion nothing
// moves until a press, and then only by one model hour per press.
import { badge } from "../atoms/badge"
import { SPEEDS, type Speed, speedText } from "../atoms/speedSelect"
import { buildError, esc, finite, oneOf, tag } from "../html"
import { type DropProfileProps, dropProfile } from "../molecules/dropProfile"
import { type PhysicsSceneProps, physicsScene } from "../molecules/physicsScene"
import { sliderField } from "../molecules/sliderField"
import { HONESTY_LABEL } from "./watchDay"

export const PHYSICS_STATES = [
  "idle",
  "playing",
  "paused",
  "transient",
  "error",
] as const
export type PhysicsState = (typeof PHYSICS_STATES)[number]
export const PHYSICS_LAYERS = ["midcoat", "primer", "topcoat"] as const
export const PHYSICS_NOTES = {
  scale: "Illustrative scale: layer thicknesses are not to scale.",
  rays: "Rays show fractions, not photons: how many fall follows the sunlight, and the share reflected in each band (UV, visible, near infrared) is the model's.",
  drop: "The model has one surface temperature, not a temperature per layer; the drawing joins the surface and inside temperatures with the model's own conduction law.",
  scope:
    "Initial values only: ageing is not shown. Bare aluminium is the model's control C0.",
} as const
export const TRANSIENT_NOTE =
  "Transient after your change, not the settled day."
export const STATE_WORDS: Record<PhysicsState, string> = {
  idle: "Press Play to start the day at 00:00. Nothing moves until you do; the sun rises at 06:00.",
  playing: "Running the model live in your browser.",
  paused: "Paused.",
  transient: TRANSIENT_NOTE,
  error: "The live physics could not run. The other panels are unaffected.",
}
export const RANGE_NOTE = "value outside the model range"

export type PhysicsPaneProps = {
  scene: Omit<PhysicsSceneProps, "pane" | "source">
  drop: Omit<DropProfileProps, "source">
}
export type PhysicsSlider = {
  id: string
  label: string
  unit: string
  min: number
  max: number
  step: number
  value: number
}
export type WatchPhysicsProps = {
  state: PhysicsState
  speed: Speed
  reduced: boolean
  lane: "worker" | "inline"
  layerOff?: (typeof PHYSICS_LAYERS)[number]
  recipe: PhysicsPaneProps
  aluminium: PhysicsPaneProps
  sliders: readonly PhysicsSlider[]
  id?: string
}

const C = "WatchPhysics"

export function watchPhysics(p: WatchPhysicsProps): string {
  const state = oneOf(C, PHYSICS_STATES, p.state)
  const speed = oneOf(C, SPEEDS.map(String), String(p.speed))
  if (p.layerOff !== undefined) oneOf(C, PHYSICS_LAYERS, p.layerOff)
  const lane = oneOf(C, ["worker", "inline"] as const, p.lane)
  if (p.sliders.length !== 3)
    return buildError(C, "the panel carries three sliders: sun, air and wind")
  const pane = (
    name: "recipe" | "aluminium",
    title: string,
    q: PhysicsPaneProps,
  ) =>
    tag(
      "figure",
      { class: "tv-watchphysics__pane", "data-pane": name },
      `<figcaption class="tv-watchphysics__title">${esc(title)}</figcaption>` +
        `<div class="tv-watchphysics__drawing">${physicsScene({ ...q.scene, pane: name, source: `stepper:${name}` })}${dropProfile({ ...q.drop, source: `stepper:${name}` })}</div>`,
    )
  const sliders = p.sliders
    .map((s) =>
      sliderField({
        id: s.id,
        label: s.label,
        unit: s.unit,
        min: finite(C, "min", s.min),
        max: s.max,
        step: s.step,
        value: s.value,
        digits: 1,
      }),
    )
    .join("")
  const speeds = SPEEDS.map((s) =>
    tag("option", { value: String(s), selected: s === p.speed }, speedText(s)),
  ).join("")
  const playing = state === "playing"
  const controls =
    `<button type="button" class="tv-play" data-anim="phys-play" data-state="${playing ? "playing" : "paused"}" aria-label="${playing ? "Pause the live physics" : "Play the live physics"}"><span class="tv-play__glyph" aria-hidden="true"></span><span class="tv-play__text">${playing ? "Pause" : "Play"}</span></button>` +
    `<button type="button" class="tv-play tv-play--step" data-anim="phys-step" aria-label="Forward one model hour">+1 h</button>` +
    `<button type="button" class="tv-play tv-play--step" data-anim="phys-restart" aria-label="Restart the day from the batch state">Restart day</button>` +
    `<label class="tv-speed"><span class="tv-speed__label">Speed</span><select class="tv-speed__select" data-anim="phys-speed">${speeds}</select></label>` +
    `<output class="tv-time" data-anim="phys-time" data-value="0">day 2, 00:00</output>`
  void speed
  return tag(
    "div",
    {
      class: "tv-watchphysics",
      id: p.id,
      role: "group",
      "aria-label":
        "Live physics: sunlight, heat flows and surface temperature, recipe against bare aluminium",
      "data-watch-physics": true,
      "data-state": state,
      "data-lane": lane,
      "data-reduced": p.reduced,
    },
    `<div class="tv-watchphysics__label">${badge({ tone: "neutral", label: HONESTY_LABEL })}</div>` +
      `<div class="tv-watchphysics__controls">${controls}</div>` +
      `<div class="tv-watchphysics__sliders">${sliders}</div>` +
      `<p class="tv-watchphysics__status" role="status" aria-live="polite" data-anim="phys-status">${esc(STATE_WORDS[state])}</p>` +
      `<p class="page-hint" data-anim="phys-layer-off"${p.layerOff ? "" : " hidden"}>${esc(p.layerOff ? `${p.layerOff[0]?.toUpperCase()}${p.layerOff.slice(1)} is off in the live simulator, so the recipe column shows the layers that are on.` : "")}</p>` +
      `<p class="page-hint" data-anim="phys-lane"${lane === "inline" ? "" : " hidden"}>single lane</p>` +
      `<div class="tv-watchphysics__panes">${pane("recipe", "Coated recipe", p.recipe)}${pane("aluminium", "Bare aluminium", p.aluminium)}</div>` +
      `<dl class="tv-watchphysics__readouts"><div><dt>Recipe minus aluminium</dt><dd><output data-anim="phys-diff" data-source="stepper:recipe:t_k-stepper:aluminium:t_k" data-value="">–</output> K</dd></div>` +
      `<div><dt>Heat balance residual, recipe</dt><dd><output data-anim="phys-residual" data-source="stepper:recipe:residual" data-value="">–</output> W/m²</dd></div></dl>` +
      `<p class="page-hint">${esc(PHYSICS_NOTES.scale)} ${esc(PHYSICS_NOTES.rays)}</p>` +
      `<p class="page-hint">${esc(PHYSICS_NOTES.drop)} ${esc(PHYSICS_NOTES.scope)}</p>`,
  )
}

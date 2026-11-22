// Report sheet R24: the play and pause control of every moving region (plan 07 H6). A real button whose name and visible text
// both say what pressing it does; the state is a closed union.
import { oneOf, tag } from "../html"

export const PLAY_STATES = ["paused", "playing", "ended"] as const
export type PlayState = (typeof PLAY_STATES)[number]
const WORDS: Record<PlayState, { label: string; aria: string }> = {
  paused: { label: "Play", aria: "Play the day" },
  playing: { label: "Pause", aria: "Pause the day" },
  ended: { label: "Replay", aria: "Replay the day" },
}

export function playButton(p: { state: PlayState }): string {
  const state = oneOf("PlayButton", PLAY_STATES, p.state)
  const w = WORDS[state]
  return tag(
    "button",
    {
      type: "button",
      class: "tv-play",
      "data-anim": "play",
      "data-state": state,
      "aria-label": w.aria,
    },
    `<span class="tv-play__glyph" aria-hidden="true"></span><span class="tv-play__text">${w.label}</span>`,
  )
}
export const PLAY_WORDS = WORDS

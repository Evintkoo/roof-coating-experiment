<!-- Copyright (c) 2026 Torviello. -->
<!-- Window chrome shared by the documented session and the illustrative
     install card: three brand-hue dots, a mono note, an optional action slot,
     and the body. The tone picks the halo (teal = verified, orange = example). -->
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    note: string;
    tone?: "plain" | "teal" | "orange";
    /** Chrome utility rendered after the note (e.g. the copy chip). */
    actions?: Snippet;
    children: Snippet;
  }

  let { note, tone = "plain", actions, children }: Props = $props();
</script>

<div class="tv-terminal-card__window" data-tone={tone}>
  <div class="tv-terminal-card__chrome">
    <span class="tv-terminal-card__dots" aria-hidden="true">
      <span class="tv-terminal-card__dot"></span>
      <span class="tv-terminal-card__dot"></span>
      <span class="tv-terminal-card__dot"></span>
    </span>
    <p class="tv-terminal-card__note">{note}</p>
    {@render actions?.()}
  </div>
  {@render children()}
</div>

<style>
  .tv-terminal-card__window {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--tv-surface-canvas);
    border: 1px solid var(--tv-border-panel-strong);
    border-radius: var(--tv-radius-control);
    overflow: hidden;
  }

  /* Halos: teal marks the verified session, orange the illustrative example */
  .tv-terminal-card__window[data-tone="teal"] {
    box-shadow:
      0 0 0 1px color-mix(in srgb, var(--tv-accent-secondary) 22%, transparent),
      0 28px 72px color-mix(in srgb, var(--tv-color-canvas) 74%, transparent);
  }

  .tv-terminal-card__window[data-tone="orange"] {
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--tv-color-warm-white) 8%, transparent) inset,
      0 0 0 1px color-mix(in srgb, var(--tv-action-primary) 10%, transparent),
      0 24px 64px color-mix(in srgb, var(--tv-color-canvas) 70%, transparent);
  }

  .tv-terminal-card__chrome {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--tv-space-2);
    padding: var(--tv-space-2) var(--tv-space-3);
    border-bottom: 1px solid var(--tv-border-panel);
  }

  .tv-terminal-card__dots {
    display: inline-flex;
    gap: var(--tv-space-1);
  }

  /* Window dots in brand hues: primary, light, teal (board traffic lights,
     rendered token-pure per the sheet M8 note) */
  .tv-terminal-card__dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--tv-action-primary);
  }

  .tv-terminal-card__dot:nth-child(2) {
    background: var(--tv-accent-orange-light);
  }

  .tv-terminal-card__dot:nth-child(3) {
    background: var(--tv-accent-secondary);
  }

  .tv-terminal-card__note {
    margin: 0;
    color: var(--tv-text-muted);
    font-family: var(--tv-font-mono);
    font-size: var(--tv-size-small);
    letter-spacing: 0.08em;
    text-transform: uppercase;
  }
</style>

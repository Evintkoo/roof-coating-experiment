<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet M8 (slice 3, ticket 0038; LP-06 amendment ticket 0041): the terminal
     execution showcase card. The pip/serve commands are the board's design
     example — a visible mono label marks the card ILLUSTRATIVE so nothing
     reads as verified engine behavior. The chrome carries a Copy chip for the
     install command: it writes to the clipboard only on success and confirms
     with a "Copied" state. Real selectable text, window chrome, and a
     four-step status rail with an orange connector line. -->
<script lang="ts">
  import { copyText } from "../../features/copy-command/copy-command";
  import type { InstallExample } from "../../content/types";
  import TerminalLine from "./TerminalLine.svelte";
  import TerminalWindow from "./TerminalWindow.svelte";

  interface Props extends InstallExample {
    /** Bare drops the card frame so the window sits directly in its band (ticket 0040). */
    bare?: boolean;
  }

  let { commands, steps, bare = false }: Props = $props();

  let copied = $state(false);
  let resetTimer: ReturnType<typeof setTimeout> | undefined;

  async function copyInstall() {
    // Unavailable or denied clipboard: the chip stays "Copy" (no fake success).
    if (!(await copyText(commands[0] ?? "", navigator.clipboard))) return;
    copied = true;
    clearTimeout(resetTimer);
    resetTimer = setTimeout(() => (copied = false), 2000);
  }

  $effect(() => () => clearTimeout(resetTimer));
</script>

<article class="tv-showcase-card tv-showcase-card--terminal" class:tv-showcase-card--bare={bare}>
  <div class="tv-terminal-card" class:tv-terminal-card--bare={bare}>
    <TerminalWindow note="Illustrative example" tone={bare ? "orange" : "plain"}>
      {#snippet actions()}
        <button
          type="button"
          class="tv-terminal-card__copy"
          aria-label="Copy install command"
          onclick={copyInstall}
        >
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      {/snippet}
      <pre class="tv-terminal-card__transcript"
        >{#each commands as command (command)}<TerminalLine kind="prompt" text={command} />{/each}</pre
      >
      <ol class="tv-terminal-card__rail">
        {#each steps as step, index (step)}
          <li class="tv-terminal-card__step" data-step={index + 1}>
            <span class="tv-terminal-card__marker" aria-hidden="true"></span>
            <span class="tv-terminal-card__step-text">{step}</span>
          </li>
        {/each}
      </ol>
    </TerminalWindow>
  </div>
</article>

<style>
  /* M8 TerminalCard — the illustrative terminal execution showcase */
  .tv-showcase-card--terminal {
    background: var(--tv-surface-card);
    border: 1px solid var(--tv-border-panel);
    border-radius: var(--tv-radius-panel);
  }

  /* Ticket 0040: in its own full-width band the card chrome belongs to the
     band and the window fills it. */
  .tv-showcase-card--bare {
    background: transparent;
    border: 0;
    border-radius: 0;
  }

  .tv-terminal-card {
    height: 100%;
    padding: var(--tv-space-6);
  }

  .tv-terminal-card--bare {
    padding: 0;
  }

  /* LP-06 Copy chip — a chrome utility, not an A1/A2 button: text-only,
     keyboard operable, confirms only on real clipboard success */
  .tv-terminal-card__copy {
    display: inline-flex;
    align-items: center;
    min-height: 32px;
    padding: var(--tv-space-1) var(--tv-space-3);
    background: transparent;
    border: 1px solid var(--tv-border-glass);
    border-radius: var(--tv-radius-control);
    color: var(--tv-text-muted);
    font-family: var(--tv-font-mono);
    font-size: var(--tv-size-micro);
    letter-spacing: 0.1em;
    text-transform: uppercase;
    cursor: pointer;
    white-space: nowrap;
    transition:
      color 120ms ease,
      border-color 120ms ease;
  }

  .tv-terminal-card__copy:hover {
    color: var(--tv-text-primary);
    border-color: color-mix(in srgb, var(--tv-action-primary) 45%, transparent);
  }

  .tv-terminal-card__transcript {
    margin: 0;
    padding: var(--tv-space-4);
    overflow-x: auto;
    font-family: var(--tv-font-mono);
    font-size: var(--tv-size-small);
    white-space: pre;
  }

  .tv-terminal-card__transcript :global(.tv-terminal-line) {
    font-size: var(--tv-size-small);
  }

  .tv-terminal-card__rail {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--tv-space-4);
    margin: 0;
    padding: var(--tv-space-2) var(--tv-space-4) var(--tv-space-6) var(--tv-space-4);
    list-style: none;
  }

  /* The connector line joins the markers; markers stay pure orange */
  .tv-terminal-card__rail::before {
    content: "";
    position: absolute;
    top: var(--tv-space-3);
    bottom: var(--tv-space-4);
    left: calc(var(--tv-space-4) + 5px);
    width: 1px;
    background: color-mix(in srgb, var(--tv-action-primary) 55%, transparent);
  }

  .tv-terminal-card__step {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--tv-space-3);
  }

  .tv-terminal-card__marker {
    flex-shrink: 0;
    width: 11px;
    height: 11px;
    border-radius: 50%;
    background: var(--tv-action-primary);
    box-shadow: 0 0 0 3px color-mix(in srgb, var(--tv-action-primary) 18%, transparent);
  }

  .tv-terminal-card__step-text {
    color: var(--tv-text-muted);
    font-family: var(--tv-font-mono);
    font-size: var(--tv-size-small);
  }

  .tv-terminal-card__step:last-child .tv-terminal-card__step-text {
    color: var(--tv-accent-secondary);
  }

  @keyframes tv-rail-in {
    from {
      opacity: 0;
      transform: translateY(4px);
    }
  }

  /* The rail cascades in only where motion is welcome; static and complete
     otherwise (A6 invariant) */
  @media (prefers-reduced-motion: no-preference) {
    .tv-terminal-card__step {
      animation: tv-rail-in 400ms ease both;
    }

    .tv-terminal-card__step:nth-child(2) {
      animation-delay: 120ms;
    }

    .tv-terminal-card__step:nth-child(3) {
      animation-delay: 240ms;
    }

    .tv-terminal-card__step:nth-child(4) {
      animation-delay: 360ms;
    }
  }
</style>

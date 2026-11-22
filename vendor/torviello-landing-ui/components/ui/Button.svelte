<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet A1/A2: one primary action per view; ghost is the secondary pairing,
     inverse the closing band's primary. With an href it renders an anchor and
     owns the external-link attributes; without one it is a button. House rule
     10: the icon pairs with the label and stays decorative. -->
<script lang="ts">
  import { linkAttrs } from "../../lib/link";
  import type { IconName } from "../../lib/icons";
  import Icon from "./Icon.svelte";

  export type ButtonVariant = "primary" | "ghost" | "inverse";
  export type ButtonState = "idle" | "loading" | "error" | "empty";

  interface Props {
    label: string;
    variant?: ButtonVariant;
    state?: ButtonState;
    icon?: IconName;
    /** When set the control is a link to this destination. */
    href?: string;
    /** The link leaves the site: new tab, no opener. */
    external?: boolean;
    onclick?: () => void;
  }

  let { label, variant = "primary", state = "idle", icon, href, external, onclick }: Props = $props();
</script>

{#if href}
  <a class="tv-button tv-button--{variant}" {href} {...linkAttrs(external)}>
    {#if icon}<Icon name={icon} />{/if}{label}
  </a>
{:else}
  <button
    type="button"
    class="tv-button tv-button--{variant}"
    aria-busy={state === "loading"}
    aria-disabled={state === "loading" ? "true" : "false"}
    data-state={state}
    {onclick}
  >
    {#if icon}<Icon name={icon} />{/if}{label}
  </button>
{/if}

<style>
  /* A1 Button — primary: the single primary action of a view */
  .tv-button {
    display: inline-flex;
    align-items: center;
    gap: var(--tv-space-2);
    min-height: 44px;
    padding: var(--tv-space-2) var(--tv-space-4);
    border: 1px solid transparent;
    border-radius: var(--tv-radius-control);
    font-family: var(--tv-font-sans);
    font-size: var(--tv-size-body);
    font-weight: var(--tv-weight-semibold);
    text-decoration: none;
    cursor: pointer;
    /* Button labels never wrap; the tablet rail drops a redundant action
       instead (LP-01, 2026-11-03) */
    white-space: nowrap;
    transition:
      background-color 120ms ease,
      border-color 120ms ease,
      transform 120ms ease;
  }

  .tv-button:active:not([aria-disabled="true"]) {
    transform: scale(0.98);
  }

  /* House rule 8: the paired icon nudges toward the label's direction on hover
     and keyboard focus — visible feedback on every activation path */
  .tv-button :global(.tv-icon) {
    transition: transform 120ms ease;
  }

  .tv-button:hover :global(.tv-icon),
  .tv-button:focus-visible :global(.tv-icon) {
    transform: translateX(2px);
  }

  @media (prefers-reduced-motion: reduce) {
    .tv-button :global(.tv-icon) {
      transition: none;
    }

    .tv-button:hover :global(.tv-icon),
    .tv-button:focus-visible :global(.tv-icon) {
      transform: none;
    }
  }

  .tv-button[aria-disabled="true"] {
    cursor: default;
  }

  .tv-button--primary {
    background: linear-gradient(135deg, var(--tv-accent-orange-light), var(--tv-action-primary) 55%);
    color: var(--tv-action-label);
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--tv-color-warm-white) 28%, transparent) inset,
      0 10px 30px color-mix(in srgb, var(--tv-action-primary) 22%, transparent);
  }

  .tv-button--primary:hover:not([aria-disabled="true"]) {
    background: linear-gradient(135deg, var(--tv-accent-orange-light), var(--tv-action-primary-hover) 55%);
    box-shadow:
      0 1px 0 color-mix(in srgb, var(--tv-color-warm-white) 28%, transparent) inset,
      0 14px 40px color-mix(in srgb, var(--tv-action-primary) 32%, transparent);
  }

  /* A2 Button — ghost: secondary pairing with a glass hairline */
  .tv-button--ghost {
    background: transparent;
    border-color: var(--tv-border-glass);
    color: var(--tv-text-primary);
  }

  .tv-button--ghost:hover:not([aria-disabled="true"]) {
    background: var(--tv-surface-glass);
    border-color: color-mix(in srgb, var(--tv-action-primary) 45%, transparent);
  }

  /* LP-07 inverse: midnight fill keeps the 4.5:1 label contrast the
     orange-on-orange pairing loses */
  .tv-button--inverse {
    background: var(--tv-surface-base);
    color: var(--tv-text-primary);
    box-shadow: 0 12px 32px color-mix(in srgb, var(--tv-color-canvas) 45%, transparent);
  }

  .tv-button--inverse:hover:not([aria-disabled="true"]) {
    background: var(--tv-surface-elevated);
    box-shadow: 0 16px 44px color-mix(in srgb, var(--tv-color-canvas) 55%, transparent);
  }

  .tv-button[aria-disabled="true"],
  .tv-button[data-state="loading"] {
    background: var(--tv-surface-raised);
    border-color: var(--tv-border-glass);
    color: var(--tv-text-muted);
  }
</style>

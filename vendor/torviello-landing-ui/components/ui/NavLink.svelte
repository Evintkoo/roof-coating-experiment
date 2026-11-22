<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet A3: top navigation item; focus and current-section states are token-driven. -->
<script lang="ts">
  import { linkAttrs } from "../../lib/link";

  interface Props {
    label: string;
    href: string;
    /** Marks the section the visitor is currently viewing (sheet A3). */
    current?: boolean;
    /** The link leaves the site: new tab, no opener. */
    external?: boolean;
  }

  let { label, href, current = false, external }: Props = $props();
</script>

<a class="tv-navlink" aria-current={current ? "true" : undefined} {href} {...linkAttrs(external)}>
  {label}
</a>

<style>
  .tv-navlink {
    color: var(--tv-text-primary);
    font-family: var(--tv-font-sans);
    font-size: var(--tv-size-label);
    text-decoration: none;
    padding: var(--tv-space-2) var(--tv-space-3);
    border-radius: var(--tv-radius-control);
    min-height: 44px;
    display: inline-flex;
    align-items: center;
  }

  .tv-navlink:hover,
  .tv-navlink[aria-current="true"] {
    text-decoration: underline;
    text-decoration-color: var(--tv-action-primary);
    text-underline-offset: 4px;
  }
</style>

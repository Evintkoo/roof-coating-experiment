<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet A5: brand mark + wordmark as a single home link. The mark is the
     canonical ribbon-T imported from torviello-design (GOV-12.07, ticket
     0036), decorative and aria-hidden; the wordmark carries the name. -->
<script lang="ts">
  import { logoMark } from "../../lib/brand";

  let { href = "#top" }: { href?: string } = $props();
</script>

<a class="tv-logo" {href} aria-label="Torviello home">
  <span class="tv-logo__mark" aria-hidden="true">{@html logoMark}</span>
  <span class="tv-logo__wordmark">torviello</span>
</a>

<style>
  /* A5 Logo lockup — mark + wordmark as the single home link */
  .tv-logo {
    display: inline-flex;
    align-items: center;
    gap: var(--tv-space-2);
    min-height: 44px;
    text-decoration: none;
  }

  .tv-logo__mark {
    display: inline-flex;
    width: 32px;
    height: 32px;
  }

  .tv-logo__mark :global(svg) {
    width: 100%;
    height: 100%;
  }

  .tv-logo__wordmark {
    color: var(--tv-text-primary);
    font-family: var(--tv-font-sans);
    font-size: var(--tv-size-body);
    font-weight: var(--tv-weight-semibold);
  }
</style>

<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet A7: one glyph from the sliced brand asset set, decorative by
     definition; the labeled element carries the accessible name. -->
<script lang="ts">
  import { icons, type IconName } from "../../lib/icons";

  let { name }: { name: IconName } = $props();
</script>

<span class="tv-icon" aria-hidden="true">{@html icons[name]}</span>

<style>
  /* A7 Icon — decorative glyph from the sliced brand assets; color and size
     come from the consuming element's tokens and geometry */
  .tv-icon {
    display: inline-flex;
    flex-shrink: 0;
    width: 20px;
    height: 20px;
  }

  .tv-icon :global(svg) {
    width: 100%;
    height: 100%;
  }
</style>

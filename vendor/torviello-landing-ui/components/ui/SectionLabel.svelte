<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet A4: small all-caps eyebrow above headings ("AI-NATIVE INFERENCE ENGINE"). -->
<script lang="ts">
  interface Props {
    label: string;
    /** Accent variant for eyebrows on the dark hero (sheet A4). */
    accent?: boolean;
    id?: string;
  }

  let { label, accent = false, id }: Props = $props();
</script>

<p {id} class="tv-section-label" class:tv-section-label--accent={accent}>
  {label}
</p>

<style>
  .tv-section-label {
    margin: 0 0 var(--tv-space-3);
    color: var(--tv-text-muted);
    font-family: var(--tv-font-sans);
    font-size: var(--tv-size-label);
    font-weight: var(--tv-weight-semibold);
    letter-spacing: 0.2em;
    text-transform: uppercase;
  }

  .tv-section-label--accent {
    color: var(--tv-action-primary);
  }
</style>

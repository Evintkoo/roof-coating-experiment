<!-- Copyright (c) 2026 Torviello. -->
<!-- Sheet A6: one line of the terminal transcript; real selectable text, not an image. -->
<script lang="ts">
  interface Props {
    text: string;
    /** "prompt" renders a $ marker; "status" renders a teal bullet marker (sheet A6). */
    kind?: "prompt" | "status";
  }

  let { text, kind = "prompt" }: Props = $props();
</script>

<span class="tv-terminal-line tv-terminal-line--{kind}">
  <span class="tv-terminal-line__marker" aria-hidden="true">{kind === "prompt" ? "$" : "•"}</span>
  <span class="tv-terminal-line__text">{text}</span>
</span>

<style>
  .tv-terminal-line {
    display: flex;
    gap: var(--tv-space-3);
    font-family: var(--tv-font-mono);
    font-size: var(--tv-size-body);
    line-height: 1.6;
  }

  .tv-terminal-line__marker {
    color: var(--tv-accent-secondary);
    user-select: none;
  }

  .tv-terminal-line--prompt .tv-terminal-line__text {
    color: var(--tv-text-primary);
  }

  .tv-terminal-line--status .tv-terminal-line__text {
    color: var(--tv-text-muted);
  }
</style>

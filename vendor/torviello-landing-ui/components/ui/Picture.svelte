<!-- Copyright (c) 2026 Torviello. -->
<!-- A responsive image slot: modern sources with a fallback file, intrinsic
     width and height so the browser reserves the box (no layout shift), lazy
     loading by default and an art-directed focal point. The eager variant is
     for the one above-the-fold image. -->
<script lang="ts">
  import type { Picture } from "../../content/types";

  interface Props {
    picture: Picture;
    /** The `sizes` hint for the srcset sources. */
    sizes: string;
    /** Above-the-fold images load eagerly with high fetch priority. */
    eager?: boolean;
  }

  let { picture, sizes, eager = false }: Props = $props();
</script>

<picture class="tv-picture">
  {#each picture.sources as source (source.type)}
    <source type={source.type} srcset={source.srcset} {sizes} />
  {/each}
  <img
    class="tv-picture__img"
    src={picture.src}
    width={picture.width}
    height={picture.height}
    alt={picture.alt}
    loading={eager ? "eager" : "lazy"}
    decoding={eager ? "sync" : "async"}
    fetchpriority={eager ? "high" : undefined}
    style:object-position={picture.focus}
  />
</picture>

<style>
  .tv-picture {
    display: block;
    width: 100%;
    height: 100%;
  }

  .tv-picture__img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
</style>

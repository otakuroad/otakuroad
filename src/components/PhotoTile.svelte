<script lang="ts">
  /**
   * Storefront photo, or the category tile that stands in for one (PLAN §6.8 "빈 슬롯이 없다").
   * The year the photo was taken is always overlaid, because a chunk of the Commons pool is from
   * 2010–2015 and an old storefront must not be read as current (PLAN §8).
   */
  import type { Photo } from '@/data/schema'
  import { photoYear, thumbUrl } from '@/lib/format'
  import type { GlyphKey } from '@/lib/glyphs'
  import { colorFor } from '@/lib/glyphs'
  import Glyph from './Glyph.svelte'

  interface Props {
    photo: Photo | null
    kind: GlyphKey
    /** sm = 44px list thumb, md = 56px building header, lg = 84px card head. */
    size?: 'sm' | 'md' | 'lg'
    dim?: boolean
  }

  let { photo, kind, size = 'sm', dim = false }: Props = $props()

  const px = $derived(size === 'lg' ? 84 : size === 'md' ? 56 : 44)
  const src = $derived(photo === null ? null : size === 'sm' ? thumbUrl(photo) : photo.url)
  const year = $derived(photo === null ? null : photoYear(photo))
</script>

<div class="phwrap {size}" class:dim>
  {#if photo !== null && src !== null}
    <img class="ph" {src} alt="" width={px} height={px} loading="lazy" decoding="async" />
    {#if year}<i class="yr">{year}</i>{/if}
  {:else}
    <div class="ph tile" style:background={colorFor(kind)}>
      <Glyph {kind} size={size === 'lg' ? 40 : size === 'md' ? 26 : 22} />
    </div>
  {/if}
</div>

<style>
  .phwrap {
    position: relative;
    flex: none;
    width: 44px;
    height: 44px;
  }
  .phwrap.md {
    width: 56px;
    height: 56px;
  }
  .phwrap.lg {
    width: 84px;
    height: 84px;
  }
  .phwrap.dim {
    opacity: 0.45;
  }
  .ph {
    width: 100%;
    height: 100%;
    border-radius: 10px;
    object-fit: cover;
    display: block;
    background: #e6e8eb;
  }
  .lg .ph {
    border-radius: 14px;
  }
  .tile {
    display: grid;
    place-items: center;
  }
  .yr {
    position: absolute;
    right: 3px;
    bottom: 3px;
    font-style: normal;
    font-weight: 600;
    font-size: 9.5px;
    line-height: 1;
    letter-spacing: 0.05em;
    color: #fff;
    background: rgba(31, 35, 40, 0.74);
    padding: 2px 4px;
    border-radius: 4px;
    font-variant-numeric: tabular-nums;
  }
  .lg .yr {
    font-size: 10.5px;
    padding: 3px 5px;
    right: 5px;
    bottom: 5px;
  }
</style>

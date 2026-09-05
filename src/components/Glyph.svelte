<script lang="ts">
  /** Inline category/building glyph. Markup comes from our own constants, never from data. */
  import { glyphSvg, type GlyphKey } from '@/lib/glyphs'

  interface Props {
    kind: GlyphKey
    size?: number
    fg?: string
  }

  let { kind, size = 20, fg = '#ffffff' }: Props = $props()

  const markup = $derived(glyphSvg(kind, size, fg))
</script>

<!-- Safe: the markup is generated from src/lib/glyphs.ts constants, never from data. -->
{@html markup}

<script lang="ts">
  /** Open-state pill. Colour is always paired with the text, never a substitute (PLAN §6.5). */
  import { openStateText, openStateTone } from '@/lib/format'
  import type { OpenState } from '@/lib/hours'
  import type { Locale } from '@/i18n'

  interface Props {
    state: OpenState
    locale: Locale
  }

  let { state, locale }: Props = $props()

  const tone = $derived(openStateTone(state))
  const text = $derived(openStateText(state, locale))
</script>

<span class="pill {tone}">{text}</span>

<style>
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
    padding: 5px 11px;
    border-radius: 14px;
    font-variant-numeric: tabular-nums;
  }
  .pill::before {
    content: '';
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    flex: none;
  }
  .open {
    color: #1a7f37;
    background: #ddf4e4;
  }
  .soon {
    color: #9a6700;
    background: #fff4c2;
  }
  .closed {
    color: #57606a;
    background: #eef0f2;
  }
  .unknown {
    color: #57606a;
    background: #eef0f2;
  }
  .unknown::before {
    background: transparent;
    border: 1.5px solid currentColor;
    width: 5px;
    height: 5px;
  }
</style>

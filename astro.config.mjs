// @ts-check
import { defineConfig } from 'astro/config'
import sitemap from '@astrojs/sitemap'
import svelte from '@astrojs/svelte'

// https://docs.astro.build/en/reference/configuration-reference/
export default defineConfig({
  output: 'static',
  // Placeholder until the real domain is decided (PLAN §13).
  site: 'https://otakuroad.pages.dev',
  integrations: [
    svelte(),
    // The bare `/` is a redirect stub, so it stays out of the sitemap; everything else is content.
    sitemap({ filter: (page) => new URL(page).pathname !== '/' }),
  ],
  i18n: {
    defaultLocale: 'ko',
    locales: ['ko', 'en'],
    routing: {
      prefixDefaultLocale: true,
      // Astro's own root redirect is a two-second meta refresh. src/pages/index.astro renders an
      // instant one instead, so this stays off to keep the two routes from colliding.
      redirectToDefaultLocale: false,
    },
  },
})

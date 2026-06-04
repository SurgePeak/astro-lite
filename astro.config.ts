import {
  defineConfig,
  envField,
  fontProviders,
  svgoOptimizer,
} from "astro/config";
import tailwindcss from "@tailwindcss/vite";
import mdx from "@astrojs/mdx";
import sitemap from "@astrojs/sitemap";
import remarkToc from "remark-toc";
import remarkCollapse from "remark-collapse";
import {
  transformerNotationDiff,
  transformerNotationHighlight,
  transformerNotationWordHighlight,
} from "@shikijs/transformers";
import { transformerFileName } from "./src/utils/transformers/fileName";
import config from "./astro-paper.config";
import photosuite from 'photosuite';

export default defineConfig({
  site: config.site.url,
  integrations: [
    mdx(),
    photosuite({
      scope: "#article",
      imageBase: "https://cos.lhasa.icu/dist/images/",
      fileDir: true,
    }),
    sitemap({
      filter: page =>
        config.features?.showArchives !== false || !page.endsWith("/archives/"),
    }),
  ],
  i18n: {
    locales: ["zh", "en"],
    defaultLocale: "zh",
    routing: {
      prefixDefaultLocale: false,
    },
  },
  markdown: {
    remarkPlugins: [remarkToc, [remarkCollapse, { test: "Table of contents" }]],
    shikiConfig: {
      themes: { light: "min-light", dark: "night-owl" },
      defaultColor: false,
      wrap: false,
      transformers: [
        transformerFileName({ style: "v2", hideDot: false }),
        transformerNotationHighlight(),
        transformerNotationWordHighlight(),
        transformerNotationDiff({ matchAlgorithm: "v3" }),
      ],
    },
  },
  vite: {
    plugins: [tailwindcss()],
  },
  fonts: [
    {
      name: "Anthropic Serif Web Text",
      cssVariable: "--font-anthropic-serif",
      provider: fontProviders.local(),
      fallbacks: ["serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/Anthropic-Serif-Web-Text.woff2"],
            weight: 400,
            style: "normal",
          },
        ],
      },
    },
    {
      name: "Anthropic Sans Web Text",
      cssVariable: "--font-anthropic-sans",
      provider: fontProviders.local(),
      fallbacks: ["sans-serif"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/Anthropic Sans-Web-Text.woff2"],
            weight: 400,
            style: "normal",
          },
        ],
      },
    },
    {
      name: "Anthropic Mono Variable",
      cssVariable: "--font-anthropic-mono",
      provider: fontProviders.local(),
      fallbacks: ["monospace"],
      options: {
        variants: [
          {
            src: ["./src/assets/fonts/Anthropic-Mono-Variable.woff2"],
            weight: 400,
            style: "normal",
          },
        ],
      },
    },
  ],
  env: {
    schema: {
      PUBLIC_GOOGLE_SITE_VERIFICATION: envField.string({
        access: "public",
        context: "client",
        optional: true,
      }),
    },
  },
  experimental: {
    svgOptimizer: svgoOptimizer(),
  },
});

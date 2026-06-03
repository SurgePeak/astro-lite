import { defineAstroPaperConfig } from "./src/types/config";

export default defineAstroPaperConfig({
  // SEO 声明信息
  site: {
    url: "https://blog.lhasa.icu/",
    title: "游钓四方",
    description: "独立之精神，自由之思想",
    author: "游钓四方",
    profile: "https://lhasa.icu/",
    ogImage: "default-og.jpg",
    lang: "en",
    timezone: "Asia/Shanghai",
    dir: "ltr",
  },
  posts: {
    perPage: 5,
    perIndex: 10,
    scheduledPostMargin: 15 * 60 * 1000,
  },
  features: {
    lightAndDarkMode: true,
    dynamicOgImage: false,
    showArchives: false,
    showTags: false,
    showBackButton: false,
    editPost: {
      enabled: false,
    },
    search: false,
    coverUrl: "https://cos.lhasa.icu/dist/images",
  },
  socials: [
    { name: "github",   url: "https://github.com/achuanya/astro-lhasa" },
    { name: "x",        url: "https://x.com/haibao1027" },
    { name: "mail",     url: "mailto:haibao1027@gmail.com" },
  ],
  shareLinks: [
    { name: "whatsapp", url: "https://wa.me/?text=" },
    { name: "facebook", url: "https://www.facebook.com/sharer.php?u=" },
    { name: "x",        url: "https://x.com/intent/post?url=" },
    { name: "telegram", url: "https://t.me/share/url?url=" },
    { name: "pinterest", url: "https://pinterest.com/pin/create/button/?url=" },
    { name: "mail",     url: "mailto:?subject=See%20this%20post&body=" },
  ],
});
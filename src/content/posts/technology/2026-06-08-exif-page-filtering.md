---
author: 游钓四方
pubDatetime: 2026-06-08T11:38:00+08:00
title: 待写
featured: false
draft: false
tags:
  - 技术
cover: cover.svg
description: 待写
---

# 当 `scope` 不够用时：Photosuite 的服务端 EXIF 过滤

> 一个看起来像配置失误、实际上是设计缺陷的真实 bug，以及它的修复。

## 问题：about 页"漏 EXIF"

某位用户的 Astro 站点接入 Photosuite 已经一段时间了，配置很常规：

```ts
// astro.config.ts
photosuite({
  scope: "#article",
  imageBase: "https://cos.lhasa.icu/dist/images/",
  fileDir: true,
})
```

文章页的容器是 `#article`，所有图片增强（灯箱、拼图、EXIF）都该只发生在这个容器里。直到某天他打开 about 页——一个有正文图片但**不在** `#article` 容器内的"关于页"——发现图片下方赫然出现了一条 EXIF 信息：

> 6.3 mm · ƒ/1.7 · 1/1248 · ISO 10 · 2025/5/31

查 DOM，原本简单的 `<img>` 已经被改写成：

```html
<div class="photosuite-item">
  <img src="..." alt="...">
  <div class="photosuite-exif">6.3 mm · ƒ/1.7 · 1/1248 · ISO 10 · 2025/5/31</div>
</div>
```

页面没有引用 photosuite 的客户端脚本，也不在 `#article` 范围里——可 DOM 结构和 EXIF 文本明明白白就在 HTML 源码里。这不是客户端 JS 注入的，是构建时就写死的。

## 根因：`scope` 是个客户端选择器

来看 photosuite 集成的实际工作流（简化版）：

```ts
// src/integration.ts
"astro:config:setup": ({ injectScript, updateConfig }) => {
  // (1) 客户端脚本——只有这里读 scope
  injectScript("page", `
    import { photosuite } from 'photosuite/client';
    const __opts = ${JSON.stringify(options)};  // 含 scope
    photosuite(__opts);
  `);

  // (2) 服务端 rehype 插件——完全不读 scope
  if (options.exif !== false) {
    rehypePlugins.push([exiftoolVendored, options]);
  }
  updateConfig({ markdown: { rehypePlugins, remarkPlugins } });
}
```

两条路径在 `astro:config:setup` 阶段各走各的：

| 路径 | 时机 | 读取 `scope`？ | 作用 |
|------|------|--------|------|
| `injectScript` | 运行时 | ✅ | 灯箱、拼图、标题等 |
| `markdown.rehypePlugins` | 构建时 | ❌ | EXIF 提取、DOM 改写 |

而 `exiftoolVendored` 内部的逻辑大致是：

```ts
return async (tree, file) => {
  const visit = (node) => {
    if (node.type === 'element' && node.tagName === 'img') {
      promises.push(processNode(node, file, opts));  // ← 这里改写 DOM
    }
    node.children?.forEach(visit);
  };
  visit(tree);
};
```

它把 HAST（HTML AST）整个走一遍，匹配所有 `tagName === 'img'`，对满足"曝光三要素"（`FNumber && ExposureTime && ISO`）的图片**无差别**改写。`scope` 是 CSS 选择器，HAST 阶段还没有 CSS 上下文，也没法用 CSS 选择器来做过滤。

换句话说：**`scope` 从来没有打算约束服务端，但配置的命名让用户合理地期望它会。**

### 一个容易混淆的细节

rehype 插件挂在 `markdown.rehypePlugins` 上，所以只作用于 Markdown 渲染出的 HTML，不会触及 `.astro` 组件内手写的 `<img>`。但 about 页是 Markdown 文件 `src/content/pages/about.md`，所以它里面的每一张满足三要素的图片，构建时都会被改写。

## 设计缺陷，不是 bug

很多人(包括我)第一反应会想"加一个 scope 在 rehype 阶段也生效"。但仔细想想就会发现：

- `scope: "#article"` 是一个 CSS 选择器，它表达的是"页面渲染完成后某个 DOM 子树内"
- rehype 阶段拿到的是单个 Markdown 文件的 AST，连页面布局都还没拼起来——这时根本没有 `#article`
- 即便我们硬把 CSS 选择器塞进去，也只能做名字层面的字符串匹配（"这个 Markdown 是不是会被 `#article` 容器渲染"），那本质上还是按页面/路径过滤，只是绕了一圈

**真正缺的不是"scope 在服务端生效"，而是"按页面/路径决定要不要跑插件"的能力。** 服务端要的是页面级开关，CSS 选择器是用错了工具。

## 修复：两层过滤

加两个机制，分别对应"项目级规则"和"单页例外"：

### 1. 配置级 glob 过滤

```ts
photosuite({
  scope: '#article',
  exif: {
    include: ['src/content/posts/**/*.md'],  // 白名单
    exclude: ['src/content/pages/**/*.md'],  // 黑名单（优先级更高）
  },
})
```

glob 相对项目根目录解析，分隔符统一归一化为 `/`（兼容 Windows）。匹配规则尽量贴近 minimatch 的常识：

| 通配符 | 含义 |
|--------|------|
| `*` | 段内任意字符（不跨 `/`） |
| `**` | 跨段任意字符 |
| `?` | 单字符 |

实现是一个手写的二十行 `globToRegExp`：

```ts
function globToRegExp(glob: string): RegExp {
  const norm = glob.replace(/\\/g, '/');
  let pattern = '';
  for (let i = 0; i < norm.length; i++) {
    const c = norm[i];
    if (c === '*') {
      if (norm[i + 1] === '*') {
        pattern += '.*';
        i++;
        if (norm[i + 1] === '/') i++;  // 吃掉 ** 后的 /
      } else {
        pattern += '[^/]*';
      }
    } else if (c === '?') {
      pattern += '[^/]';
    } else if (/[.+^${}()|[\]\\]/.test(c)) {
      pattern += '\\' + c;
    } else {
      pattern += c;
    }
  }
  return new RegExp('^' + pattern + '$');
}
```

不引入 micromatch / minimatch 的原因很简单：项目的 runtime 依赖只有两个（`@fancyapps/ui` 和 `exiftool-vendored`），为一个百行级别的过滤逻辑引入数十 KB 的依赖不划算。手写的版本覆盖 95% 的常见用法，剩下 5%（取反、字符类等）让位给精简的产物大小。

### 2. Frontmatter 单页 opt-out

```yaml
---
title: 关于
exif: false        # 或 photosuite: false
---
```

实现照搬 `imageUrl.ts` 已有的 frontmatter 读取范式：

```ts
const fm = file?.data?.astro?.frontmatter || file?.data?.frontmatter || {};
if (fm.exif === false || fm.photosuite === false) return false;
if (fm.photosuite?.exif === false) return false;
```

为什么要同时提供两层？

- **glob** 适合**规则**："所有 posts 都要，所有 pages 都不要"——一次配置覆盖未来所有新文件
- **frontmatter** 适合**例外**："这一篇特殊"——不需要回头改全局配置

二者优先级：frontmatter > exclude > include。最特异的规则赢，符合直觉。

### 串起来

整个判定函数最终只有 11 行：

```ts
function shouldProcessFile(file: any, opts: ResolvedExifOptions): boolean {
  const fm = file?.data?.astro?.frontmatter || file?.data?.frontmatter || {};
  if (fm.exif === false || fm.photosuite === false) return false;
  if (fm.photosuite && typeof fm.photosuite === 'object' && fm.photosuite.exif === false) return false;

  const filePath: string = file?.path || file?.history?.[0] || '';
  if (!filePath) return true;
  const rel = path.relative(process.cwd(), filePath).replace(/\\/g, '/');

  if (opts.exclude.length > 0 && opts.exclude.some((re) => re.test(rel))) return false;
  if (opts.include && !opts.include.some((re) => re.test(rel))) return false;
  return true;
}
```

在 transformer 入口提前返回即可：

```ts
return async (tree: Node, file: any) => {
  if (!shouldProcessFile(file, opts)) return;  // ← 新增
  // ...原本的遍历逻辑保持不变
};
```

## 几个值得记的点

**1. 配置项的语义边界要写清楚**

`scope` 这个名字过于通用，自然让人觉得它"全权代表所有过滤"。一个改进是在文档里明确写出"`scope` 只作用于客户端"——这次的修复同时在 README 和 FAQ 里补了这一句。命名上如果重来一次，可能叫 `clientScope` 更不容易误解，但破坏 API 兼容不值得，文档补丁就够了。

**2. 客户端/服务端双轨集成的过滤要分别设计**

`scope` 是为客户端 DOM 选择而生的。服务端构建期插件天然没有 DOM，强行让 CSS 选择器在两端"统一"反而会引入更多歧义。承认两端世界不同，分别提供合适的过滤原语（CSS 选择器 vs. 文件 glob + frontmatter），是更老实的设计。

**3. 默认行为不要破坏**

未配置 `include` / `exclude` 时，行为与旧版完全一致（处理所有 Markdown）。`PhotosuiteExifOptions` 是纯增量扩展，没有引入 breaking change，老用户升级不会感知。

**4. Frontmatter opt-out 几乎免费**

`imageUrl` 插件已经在读 frontmatter，复用同样的访问路径不增加复杂度。一个 11 行的过滤函数解决了一个看起来需要架构改造的问题。

## 用户该如何用

针对最常见的"about 页面不要 EXIF"场景，两种修法都可以，按口味选：

**改 frontmatter（最快）：**

```yaml
# src/content/pages/about.md
---
title: 关于
exif: false
---
```

**改配置（一次性管所有 pages）：**

```ts
photosuite({
  scope: '#article',
  imageBase: 'https://cos.lhasa.icu/dist/images/',
  fileDir: true,
  exif: {
    exclude: ['src/content/pages/**/*.md'],
  },
})
```

下次 `pnpm build` 时，about 页面里的 `<img>` 会保持纯粹的 `<img>` 形态，不再有 `.photosuite-item` 包裹，也不会触发 exiftool 下载。

## 收尾

这个 bug 的有趣之处在于：它不是哪行代码写错了，而是两个本该协同的子系统从设计之初就走在了不同的轴上。`scope` 处理"页面里哪些 DOM"，rehype 插件处理"哪些 Markdown 里的所有 DOM"——一个是 *what*，一个是 *which file*，本就不该共用同一个开关。

补丁很短，但补的是一个长期被默许的认知缺口。

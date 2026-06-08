---
author: 游钓四方
pubDatetime: 2026-06-08T16:52:00+08:00
title: Photosuite EXIF 优化
featured: false
draft: false
tags:
  - 技术
  - 前端
  - 开源
  - Photosuite
cover: cover.svg
description: 最近写新主题，迁移旧日志文件跑测试时，发现 Photosuite 有两个严重的问题
---

最近写新主题，迁移旧日志文件跑测试时，发现 Photosuite 有两个严重的问题 ：

1. 每次启动博客都要全量拉取图片来解析 EXIF
2. EXIF 在非选择器页面插入 DOM 结构

## EXIF 构建期的解析问题

Photosuite 走的是构建期解析图片 EXIF 的路子

本地文件还好，如果是远程图片，就要先下载到 `os.tmpdir()`，再交给 exiftool 读

我博客图片不多，但也够呛

每次 `pnpm dev` 启动，都要卡很久，网络差时，两分钟都不一定能看到页面...

正常来说第一次拉过之后，本地就应该存一份，这次实现了

缓存就落在 `node_modules/.cache/photosuite/`，以图片 URL 作 key，实际生成出来的缓存大概是这样：

> [!EXAMPLE]- 实际生成出来的缓存大概是这样
>
> ```json
> {
>   "version": 1,
>   "entries": {
>     "https://cos.lhasa.icu/dist/images/2025-06-01-dragon-boat-cycling-beiyuxian/20250531195440.jpg": {
>       "MIMEType": "image/jpeg",
>       "FileType": "JPEG",
>       "DateTimeOriginal": {
>         "_ctor": "ExifDateTime",
>         "year": 2025,
>         "month": 5,
>         "day": 31,
>         "hour": 12,
>         "minute": 31,
>         "second": 53,
>         "rawValue": "2025:05:31 12:31:53.069+08:00",
>         "zoneName": "UTC+8"
>       },
>       "ImageWidth": 4000,
>       "ImageHeight": 2252,
>       "FNumber": 1.7,
>       "ExposureTime": "1/1248",
>       "ISO": 10,
>       "FocalLength": "6.3 mm",
>       "warnings": [],
>       "errors": []
>     }
>   }
> }
> ```

后续 dev 启动直接命中，跳过下载与 exiftool 调用，只解析新增的图就够了

对那种「解析成功但没有有效 EXIF」（比如截图、压缩过头的图）的 URL 也做了负缓存

否则下次还得白下载一遍

```json
{
	"entries": {
		"https://cos.lhasa.icu/dist/images/2018-10-24-theory-of-means/theory-of-maens.jpeg": null,
		"https://cos.lhasa.icu/dist/images/2018-12-31-summaryof/bainian.png": null
	}
}
```

网络错误和 HTTP 错误不进负缓存，下次会自动重试，这种情况通常不是图本身的问题

### HTTP Range

完全没必要把整张图下载下来

改用 HTTP Range 请求，默认只取头部字节（128 KB）

已足够 exiftool 拿到所有元数据，传输量直接砍掉一大半

如果 CDN 不支持 Range（这年头基本不存在），就回退完整下载

```ts
photosuite({
  scope: '#main',
  exif: {
    cache: true,        // 启用磁盘缓存
    concurrency: 6,     // 远程图片下载并发上限
    timeout: 15000,     // 单次下载超时
    headerBytes: 131072 // 只下载头部多少字节，0 = 完整文件
  }
})
```

最多同时下载 6 个，每个请求 15 秒超时，异常会重试，以上均为默认值，无需配置

## EXIF 乱插问题

实际上，前者的问题我是一直知道的，而这个，是我更换「关于」页面的个人照片才发现的...

博客的 Photosuite  配置是： `scope: "#article"` 文章页的容器

按设计，是 scope 不命中的页面，Photosuite 就不应该工作

可我个人照片下面还是出现了 EXIF 数据：

![](about-bug.png)

经过测试，我才发现 `exiftoolVendored`在**构建时**就把 EXIF 的 DOM 结构写入了 HTML

虽然有配置 `scope: "#article"` 但这是CSS选择器，只有在**运行时**才能用来匹配 DOM

所以 about 页面即使没有 `#article` 元素，Photosuite   也会插入 EXIF 数据，也仅限该数据，其他样式不会加载，否则 EXIF 也不会显示在图片下方

```html
<div class="photosuite-item">
  <img src="...">
  <div class="photosuite-exif"></div>
</div>
```

### 把 DOM 推到客户端

解决这个问题很简单，构建期不再生成结构，把 EXIF 文本作为数据载荷挂到 `img` 上：

```ts
function renderExifNode(node: Node, data: ExifData, opts: ResolvedExifOptions): void {
  // ...
  const text = parts.join(opts.separator);

  if (!node.properties) node.properties = {};
  node.properties['data-photosuite-exif'] = text;
}
```

构建产物里只多了一个 `data-photosuite-exif="..."` 属性

```html
<img src="..." data-photosuite-exif="NIKON Z 30 · NIKKOR Z DX 50-250mm f/4.5-6.3 VR · 104.0 mm · ƒ/10.0 · 1/100 · ISO 100 · 2026/4/30">
```

客户端那边，等 `scope` 命中、模块加载之后，再读这个属性渲染：

```ts
export function ensureExif(container: HTMLElement): void {
  if (container.classList.contains("photosuite-grid-member")) return;
  if (container.querySelector(".photosuite-exif")) return;

  const img = container.querySelector("img");
  if (!img) return;

  const text = (img.getAttribute("data-photosuite-exif") || "").trim();
  if (!text) return;

  const bar = document.createElement("div");
  bar.className = "photosuite-exif";
  bar.textContent = text;
  container.appendChild(bar);
}
```

至此，scope 不命中的页面，Photosuite 不会再加载任何样式

> [!Success]
> photosuite v0.5.0-beta 已经发布到 npm，如果您也在用 [Photosuite](https://blog.lhasa.icu/posts/technology/2025-12-23-photosuite)，建议直接更新

```bash
pnpm add photosuite@beta
# or
npm install photosuite@beta
# or
yarn add photosuite@beta
```

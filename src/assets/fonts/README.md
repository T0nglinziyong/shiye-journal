# 拾页手写字体

字体来源及公开分发渠道见 `manifest.json`。新增的三款作者声明字体保留原始 TTF/OTF，不进行转换或子集化。`manifest.json` 记录来源、版本和 SHA-256；WOFF2 仅做格式压缩，未删字或修改字形。授权原文随本目录及发布产物保留。

| 字体 | 版本 | 用途与覆盖 | 授权 |
| --- | --- | --- | --- |
| Ma Shan Zheng | 原有发行文件 | 毛笔标题，简体中文 | SIL OFL 1.1 |
| Xiaolai 小赖 | 3.126 | 日常手写，简繁中文、日文、英文；源于 SetoFont 的中文补全 | SIL OFL 1.1 |
| Sophora Book | 5.0.0 | 松散随笔，部分中文、日文、英文 | 作者允许商业及非商业使用、复制、分发和修改 |
| Otsutome | 3.20 | 笔刷标题，日文与部分中文 | SIL OFL 1.1；保留原字形和保留字体名 |

App 的手写字体选择复用 `fontName`；服务端工具使用 `style.fontFamily`。日文字体缺字由 Xiaolai 补齐。字体按需加载并由现有 Service Worker 缓存，不加入首页预缓存。

## 部署与任务边界

服务器从自己部署目录的 `src/assets/fonts` 读取 TTF，Skill 从 `creation-skills` 读取，工具随同一版本源码发布。App 从自己的静态资源读取 WOFF2。云端创作任务只含 `format/document/images/brief`，不上传字体、Skill 或工具代码；模型在开始时得到服务器实际可用的字体名、覆盖范围和资源版本。

手动导出的独立离线 ZIP 仍包含授权字体，以便无服务器环境重现作品。这不属于云端创作提交链路。

## 其他候选

- SetoFont：优先采用简体覆盖更完整的 Xiaolai 派生版。
- 851CHIKARA-YOWAKU：作者允许 Web/软件嵌入；本次官方字体下载超时，未打包。
- KFhimaji：作者条款禁止在 App 中嵌入分发及未经许可的 Web 字体转换，未打包。https://www.kfstudio.net/kfhimaji_terms/
- Mengshen-Handwritten：官方版带拼音，不作为普通手帐的默认手写字体。
- ElmerFont、genkou-standard、masonhandwriting、073 TEGUSE Kanaka：尚未完成原文件及嵌入分发授权核对，未打包。

## 本轮新增

- 鸿雷拙书（HongLeiZhuoShu）：拙趣标题；作者声明允许免费使用，原始 OTF。
- 字制区喜脉喜欢体（FontQu Smile）：随性连笔；作者授权分发方明确允许 App 嵌入，原始 TTF。
- 栗壳坚坚（Like JianJian）：自然手记；作者 2025-08-10 的说明明确允许网页及 App 内嵌。当前文件内部版本 2.000，不声称为作者最新上游版本。

白路俏丽手写体已查到作者免费发布，但嵌入分发条款尚未完整核对；上首追光手写体为商业字体，尚未找到适用的个人 App 嵌入许可，本轮不内置。

字体清单是唯一注册源，前端选项、按需加载、服务器 Canvas、字形工具及离线包均由同一清单读取。资源版本和自动同步规则见 `docs/CREATION_RESOURCES.md`。

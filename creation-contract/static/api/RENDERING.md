# 渲染、字体与可复现交付

编辑接口与渲染后端分离。公共 Scene 解释、单位、布局、字体测量规则、裁片与组变换不可在 Browser/Node 中各自重写一套。

默认 profile 在构建发行版时确定。可提供浏览器 Canvas 与 Node Canvas，但不能宣称浏览器零依赖，也不能因为导出失败就静默换成排版不同的后端。

self-test 检查实际可用后端、字体、必要 API 和资源；fallback 仅能在声明过兼容关系的 profile 之间发生，记录所用后端、版本和配置。切换字体或排版语义需要重测量、重渲染和重新审阅。

字体文件不在本交付内。Codex 应使用项目已有、获授权的字体资源或受控环境提供的字体；记录版本/hash 和实际 fallback。不能仅写 environment-dependent 后宣称像素一致，也不能未经授权复制机器字体。

同一运行 profile 可做确定性回归；不同后端允许经过定义的抗锯齿差异。几何、换行、尺寸、真实镂空和层级必须一致。跨后端不要求 PNG 字节相等，但要测试布局语义并声明视觉差异容限。

渲染 key 至少包含：Scene 内容投影 hash、源图片字节 hash、来源物理修订、rendererBuild、fontProfile/hash、导出尺寸与布局编译版本。revision 与 renderKey 分开；单纯提高输出像素不应改写 Scene 毫米尺寸。

正式 preview 与 proposals 隔离；最终 pack 验证正式 renderKey 对应当前 Scene 和资源。临时预览不是正式作品，不能混用其 PNG 与另一份 Scene。

审阅记录至少保存 previewSha256、renderKey、sceneRevision、method、result、issues。method 区分 agent-declared、human、not-reviewed。只绑定 hash 不代表真的看过图；入口说明仍明确要求查看真实 PNG。

manifest 的 structure/physical/layout 可由程序检验，visual 必须如实记录来源。缺依赖、文字溢出、必用素材缺失、缺字体、预览过期均应返回明确错误，不能伪造成功。

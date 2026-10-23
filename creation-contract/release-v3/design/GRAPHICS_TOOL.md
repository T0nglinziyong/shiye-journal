# 本地图形计算 · 按需使用

GPT 决定构图、形状、配色和用途；`graphics` 只计算几何，不调用生图或矢量服务，不改 Scene。圆星预设通常直接 graphic.add；手绘感、曲线和布尔运算困难时才使用本工具。

```sh
node runtime/shiye.cjs graphics help
node runtime/shiye.cjs graphics work/graphics.json
node runtime/shiye.cjs check work/hand-star.commands.json
node runtime/shiye.cjs apply work/hand-star.commands.json
node runtime/shiye.cjs preview
```

请求示例（直接写 JSON，不必另写程序）：
```json
{"version":1,"operation":"rough","id":"hand-star","geometry":{"kind":"star"},"size":{"width":16,"height":16,"unit":"mm"},"place":{"reference":"page","at":[30,40],"unit":"mm"},"style":{"fill":"#B8CCD2","stroke":"#486573","strokeWidthMm":0.4},"seed":42,"options":{"roughness":1.1,"fillStyle":"hachure","hachureGapMm":1.8}}
```

geometry/place/style/parent/order 与 Command 共用。计算用固定毫米尺寸，不自动推断目标、点缀或布局；结果是普通 group.compose + graphic.add。之后仍由 layer.update 修改。每次换 id，不覆盖未应用草稿；Scene 改变后重新生成事务基准，不绕过 revision 检查。

Rough.js：rough 手绘轮廓与填充，必须 seed。Paper.js：smooth 平滑、simplify 简化、flatten 折线化、boolean 闭合路径并交差、measure 测量。perfect-freehand：stroke 将压力点变轮廓；需要继续编辑压力点时直接用原有 graphic.add。每种 operation 只接受它适用的 options，详见 graphics help / api/graphics.schema.json。不会自动识别人物、生成字体或返回真实材料余料。

输出在 output/graphics/<id>.json、.svg，事务在 work/<id>.commands.json；空布尔结果和测量没有事务。手绘边缘可能略越界，实际看图决定；不要把 SVG 预览当作品最终 PNG。库已随包捆绑，计算无需 npm 或网络；作品 PNG 仍需 Node Canvas 或既有浏览器渲染环境。

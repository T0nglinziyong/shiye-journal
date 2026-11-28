# 教程观察与创作包实测（2026-10-23）

## 观察依据

本轮检查用户提供的五段教程视频画面及可读字幕。视频反复出现的动作是：试摆主素材与纸片、调整露边和遮挡、确定书写位置、用标题与段落建立层级，最后增加少量圈注、编号或高亮。书写有时发生在拼贴之后，有时先写在独立纸片上再贴入，所以包内不规定唯一的“先写字/先摆图”顺序。只提炼方法，不把视频帧或其中素材放进仓库和示例包。

相关的公开资料也强调图层组合、遮挡和混合媒介中的视觉层级：[Adobe 拼贴图层教程](https://helpx.adobe.com/photoshop/desktop/create-manage-layers/create-layer-compositions/create-collages-and-montages-using-layers.html)、[Adobe Fresco 混合媒介拼贴](https://www.adobe.com/us/learn/fresco/web/editorial-collage)。这些资料用于交叉检查设计语言，具体操作仍以拾页的 Scene v2 和实物尺寸约束为准。

## 包和工具调整

- `TASK.json` 保留任务事实，`creativeBriefRef` 指向唯一的动态 `design/GUIDE.md`；不再在 JSON 中重复整篇指导。移除包中重复的固定 `design/CRAFT_GUIDE.md`，固定能力按专题按需阅读。
- `START_HERE.md` 明确未提交事务的真实预览路径，以及“试摆 → 内容与纸面互调 → 细节 → 正式预览与修订 → 打包”的短路线。`design/SKILL.md` 与 `design/REVIEW.md` 增加露边、可读书写面、两页主次和小面积强调色的看图问题。
- `runtime/shiye.cjs <command> --help` 只返回用法，不执行 `pack` 等有副作用命令。对于 `graphic.add` 的线条预设，若框高小于笔宽则拒绝事务并给出改用 `geometry.stroke` 的提示，避免命令成功但 PNG 中线条消失。

## 独立创作实测

给子代理一份只有三件合成纸片的空白 v3 ZIP，让它独立阅读包、写 `commands.json`、运行 check/apply/真实 Canvas preview、看图修订并 pack。第一次约四分钟完成，技术交付完整，但左页留白过大、正文与素材关系偏弱。报告中的 `pack --help` 误执行与极薄线条不可见问题已据此修复。

第二次使用修订包重新独立创作，约五至六分钟形成 220 字的双页随写。初次试排把实物素材都放在右页，左页成为分离的文字块。审阅真实 proposal PNG 后，子代理将蓝色圆点纸移到左页，橙色纸条分片连接两页纸边，并把正文分配到两页。再次看图发现纸面虽然出现，图案和书写仍缺少联系；最终在蓝纸一个具体圆点外增加可编辑圈线及短注，在绿纸内部让两句想法与可编辑下划线形成回应。`check → proposal preview → apply → preview → review → pack` 均实际执行；最终 Node Canvas PNG、Scene 和可编辑项目同源，物理约束校验通过。这个变化说明试排与看图修订产生了实际排版调整，而不只是增加一次命令验证。

三件合成材料的图案和语义都很简单。最终图仍有较多空白，质感接近平面排版；橙条原图与其标注的物理长宽比例相差很大，预览纹样被压扁。此实测能验证流程、来源约束、工具可用性及局部审美修订，不能证明它已达到五段教程中真人作品的质感、复杂度或特定用户素材的最终质量。包未捆绑 Node Canvas，离线机器需先安装声明的依赖；字体还取决于运行机器，正式交付必须在目标环境核对实际 PNG。

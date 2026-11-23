import {createCreationDocument} from '../../src/creation-document.js';
import {validateWebScene} from '../../src/web-scene-workbench.js';
// Explicit research steps, not production phase gates. Each starts from the
// saved editable Scene and ends at its first newly rendered preview.
export const studyStageDefinitions={
 connections:{maxPreviews:3,skills:['journal-composition','paper-layering'],scope:'paper-contact-refinement',instruction:'从当前已成立的双页继续，只修正小纸片与主纸层的接合。逐页看实际露出的轮廓，找出仅碰一角、隔着窄缝或虽靠近却像独立漂浮的小纸片。根据内容组选择增加有效搭接、把一端藏到大纸后、调整层序或收近相邻图文，不统一规定重叠比例，不把所有标签都堆在一起。保留当前标题文字、正文内容、主块布局和跨页配色；移动承字纸时同步其文字与相关装饰，保护可读区域、实体尺寸与来源用量。优先调整已有对象，不再加无关小纸、星星或阴影。每次预览比较小纸是否真正归入相关内容组，并检查露出的文字与关键图案，已明确独立的标签可保留。'},
 restructure:{maxPreviews:3,skills:['journal-composition','paper-layering'],scope:'structural-recomposition',instruction:'本轮从上一轮试摆继续，专门测试主块重排。当前画面是待改草稿，不是已通过构图；允许删除、裁分、移动、改层序，保留用户方向、实体来源、主题语气与代表性文字。先看实际预览，判断最大的几块纸最终露出的轮廓，以及标题、主体、正文是否各占互不相干的矩形。若是，将大纸从“完整承字卡”重新分工为局部承托、边带、连接片或底层：数字纸可缩短、变窄、移除；实体纸按授权裁分并安排不同片段，不缩放实体。不要把整张原料外形当成不可变的版式。让代表性字群在原页、局部纸面、图像轮廓之间共同形成可读整体，标题可以穿过两种底面但需可读。第一次编辑须落实主块结构变更，再看图比较：究竟哪张大纸改变了露出面积、哪组图文不再各占一张卡。之后若结构仍未改善，继续重排主块；不以加星星、胶带、阴影或标签冒充结构改稿。本轮不加新正文和精细装饰。可以保留已成立的局部，避免把层叠理解为强制斜放或重叠文字。双页先各自形成图文关系，再做颜色呼应。'},
 composition:{allowBlank:true,maxPreviews:5,skills:['journal-composition','paper-layering','journal-color'],scope:'composition-with-representative-text',instruction:'从空白开始做图文共同构图。使用真实素材，可编辑纸面、短标题和代表性正文一起试摆，遵循用户的丰富层叠方向。先让主要图文形成关系，再决定承托纸需要露出多少；大纸可遮叠或按授权裁分，数字纸宽高可调整。每次预览先判断主块关系：若仍是一纸一段的大矩形竖排，下一次编辑应重排主块，不能只补小物。保留可读文字、真实素材尺寸与来源用量。双页先各自成立，再做色彩呼应。本轮是构图试摆，正文不必写满，标题精细字效与小装饰留待后续。'},
 lettering:{maxPreviews:4,skills:['journal-lettering'],scope:'art-title-validation',instruction:'本轮是艺术标题能力验证。保留现有标题原文、正文与主体排版，先读取当前主标题的物理 fontSizePt 与可用毫米范围。先选一种适合字形的处理（拆字、局部笔画处理、逐字错落或弧形），再组合字后图形或描边；只换字体、普通下划线或一条矩形底条不足以完成本轮实验。选定组合方法时先读对应 detail（例如 title-composed），按真实参数执行。字后点缀应与字群交叠并露出，保护字腔；变形应保持原字可读。用原物理字号作起点，不能把像素字号当 pt，也不把小标题任意放大。本轮只处理字群及其直接相关的字后图形，不新增独立纸边点缀；纸边装饰留到下一阶段，保护正文。先合批编辑并看图，再修正大小、字间距和遮挡；文字读不清或压正文则不能宣称通过。'},
 polish:{skills:['journal-lettering','journal-accents'],scope:'title-and-edge-polish',instruction:'在当前双页成品上逐步改善主标题与纸边点缀，保留主题、标题原文、正文和已经成立的主体排版。先看已有画面，再用 creation_plan 写局部方案。标题不能只换字体：根据字群选择可辨认的字形处理、字后图形与描边组合，可读取 title-composed 等方法详情；不是把所有效果同时叠上。点缀重点试实心圆或星形与纸边、接缝的重叠和跨页色彩呼应，不以空心圈、胶带或均匀撒点替代。使用真正需要的位置和尺寸，保护文字与面部，允许清理失败点缀与局部调整层序。先合批编辑看一次预览，再根据实际图像修正；逐字检查标题、正文遮挡与整体主次。'},
 finish:{skills:['journal-lettering','journal-writing','journal-accents','journal-graphics'],scope:'title-writing-accents',instruction:'在当前试摆上完成标题、原创正文与装饰。主题从素材自行选择，文字量丰富，内容不冒称用户经历。字群、插画、纸层共同构图，按连续可读写面适配文字；text.fit 支持 style 与 maxLines。可以调整不合理的打底和层序，不必保留错误。装饰应连接或强调内容，检查文字、脸部和主要图案的遮挡。先计划，合批编辑，生成本阶段预览。'},
 layout:{skills:['journal-composition','paper-layering','journal-color'],scope:'layout-and-backing-only',instruction:'记录未来正文和标题的位置与阅读关系，暂不新增正文、标题或细小点缀；影响重心的主要插画、已有数字、承托与跨缝胶带可一起试摆。'},
 title:{skills:['journal-lettering','journal-composition'],scope:'titles-only',instruction:'先用 creation_plan 简要记录本轮局部方案，保留用户已定方向；之后再编辑。text.fit 可同时指定 style 改字体颜色，并按该样式适配。在已有打底上试排本页主标题、必要的小标题或编号。根据当前素材的字群/纸层关系、深浅写面和内容主题设计可编辑文字，保留后续丰富正文的可写面。原素材印字已经承担的标题无需重复。本轮不写正文，不新增与标题无关的装饰；允许为标题做必要的局部位置或层序调整，不重做整页打底。'},
 writing:{skills:['journal-writing','journal-composition'],scope:'body-writing-only',instruction:'先用 creation_plan 简要记录本轮局部方案，保留用户已定方向；之后再编辑。在已经打底并摆好标题的当前页面写出完整的本页正文。遵循任务的主题、文字量、原创/纪实边界，围绕已有纸面、便签和图像安排可读段落、清单与短注，丰富文字应有具体内容和阅读路线。保留已成立的标题和主体关系，必要时局部调整位置；本轮不铺新的独立正文大底卡，也不做无关装饰。每段都先给出连续可读区域，使用 text.add/layer.update 后在同一事务中 text.fit 到该区域（字号范围以可读为前提）；不要只设 size.height 就以为不会溢出。白字不能跨浅纸、树或胶带，深字也不能跨深底；框边缩进素材真实可读边界，不能以素材外接矩形代替写面。'},
 accents:{skills:['journal-accents','journal-graphics'],scope:'accents-only',instruction:'先用 creation_plan 简要记录本轮局部方案，保留用户已定方向；之后再编辑。在已经打底、标题和正文均已排好的当前页面做局部装饰与连接。依据用户丰富层叠的方向，在标题、纸边、图像和文字之间补充确有作用的强调、色彩呼应和细节，保护文字、原印字、人物面部和现有透明孔洞。已有纹样不重复涂满，必要时局部调整层序或位置。不要把这一张试验预览宣称为已验收的最终作品。'}
};

export function assertStudySeedMatches(seed,expected){
 if(seed?.format!==expected.format||seed?.version!==expected.version)throw Error('接续研究只接受当前可编辑项目格式');
 const select=source=>Object.fromEntries(['materials','sourceSnapshots','intent','styles','purposes','textMode','textPresentation','contentPolicy','userText','providedFacts','processing','materialPriority'].map(key=>[key,source?.[key]]));
 if(JSON.stringify(select(seed.source))!==JSON.stringify(select(expected.source)))throw Error('接续项目与本次任务的素材或用户方向不一致');
 for(const key of ['canvas','pageMode','physicalPageWidthMM','physicalPageHeightMM'])
  if(JSON.stringify(seed.page?.[key])!==JSON.stringify(expected.page?.[key]))throw Error('接续项目纸张不一致：'+key);
 return seed;
}

export async function reissueStudySeed(seed,expected,assets){
 assertStudySeedMatches(seed,expected);
 // This explicit research continuation re-exports an already editable v3
 // Scene as a new current task. Verify the original task fingerprint, current
 // Scene structure and physical ledger first; never just replace schemaHash.
 validateWebScene(seed.page,seed.source,assets,{final:false,requireCurrentSchema:false});
 const source=expected.source;
 const next=await createCreationDocument({draft:seed.page,assets,
  aliases:Object.fromEntries(source.materials.map(m=>[m.alias,m.assetID])),
  title:seed.title,prompt:source.intent,pagePurposes:source.purposes,styles:source.styles,
  contentPolicy:source.contentPolicy,textPresentation:source.textPresentation,
  userText:source.userText,providedFacts:source.providedFacts,processing:source.processing,
  requiredAssetIDs:source.requiredAssetIDs,materialPriority:source.materialPriority,textMode:source.textMode});
 next.materialDecisions=structuredClone(seed.materialDecisions||[]);
 return next;
}

// A seed is the initial current page, not a permanent style reference. Once
// a fresh render exists, modelContext supplies that page instead. Re-appending
// the seed after it would present an obsolete page as the newest visual input.
export function studyVisualParts({referenceParts=[],seedParts=[],hasNewPreview=false}={}){
 return [...referenceParts,...(hasNewPreview?[]:seedParts)];
}

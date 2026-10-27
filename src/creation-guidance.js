// Shared decision guidance, not a second Scene format or a layout generator.
// Metadata selects useful questions. Actual images and the user's intent decide.
import {visualStyles} from './creative-style-brief.js';

export const creationMethods={
  relationships:{title:'图文关系',operations:['material.add','text.add','graphic.add','layer.update'],advice:'先观察轮廓、印刷字、朝向、可写面与实物大小，决定哪里需要图文对话。把相关图文组成阅读单元，文字可写在纸上、沿轮廓或独立成块，不给每件素材机械配一张卡。首稿就放入真实内容与关键细节。'},
  layering:{title:'错层拼贴',operations:['material.cut','material.split','layer.update','group.create'],advice:'叠层靠不同职责与可辨的边缘：主角、书写面、承托纸与连接片并不等大。错开边缘、局部半藏、让人物跨纸边，保留有用轮廓与阅读空间。双页可呼应颜色或局部形状而改变组合位置。阴影和随机旋转不能代替关系；无需每件材料都加工。'},
  writing:{title:'随想书写',operations:['text.add','text.fit','text.reflow','graphic.add'],advice:'从素材触发具体念头，可用轻松自言自语、俏皮态度、尚未完成的想法；展开与短注相互回应，不逐件描述图片或堆励志口号。没有用户事实时不编造亲历。按可写空间改变句长、段形和位置，不无限缩小字号；在真实预览中检查孤字换行、遮字与页边距。完成态随写应利用便签、盘面等合适书写区，避免素材里空着、文字全挤在外面。'},
  lettering:{title:'标题变化',operations:['text.add','text.lettering','text.reflow','graphic.add'],advice:'先决定标题语气，用字号、字形、局部底线或小标记建立层级；默认不使用页面左上角横贯的大面积实底色条标题，尤其高饱和红底。深色承托只在用户明确需要且与素材协调时使用。印刷字本身可以做标题，不再造同义大字抢焦点。短标题可按词组改变字号、基线和轻重，圈点与符号回应词意，不把逐字随机旋转当成手写。长正文仍可读，不混搭一堆字体。'},
  tape:{title:'胶带连接',operations:['material.tape','layer.update','material.split'],advice:'先决定胶带是固定接缝、连接两组、局部边框还是文字底线，再定长短、方向与露出面积；不在所有照片四角贴同款。连续胶带用 material.tape 并尊重采样区间；有限纸条需实际分片，不能假作无限卷带。翻折只能表达静态外观，当前不交付可交互翻页机关。'},
  stamps:{title:'印章多用',operations:['material.add','layer.update','layer.duplicate','material.window','graphic.add'],advice:'同一边框可圈重点、容纳日期/短句、作淡底纹或照片窗口；淡底纹与前景需要足够对比。预设与数字图形可重复，普通实体须有合法来源。真实剪空用 material.window，透明矢量框用 graphic.add；不要用纸张底色盖住假装开窗。'},
  marks:{title:'圈注高亮',operations:['graphic.add','layer.update'],advice:'先选一句转折、一个日期或一处视线，再画局部高亮、圈线、箭头或记号。高亮放在文字下，按实际行宽和底色调笔宽、颜色与透明度；圈线应让人明白强调什么，需要时配一条具体短注，删去脱离内容的悬空装饰。圆形可做色标、视觉停顿或主体，不必所有细节都用小星星。'},
  planner:{title:'计划清单',operations:['graphic.add','text.add','layer.update'],advice:'先分日期、任务与备注，再用少量线、可调行列的表格和标签建立扫描顺序。待办空栏是功能空间，不按日记的充实程度填满。完成、取消、延期标记只依据用户事实；没有任务时提供明确空白计划区域，不虚构完成记录。'},
  editorial:{title:'编辑分区',operations:['text.add','text.lettering','graphic.add','material.cut','layer.update'],advice:'报刊或杂志感来自标题层级、不等宽分栏、框线、图注与信息顺序，不是统一加复古滤镜。允许一个大字块或图片打断栏线，让次级文字与主块有关系；避免每一块都变成等大矩形卡。'},
  transparency:{title:'透明叠贴',operations:['material.add','layer.update','layer.mask'],advice:'先核对真实透明通道和材质，再让透光层连接两块内容、承载日期条或隔开区域。底纸与上层书写分别调透明度，避免整组变淡后正文难读。opacity 与混合模式按真实预览调整；白纸不能因名称像 PET 就被当成透明膜。显示蒙版不创造实体余料，静态层叠不等于可交互翻页。'},
  color:{title:'色块配色',operations:['graphic.add','text.add','layer.update'],advice:'从本次素材选主色、陪衬色和小面积强调色，不平均分配颜色。异形色块可承载书写，也可衬托角色；深底浅字、浅底深字按预览判断。完成内容后再加回应词意的点线、描边或小图案，不把圆点、动物或同一套配色变成每页公式。'},
  portrait:{title:'人物层级',operations:['material.add','material.cut','layer.update','text.add'],advice:'仅在人物主题适合时，比较完整照片与裁剪轮廓的职责。让大小、朝向、遮挡和文字条共同建立重点；不要遮住脸、动作或重要印刷字。普通实体不能复制或放大来制造多个人像，只有合法的多份或数字来源才能重复。没有人物时改用当前素材的轮廓与可写面，不强造人像模板。'},
  cutwork:{title:'裁片取用',operations:['material.cut','material.split','material.window','material.weave','material.edge'],advice:'只为明确的轮廓、接缝或图文关系加工。保留人物动作和重要印刷字，真正裁片共用来源占用账本；余料不重叠才再用。需要穿插先造窗口再穿条，几何失败就换可实现构图，不用伪预览掩饰。'}
};

const styleMethods={
  '随材而定':['relationships','layering'],
  '清新淡雅':['relationships','marks'],
  '美式拼贴':['layering','lettering','cutwork'],
  '复古旧物':['editorial','layering','stamps'],
  '日系文具':['tape','stamps','marks'],
  '童趣可爱':['relationships','color','lettering','marks'],
  '杂志排版':['editorial','lettering'],
};
const unique=items=>[...new Set(items)];
const asArray=value=>Array.isArray(value)?value:[];
export function creationMaterialContext(materials=[]){
  const rows=asArray(materials);
  const presets=rows.filter(m=>m.usageStatus==='preset'||m.isCreativePreset);
  const supporting=rows.filter(m=>!(m.usageStatus==='preset'||m.isCreativePreset)&&['tape','stamp'].includes(m.kind));
  const main=rows.filter(m=>!presets.includes(m)&&!supporting.includes(m));
  return {mainCount:main.length,presetCount:presets.length,supportingCount:supporting.length,mode:main.length===0?'support-only':main.length<=3?'sparse':'rich'};
}

export function creationGuidanceRoute({styles=[],purposes=[],materials=[],contentPolicy='original',textMode='automatic',userText='',intent='',theme=''}={}){
  const style=asArray(styles).find(s=>Object.hasOwn(styleMethods,s))||'随材而定';
  const purpose=asArray(purposes).find(p=>['自由创作','清单计划','主题封面'].includes(p))||'自由创作';
  const context=creationMaterialContext(materials);
  const writes=contentPolicy!=='visual'&&textMode!=='none'&&(textMode!=='requested'||String(userText).trim()||/写|文字|正文|标题|清单|记录/.test(String(intent||theme)));
  const methods=unique(['relationships',...styleMethods[style],...(purpose==='清单计划'?['planner']:purpose==='主题封面'&&writes?['lettering']:writes&&contentPolicy!=='documentary'?['writing']:[]),...(materials.some(m=>m.kind==='tape')?['tape']:[]),...(materials.some(m=>m.kind==='stamp')?['stamps']:[])]).filter(id=>writes||!['writing','lettering'].includes(id));
  const materialAdvice=context.mode==='rich'
    ?'主素材较多：把主角、印刷标题、书写面和承托纸拉开职责，构成有联系的局部；不必全件完整陈列。'
    :context.mode==='sparse'
      ?'主素材较少：先核对真实大小；纸面本身可以承载表达，数字图形也能做主角。少量材料应与周围内容发生关系，不放大实物填空。'
      :'没有普通主素材：从主题和现有预设建立视觉主体与阅读顺序；预设、可编辑图形和文字可以完成整页，不伪造用户照片或经历。';
  const textAdvice=!writes?'本次不新增文字，完整度由轮廓、层次、色彩和已有印刷内容建立。':purpose==='清单计划'?'书写服务真实计划，保留待填写空间，不假造已完成记录。':contentPolicy==='documentary'?'根据用户提供的小事整理记录；没有事实的部分不编写亲历，可留出明确的待记录区域。':purpose==='主题封面'?'短标题与主视觉共同组织封面，不强塞日记段落。':'从具体想法展开连贯书写，短注和局部强调回应图像；字数由内容与空间共同决定。标题融入素材关系，默认避免左上角大面积实底横幅。完成后看真实预览：检查素材内可写面是否闲置、孤字换行和圈注是否有明确对象；按问题局部修改，不为填空机械堆字。';
  const summary=!writes?'用素材、图形和叠层完成画面，不新增文字。':purpose==='清单计划'?'按日期、任务和备注组织页面，预留可填写空间，不假造已完成记录。':purpose==='主题封面'?'让短标题与主视觉共同构成封面。':context.mode==='rich'?'按主次组织素材，让书写与叠层彼此呼应。':'素材少也可以完成整页，让书写和图形参与表达。';
  return {style,purpose,writes:Boolean(writes),context,methods,materialAdvice,textAdvice,summary,note:'素材数量与标签仅供判断；以真实图片、毫米尺寸和用户要求为准。方法可组合或舍弃，不是固定模板。'};
}

export function creationGuidanceText(options={}){
  const route=creationGuidanceRoute(options);
  return ['【按任务选择的方法】',`${route.style} · ${route.purpose}：${route.materialAdvice}`,route.textAdvice,route.note,
    ...route.methods.filter(id=>id!=='relationships').map(id=>`${creationMethods[id].title}：${creationMethods[id].advice}`)].join('\n');
}

// No filesystem paths or tutorial downloads supplied by the model are executed.
export function describeCreationGuidance(topics=[]){
  const requested=asArray(topics).filter(Boolean);
  if(!requested.length)return {topics:[...Object.entries(creationMethods).map(([id,m])=>({id,title:m.title})),...Object.keys(styleMethods).map(title=>({id:title,title}))],hint:'guide <专题或风格> [...]；精确命令参数用 describe。'};
  return {guides:requested.map(id=>{
    if(Object.hasOwn(creationMethods,id))return {id,...creationMethods[id]};
    if(Object.hasOwn(styleMethods,id))return {id,title:id,advice:visualStyles.find(([name])=>name===id)?.[1],methods:styleMethods[id].map(key=>({id:key,...creationMethods[key]}))};
    throw Object.assign(Error('未知创作专题：'+id+'；运行 guide 查看可用专题'),{code:'GUIDE_TOPIC_UNKNOWN'});
  })};
}

export function creationTaskBrief(task){
  return {title:task.title,intent:task.intent,userText:task.userText,providedFacts:task.providedFacts,page:task.page,processing:task.processing,contentPolicy:task.contentPolicy,textMode:task.sourceContext?.textMode||task.textMode||'automatic',
    route:creationGuidanceRoute({...task,textMode:task.sourceContext?.textMode||task.textMode}),
    materials:asArray(task.materials).map(({alias,title,selection,kind,usageStatus,physicalWidthMM,physicalHeightMM,image})=>({alias,title,selection,kind,usageStatus,physicalWidthMM,physicalHeightMM,image})),
    guide:task.creativeBriefRef,overview:'assets/overview.jpg',physicalScale:task.physicalScaleRef};
}

import {journalReferenceCases} from './journal-reference-catalog.js';
import {rankJournalTemplates} from './journal-template-catalog.js';

// Descriptions of diagrams visible in the user's numbered tutorial images.
// exampleSourceNumbers is present only when the matching finished page can
// actually be identified; a template does not require such a match to be used.
export const journalAbstractTemplates=Object.freeze([
  {id:'centered-writing-sheet',caseId:'handwritten-observation',sourceNumbers:[1],exampleSourceNumbers:[1],title:'居中书写片',structure:'主书写纸居中叠在底纸上；标题靠主纸边，连续手写段落留在纸内，小图只点缀边缘。'},
  {id:'four-corner-notes',caseId:'handwritten-observation',sourceNumbers:[1],exampleSourceNumbers:[1],title:'四角短记',structure:'中心底块连接四角分开的短段和小图；四组内容围绕中心形成呼应。'},
  {id:'top-bottom-writing',caseId:'handwritten-observation',sourceNumbers:[11],exampleSourceNumbers:[11],title:'上下图文构图',structure:'原图标注的“上下构图”：上下两个主要记录区先后展开，照片、短注和较长文字在各区内部相邻。'},
  {id:'diary-left-right-columns',caseId:'handwritten-observation',sourceNumbers:[28],exampleSourceNumbers:[28],title:'左右书写分栏',structure:'原图左侧的黄色示意把照片和连续文字分配到左右相邻区域，右侧成品展示主图与长段日记的呼应。'},
  {id:'diary-small-card-grid',caseId:'handwritten-observation',sourceNumbers:[39],exampleSourceNumbers:[39],title:'小卡与注释分组',structure:'原图下方用蓝、黄色卡片标出标题、小卡、贴纸和书写区，上方成品把手写记录分入这些大小不等的区域。'},
  {id:'diary-blue-notes',caseId:'handwritten-observation',sourceNumbers:[64,65],exampleSourceNumbers:[64,65],title:'双页蓝黄书写区',structure:'原图下方示意双页中不同大小的正文、书写卡、照片和贴纸位置，上方展示对应的文字密集手帐。'},

  {id:'food-main-and-details',caseId:'warm-food',sourceNumbers:[2],exampleSourceNumbers:[2],title:'食物主次图与短注',structure:'大幅食物图与较小的局部图错落相接，短注分散贴近各自图片，标题与细节共同引导阅读。'},
  {id:'food-green-blocks',caseId:'warm-food',sourceNumbers:[51],exampleSourceNumbers:[51],title:'绿色主次块与食物图',structure:'原图左侧抽象模板用不等大的绿色、棕色块标示主图、次图及文字，右侧食物拼贴展示对应关系。'},
  {id:'red-market-two-column-timeline',caseId:'warm-food',sourceNumbers:[36],exampleSourceNumbers:[35],title:'双列时间轴与主次图',structure:'双页中缝是一条纵向时间或路线轴；两侧交错放置多幅主图、较小次主图、文字块与圆形装饰，图文顺着轴向下推进。第 35 张是真实成品，第 36 张是它的抽象模板。'},

  {id:'editorial-main-column',caseId:'photo-editorial',sourceNumbers:[4],exampleSourceNumbers:[4],title:'主图与模块分栏',structure:'显著主图旁搭配不同大小的矩形图块和短文字区，色块与实图错层但保持主次。'},
  {id:'editorial-paper-blocks',caseId:'photo-editorial',sourceNumbers:[23],exampleSourceNumbers:[23],title:'照片与纸片模块',structure:'原图下排的抽象色块模板对应上排杂志拼贴；照片、书写块和装饰块并非等大方格。'},
  {id:'editorial-offset-cards',caseId:'photo-editorial',sourceNumbers:[13],exampleSourceNumbers:[13],title:'错层卡片分组',structure:'几张不同大小的纸片相互压边，标题或长段落落在其中一块，其他块承载较小图像与注释。'},
  {id:'editorial-asymmetric-blocks',caseId:'photo-editorial',sourceNumbers:[49],exampleSourceNumbers:[49],title:'不对称杂志图块',structure:'原图下方的抽象模板以大小不等的矩形和圆形区分主图、文字与装饰，旁边成品呈现相同的错层关系。'},
  {id:'editorial-red-diagonal',caseId:'photo-editorial',sourceNumbers:[14],title:'红底斜向主次图',structure:'原图以斜线贯穿不等大的主图、次主图、文字与圆形装饰区，阅读顺序在两侧交替。'},
  {id:'editorial-green-stack',caseId:'photo-editorial',sourceNumbers:[17],title:'绿黄竖向叠块',structure:'原图以大块绿色主图区和黄色次图区上下错层，小字条与圆形点缀穿插其间。'},
  {id:'editorial-neutral-palette',caseId:'photo-editorial',sourceNumbers:[16],exampleSourceNumbers:[16],title:'中性色与同色系关系',structure:'原图把中性色环与同色系色环分别放在两组日记成品旁；色彩关系辅助照片、文字和贴纸统一，不规定固定坐标。'},
  {id:'editorial-adjacent-palette',caseId:'photo-editorial',sourceNumbers:[27],exampleSourceNumbers:[27],title:'邻近色与撞色关系',structure:'原图将邻近色和对比色两组色环分别与成品并列；照片、色块及高亮文字可借这些关系形成层次。'},
  {id:'editorial-triptych-variants',caseId:'photo-editorial',sourceNumbers:[52,53,54],exampleSourceNumbers:[52,53,54],title:'三组照片拼贴与色块拆解',structure:'原图每组上排是真实拼贴，下排用不同大小的主色块、纸片和圆形装饰抽象出其层级关系。'},

  {id:'dark-numbered-stops',caseId:'dark-route',sourceNumbers:[7],exampleSourceNumbers:[8],pairEvidenceNumbers:[29],title:'编号节点与画面片段',structure:'亮色编号顺着曲线串起照片位、短段和装饰笔迹；第 29 张将该构图示意与实际深底拼贴并列。'},
  {id:'dark-s-spine',caseId:'dark-route',sourceNumbers:[29],exampleSourceNumbers:[29],title:'曲线主脊',structure:'第 29 张下排并置弯曲阅读线示意与深底拼贴成品；照片和短字沿曲线两侧交替出现。'},
  {id:'dark-vertical-axis',caseId:'dark-route',sourceNumbers:[21],title:'纵向轴与左右呼应',structure:'原图的竖向轴串联多个左右分支和节点，图文位置顺着分支形成呼应。'},
  {id:'dark-yellow-green-blocks',caseId:'dark-route',sourceNumbers:[6],title:'绿黄主次色块',structure:'原图用两列不等大的绿色主图区、黄色次图区、圆形装饰和短文字标示层级，斜线连接相邻区。'},
  {id:'dark-curved-five-stops',caseId:'dark-route',sourceNumbers:[20],title:'五节点弯曲路线',structure:'原图中五个编号节点沿一条弯曲细线由上而下连接，为照片和注释提供连续的阅读顺序。'},
  {id:'dark-red-blue-path',caseId:'dark-route',sourceNumbers:[33],title:'红蓝双线阅读路径',structure:'原图在深色底上以红色曲线、黄色节点与蓝色图框和短文字构成上下串联的阅读路径。'},

  {id:'planner-numbered-sections',caseId:'gentle-planner',sourceNumbers:[38],title:'编号小节与记录区',structure:'较大的章节编号衔接小标题、书写区和照片区；不同小节沿页面上下继续。'},
  {id:'planner-paper-pockets',caseId:'gentle-planner',sourceNumbers:[43,44],title:'重复纸片书写区',structure:'原图中的编号小节反复配有可写纸片和小标签；纸片位置、大小与附近小图在每节变化。'},
  {id:'planner-mixed-blocks',caseId:'gentle-planner',sourceNumbers:[45,48],title:'色纸与清单分组',structure:'原图用大小不同的色纸、短标签、书写行和编号分组；组与组间由留白或细线分开。'},
  {id:'planner-text-and-photo',caseId:'gentle-planner',sourceNumbers:[61],exampleSourceNumbers:[61],title:'文字与图片间隔',structure:'原图下方模板以文字区、图片区交替的色块归纳上方真实双页；正文与贴图组保持连续。'},
  {id:'planner-staggered-notes',caseId:'gentle-planner',sourceNumbers:[62],exampleSourceNumbers:[62],title:'错位便签组',structure:'原图下方的标签色块归纳上方双页成品；不同位置的便签与文字区错位连接。'},
  {id:'planner-layered-cards',caseId:'gentle-planner',sourceNumbers:[68],exampleSourceNumbers:[68],title:'便签卡纸分层',structure:'原图上方是双页记录，下方是纯色卡纸、便签、胶带和贴纸位置关系的抽象图。'},
  {id:'planner-city-map',caseId:'gentle-planner',sourceNumbers:[46],title:'城市名片与路线区',structure:'原图把城市名称、地图式路径、标题条、图片位和小注分配到几个独立板块，路径连接相关地点。'},

  {id:'quiet-diagonal-photo-groups',caseId:'quiet-day',sourceNumbers:[30],exampleSourceNumbers:[30],title:'斜向串联的照片组',structure:'原图左上模板以虚线串联多张不同大小的主图和次主图，文字带横向穿插；右上是对应的日常照片拼贴。'},
  {id:'quiet-offset-photo-groups',caseId:'quiet-day',sourceNumbers:[30],exampleSourceNumbers:[30],title:'错位分列的照片组',structure:'原图左下模板用左右错位的主图与圆形次图形成另一条视线路径；右下是对应的生活记录成品。'},

  {id:'travel-numbered-scenes',caseId:'travel-route',sourceNumbers:[42],title:'编号景点记录',structure:'景物图像与地点标题、对应短记组成前后两个编号区，票据和小图穿插其中。'},
  {id:'travel-timetable',caseId:'travel-route',sourceNumbers:[47],title:'时间表式记录',structure:'纵向时间栏与并列栏目相邻，事件或小图放在对应条目旁；色条帮助区分不同阶段。'},
  {id:'travel-s-layout',caseId:'travel-route',sourceNumbers:[58,69],title:'S 形图文走向',structure:'不同大小的图块与文字沿上下交替的 S 形顺序分布，局部可叠面、叠点或叠线。'},
  {id:'travel-layered-paper-sheet',caseId:'travel-route',sourceNumbers:[41],title:'倾斜纸张与片段叠层',structure:'原图在倾斜纸页内交错放置长短文字线、色纸、圆形装饰和矩形主图区，局部纸片压住相邻层。'},
  {id:'travel-green-main-sub',caseId:'travel-route',sourceNumbers:[50],title:'绿色主次图与说明',structure:'原图用大幅主体区、较小次图区和多段文字区交错编排，斜线标出主次图文间的连接。'},
  {id:'travel-oval-caption-bands',caseId:'travel-route',sourceNumbers:[56],title:'椭圆主图与横向说明带',structure:'原图以大椭圆主图区配合横向长文字带、浅色装饰和小图块，上下形成不等大的几个阅读段。'},
  {id:'travel-layering-levels',caseId:'travel-route',sourceNumbers:[58],title:'S 形叠层深度',structure:'原图以基本、衍生、丰富三列说明同一 S 形图文框架的不同叠层程度，保留主图区和文字线的前后关系。'},
  {id:'travel-blue-orange-collage',caseId:'travel-route',sourceNumbers:[60],title:'蓝橙斜纸拼贴',structure:'原图在倾斜纸页上以蓝色纸片、橙色圆片、贴条与水平书写线层叠，形成清楚的主次顺序。'},
  {id:'travel-blue-orange-s',caseId:'travel-route',sourceNumbers:[67],title:'蓝橙 S 形图文',structure:'原图在倾斜纸页上沿 S 形交替排列蓝色卡纸、橙色圆形和书写线，图文之间用小纸条衔接。'}
]);

export function selectJournalAbstractTemplates(cases=[],context={},limit=3){
  const families=new Set(cases.map(entry=>entry.id));
  const candidates=rankJournalTemplates(context,context.userTemplates||[],journalAbstractTemplates.length+(context.userTemplates||[]).length)
    .filter(entry=>entry.origin==='user'||families.has(entry.caseId));
  const chosen=[],usedFamilies=new Set();
  for(const entry of candidates){if(chosen.length>=limit)break;if(!usedFamilies.has(entry.caseId||entry.id)){chosen.push(entry);usedFamilies.add(entry.caseId||entry.id);}}
  for(const entry of candidates){if(chosen.length>=limit)break;if(!chosen.includes(entry))chosen.push(entry);}
  return chosen;
}

export function journalAbstractTemplateGuide(templates){
  if(!templates.length)return '';
  const caseNames=Object.fromEntries(journalReferenceCases.map(entry=>[entry.id,entry.title]));
  return `以下是按风格、用途、素材标签匹配的少量抽象模板；只借鉴图文关系，不照搬照片、字句或固定坐标。references/ 中若有相应原图，请与文字结构一起看；未附图的模板仍可用结构说明，不要猜测缺失画面。\n${templates.map((entry,index)=>`${index+1}. ${entry.title}（标签：${(entry.tags||[]).slice(0,8).join('、')}；${entry.origin==='user'?'用户导入模板'+(entry.exampleBlobId?'，有配对案例':'，无配对案例'):`风格家族：${caseNames[entry.caseId]}；模板原图 ${entry.sourceNumbers.join('、')}${entry.exampleSourceNumbers?.length?`；对应真实案例原图 ${entry.exampleSourceNumbers.join('、')}`:'；尚无可确认对应成品'}`}）：${entry.structure}`).join('\n')}`;
}

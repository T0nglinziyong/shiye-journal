// Anonymous layout studies. These are generated from the selected directions;
// no saved project, private journal text, or material image is read here.
import {canvasSize} from './domain.js';
import {styleGroups} from './matching-directions.js';
const paletteFor=style=>{
  if(/复古|旅行|手作|胶片/.test(style))return ['#faf4e9','#aa765a','#e4c7a5','#63534a'];
  if(/美式|童趣|可爱|密集/.test(style))return ['#fff8ec','#da6d60','#f3c96d','#465d81'];
  if(/极简|杂志|摄影|自由/.test(style))return ['#faf9f5','#515e55','#dadfd4','#323936'];
  if(/植物|韩系|日系|留白/.test(style))return ['#f8faf2','#89ad91','#dce9d1','#405c4c'];
  return ['#faf6ee','#9d9a88','#ded8c9','#4d5249'];
};
const purposeParts={
  自由创作:['视觉入口','印刷字或短句','可写区域','图文连接','局部回应','有意留白'],
  日常记录:['主素材','主题标题','多行正文','图注','延续观察','数字分隔线'],
  旅途记录:['照片或票据','旅途主题','行程文字','路线线条','沿途见闻','图注'],
  图文收藏:['收藏主件','分类标题','分组说明','数字框线','第二组图注','短评'],
  清单计划:['主题素材','清单标题','多行可编辑条目','数字勾选框','备注文字','色带'],
  影像故事:['主图','叙事标题','连续说明','辅图位置','细节图注','数字线条'],
  主题封面:['主视觉','短标题','简短副题','一处可编辑图形','标记文字','色带']
};
// Structural abstractions from the supplied journal screenshots. They do not
// include a cropped sticker, photograph, watermark, or copied diary text.
const arrangements=[
  {id:'quiet',level:'简洁',title:'图像与长记录',source:'用户案例中的图文日记、问答页',idea:'一件主图靠近完整的多行记录，短注解释可见细节；纸片只在能承载内容时出现。简洁版仍可有连续阅读，不靠单句口号撑页。',zones:[[.1,.19,.38,.38],[.1,.1,.8,.07],[.54,.21,.36,.24],[.54,.48,.36,.12],[.1,.65,.8,.14],[.1,.83,.8,.025]]},
  {id:'hero',level:'均衡',title:'纸片错层与书写',source:'用户案例中的活页纸片、便签与胶带',idea:'可写底纸与标签错层，文字进入可写区域；连接材料把主件与次件组织起来，保留真实材料的边缘。',zones:[[.08,.2,.45,.44],[.58,.12,.34,.09],[.58,.27,.34,.35],[.08,.7,.84,.08],[.08,.81,.62,.08],[.76,.81,.16,.03]]},
  {id:'editorial',level:'丰富',title:'图文分栏与票据',source:'用户案例中的旅行记录、食物观察',idea:'主图、票据或生活凭证与文字分组呈现，辅图靠近相关图注；没有实物依据时不能虚构票据、地点或日期。',zones:[[.08,.19,.36,.35],[.5,.1,.42,.09],[.5,.24,.42,.26],[.08,.6,.84,.04],[.08,.69,.4,.18],[.53,.68,.39,.2]]},
  {id:'diagonal',level:'实验',title:'路线式阅读动线',source:'用户案例中的 S 形路线、时间轴',idea:'让几组有内容的图文沿路线展开，数字线、点号和短图注提示先后；路线不是把所有素材硬串成一条线。',zones:[[.08,.16,.35,.27],[.54,.12,.38,.08],[.47,.33,.45,.25],[.08,.5,.32,.14],[.08,.72,.53,.16],[.68,.72,.24,.11]]}
];
const spreadZones={
  quiet:[[.08,.18,.35,.38],[.08,.1,.82,.06],[.56,.2,.34,.22],[.56,.46,.34,.13],[.08,.68,.82,.13],[.08,.84,.82,.025]],
  hero:[[.08,.18,.35,.43],[.57,.11,.34,.09],[.57,.27,.34,.34],[.08,.7,.36,.1],[.56,.7,.35,.11],[.56,.85,.34,.02]],
  editorial:[[.08,.18,.35,.35],[.56,.1,.35,.09],[.56,.25,.35,.27],[.08,.6,.83,.03],[.08,.68,.35,.18],[.56,.68,.35,.18]],
  diagonal:[[.08,.16,.33,.28],[.58,.11,.32,.08],[.56,.34,.35,.24],[.08,.5,.33,.13],[.08,.72,.34,.15],[.57,.72,.33,.13]]
};
function styleDimensions(styles){
  const [mood,layout]=styleGroups.map(group=>group.options.find(value=>styles.includes(value))||null);
  return {mood:mood||styles[0]||'不预设',layout:layout||'不预设'};
}
function tailoredZones(entry,{layout,purpose,mode}){
  const raw=mode==='spread'?spreadZones[entry.id]:entry.zones;
  const restrained=/极简|留白/.test(layout),dense=/丰富层叠/.test(layout);
  return raw.map(([x,y,w,h],index)=>{
    const scale=restrained?.94:dense?1.035:1;
    if(index===0&&purpose==='主题封面')w*=1.06;
    if(index===2&&purpose==='清单计划')h*=1.07;
    if(index===2&&purpose==='主题封面')h*=.68;
    const rightEdge=mode==='spread'&&x<.5?.47:.94;
    const nw=Math.min(w*scale,rightEdge-x),nh=Math.min(h*scale,.88-y);
    return [mode==='spread'?x:x+(w-nw)/2,y+(h-nh)/2,nw,nh];
  });
}
export function presetReferencePlans({styles=['随材而定','自动安排'],purposes=['自由创作'],mode='single',ratio='a5'}={}){
  const dimensions=styleDimensions(styles),style=styles[0]||'随材而定',purpose=purposes[0]||'自由创作',labels=purposeParts[purpose]||purposeParts.自由创作,palette=paletteFor(dimensions.mood);
  return arrangements.map((entry,index)=>({index:index+1,id:entry.id,level:entry.level,title:entry.title,source:entry.source,style,purpose,mode,ratio,dimensions,idea:entry.idea,labels,zones:tailoredZones(entry,{layout:dimensions.layout,purpose,mode}),palette,secondaryStyles:styles.slice(1),secondaryPurposes:purposes.slice(1)}));
}
export function presetReferenceGuide(plans){
  return '四张匿名预设构图示意｜仅标示区域关系，不含用户作品、照片或日记。\n'+
    '这些结构来自用户提供的案例截图的文字化观察，并参考公开手帐方法；没有复制截图、原文、标志或个人照片。公开方法：https://www.1101.com/store/techo/en/magazine/tt_report/202304/ ；https://bulletjournal.com/blogs/faq/how-to-write-a-daily-log ；https://bulletjournal.com/blogs/bulletjournalist/show-tell-with-yu 。\n把样例视为可改造的起点：先观察本次真实素材的轮廓、方向、尺寸与可读内容，再选用或重组结构。不要复制样例坐标、色块、占位标签或凭空制造实物。\n'+
    plans.map(p=>`\n${p.index}. ${p.level}方案 · ${p.title}｜${p.style} × ${p.purpose}${p.secondaryStyles.length?'；兼顾 '+p.secondaryStyles.join('、'):''}${p.secondaryPurposes.length?'；兼顾 '+p.secondaryPurposes.join('、'):''}\n风格拆解：配色与氛围=${p.dimensions.mood}；版式与密度=${p.dimensions.layout}。这些维度可组合，不将配色当成固定模板。\n来源结构：${p.source}。${p.idea}\n图示区域：${p.labels.slice(0,p.zones.length).join(' → ')}。`).join('\n')+
    '\n\n同一种风格和用途可从简洁、均衡、丰富到实验构图，不按复杂度评分。先比较四种方案，选择最适合本次素材与用途的一种，再形成有个人判断的最终版；无需交付四个版本。';
}
export async function renderPresetReferences(plans,{width=400}={}){
  const output=[];
  for(const plan of plans){
    const canvas=document.createElement('canvas'),spread=plan.mode==='spread';canvas.width=spread?Math.round(width*1.4):width;canvas.height=Math.round(canvas.width/(canvasSize(plan.mode,plan.ratio).width/1000));
    const c=canvas.getContext('2d'),[paper,accent,pale,ink]=plan.palette,W=canvas.width,H=canvas.height;
    c.fillStyle=paper;c.fillRect(0,0,W,H);c.strokeStyle='#d9d9ce';c.strokeRect(12,12,W-24,H-24);
    if(spread){c.beginPath();c.moveTo(W/2,15);c.lineTo(W/2,H-15);c.stroke();}
    c.fillStyle=ink;c.font='bold 19px sans-serif';c.fillText(`${plan.index}  ${plan.level} · ${plan.title}`,28,28);
    c.font='13px sans-serif';c.fillText(`${plan.style} × ${plan.purpose}`,28,47);
    for(const [i,[x,y,w,h]] of plan.zones.entries()){
      const rx=Math.round(x*W),ry=Math.round(y*H),rw=Math.round(w*W),rh=Math.round(h*H);
      c.fillStyle=i===0?accent:i===1?pale:i===2?'#ffffff':pale;c.globalAlpha=i===0?.55:.88;c.fillRect(rx,ry,rw,rh);c.globalAlpha=1;
      c.strokeStyle=i===0?ink:accent;c.lineWidth=i===0?2:1;c.strokeRect(rx,ry,rw,rh);
      if(/正文|文字|条目|见闻|说明|观察|短评|图注/.test(plan.labels[i])){c.strokeStyle=ink;c.globalAlpha=.22;for(let line=0;line<Math.max(2,Math.min(5,Math.floor(rh/17)));line++){const ly=ry+rh*(line+1)/(Math.min(6,Math.floor(rh/17)+1));c.beginPath();c.moveTo(rx+12,ly);c.lineTo(rx+rw-12,ly);c.stroke();}c.globalAlpha=1;}
      c.fillStyle=ink;c.font='14px sans-serif';c.fillText(plan.labels[i],rx+10,ry+Math.min(25,rh/2+5),Math.max(20,rw-20));
    }
    c.fillStyle=ink;c.globalAlpha=.55;c.font='12px sans-serif';c.fillText('匿名构图示意 · 不代表真实素材尺寸',28,H-24);c.globalAlpha=1;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('无法生成预设样例');
    output.push({id:plan.id,title:plan.title,width:canvas.width,height:canvas.height,bytes:new Uint8Array(await blob.arrayBuffer()),url:canvas.toDataURL('image/png')});
  }
  return output;
}

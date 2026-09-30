// Anonymous layout studies. These are generated from the selected directions;
// no saved project, private journal text, or material image is read here.
const paletteFor=style=>{
  if(/复古|旅行|手作|胶片/.test(style))return ['#faf4e9','#aa765a','#e4c7a5','#63534a'];
  if(/美式|童趣|可爱|密集/.test(style))return ['#fff8ec','#da6d60','#f3c96d','#465d81'];
  if(/极简|杂志|摄影|自由/.test(style))return ['#faf9f5','#515e55','#dadfd4','#323936'];
  if(/植物|韩系|日系|留白/.test(style))return ['#f8faf2','#89ad91','#dce9d1','#405c4c'];
  return ['#faf6ee','#9d9a88','#ded8c9','#4d5249'];
};
const purposeParts={
  日常记录:['主素材','主题标题','两段观察','图注'],
  旅途记录:['路线或票据','行程主题','沿途见闻','地点据实填写'],
  图文收藏:['收藏主件','分类标题','图文条目','真实标签'],
  清单计划:['主题素材','清单标题','可编辑条目','勾选与备注'],
  影像故事:['主图','叙事标题','连续说明','细节图注'],
  主题封面:['主视觉','短标题','留白','简短副题']
};
const arrangements=[
  {id:'quiet',level:'简洁',title:'留白与局部强调',idea:'只用一件可信的材料、短标题和必要内容形成焦点。封面可更少字；记录、清单页仍需有真正内容。',zones:[[.27,.25,.45,.36],[.13,.13,.67,.08],[.18,.68,.6,.13]]},
  {id:'hero',level:'均衡',title:'主视觉与叙述',idea:'主素材先抓住视线，文字在旁边形成阅读段落；边角放一件有意义的小素材或图注。',zones:[[.08,.18,.47,.46],[.6,.2,.32,.1],[.6,.36,.31,.29],[.12,.75,.75,.11]]},
  {id:'editorial',level:'丰富',title:'有节奏的分栏',idea:'用不等大的真实素材和图文组组成网格；主次明显，信息从上到下连贯，保留段落可读空间。',zones:[[.08,.21,.33,.38],[.49,.14,.42,.1],[.49,.31,.41,.28],[.09,.67,.4,.16],[.55,.67,.34,.13]]},
  {id:'diagonal',level:'实验',title:'错层与动线',idea:'用斜向阅读路线把主件、标题、补充素材和说明连接起来；允许局部叠压，但不遮正文或伪造实物。',zones:[[.12,.15,.35,.28],[.54,.25,.36,.1],[.39,.47,.45,.2],[.11,.68,.3,.14],[.7,.72,.19,.11]]}
];
const spreadZones={
  quiet:[[.12,.22,.29,.38],[.59,.22,.3,.1],[.58,.43,.31,.19]],
  hero:[[.08,.17,.36,.48],[.57,.17,.34,.1],[.57,.34,.34,.29],[.11,.74,.32,.1]],
  editorial:[[.08,.19,.35,.36],[.55,.16,.36,.1],[.55,.32,.36,.29],[.1,.67,.34,.15],[.56,.69,.33,.12]],
  diagonal:[[.1,.17,.32,.29],[.59,.2,.3,.1],[.54,.4,.35,.23],[.1,.62,.32,.17],[.69,.73,.19,.11]]
};
function tailoredZones(entry,{style,purpose,mode}){
  const raw=mode==='spread'?spreadZones[entry.id]:entry.zones;
  const restrained=/极简|留白|韩系|日系/.test(style),dense=/美式|混合媒材|密集拼贴/.test(style);
  return raw.map(([x,y,w,h],index)=>{
    const scale=restrained?.94:dense?1.035:1;
    if(index===0&&purpose==='主题封面')w*=1.06;
    if(index===2&&purpose==='清单计划')h*=1.07;
    if(index===2&&purpose==='主题封面')h*=.62;
    const rightEdge=mode==='spread'&&x<.5?.47:.94;
    const nw=Math.min(w*scale,rightEdge-x),nh=Math.min(h*scale,.88-y);
    return [x+(w-nw)/2,y+(h-nh)/2,nw,nh];
  });
}
export function presetReferencePlans({styles=['韩系清新'],purposes=['日常记录'],mode='single'}={}){
  const style=styles[0]||'韩系清新',purpose=purposes[0]||'日常记录',labels=purposeParts[purpose]||purposeParts.日常记录,palette=paletteFor(style);
  return arrangements.map((entry,index)=>({index:index+1,id:entry.id,level:entry.level,title:entry.title,style,purpose,mode,idea:entry.idea,labels:[...labels,'补充素材／短注'],zones:tailoredZones(entry,{style,purpose,mode}),palette,secondaryStyles:styles.slice(1),secondaryPurposes:purposes.slice(1)}));
}
export function presetReferenceGuide(plans){
  return '四张匿名预设构图示意｜仅标示区域关系，不含用户作品、照片或日记。\n'+
    '把样例视为可改造的起点：先观察本次真实素材的轮廓、方向、尺寸与可读内容，再选用或重组结构。不要复制样例坐标、色块、占位标签或凭空制造实物。\n'+
    plans.map(p=>`\n${p.index}. ${p.level}方案 · ${p.title}｜${p.style} × ${p.purpose}${p.secondaryStyles.length?'；兼顾 '+p.secondaryStyles.join('、'):''}${p.secondaryPurposes.length?'；兼顾 '+p.secondaryPurposes.join('、'):''}\n${p.idea}\n图示区域：${p.labels.slice(0,p.zones.length).join(' → ')}。`).join('\n')+
    '\n\n同一种风格和用途可从简洁、均衡、丰富到实验构图，不按复杂度评分。先比较四种方案，选择最适合本次素材与用途的一种，再形成有个人判断的最终版；无需交付四个版本。';
}
export async function renderPresetReferences(plans,{width=400}={}){
  const output=[];
  for(const plan of plans){
    const canvas=document.createElement('canvas'),spread=plan.mode==='spread';canvas.width=spread?Math.round(width*1.42):width;canvas.height=560;
    const c=canvas.getContext('2d'),[paper,accent,pale,ink]=plan.palette,W=canvas.width,H=canvas.height;
    c.fillStyle=paper;c.fillRect(0,0,W,H);c.strokeStyle='#d9d9ce';c.strokeRect(12,12,W-24,H-24);
    if(spread){c.beginPath();c.moveTo(W/2,15);c.lineTo(W/2,H-15);c.stroke();}
    c.fillStyle=ink;c.font='bold 19px sans-serif';c.fillText(`${plan.index}  ${plan.level} · ${plan.title}`,28,43);
    c.font='13px sans-serif';c.fillText(`${plan.style} × ${plan.purpose}`,28,65);
    for(const [i,[x,y,w,h]] of plan.zones.entries()){
      const rx=Math.round(x*W),ry=Math.round(y*H),rw=Math.round(w*W),rh=Math.round(h*H);
      c.fillStyle=i===0?accent:i===1?pale:i===2?'#ffffff':pale;c.globalAlpha=i===0?.55:.88;c.fillRect(rx,ry,rw,rh);c.globalAlpha=1;
      c.strokeStyle=i===0?ink:accent;c.lineWidth=i===0?2:1;c.strokeRect(rx,ry,rw,rh);
      if(i===2){c.strokeStyle=ink;c.globalAlpha=.22;for(let line=0;line<3;line++){const ly=ry+rh*(line+1)/5;c.beginPath();c.moveTo(rx+12,ly);c.lineTo(rx+rw-12,ly);c.stroke();}c.globalAlpha=1;}
      c.fillStyle=ink;c.font='14px sans-serif';c.fillText(plan.labels[i],rx+10,ry+Math.min(25,rh/2+5),Math.max(20,rw-20));
    }
    c.fillStyle=ink;c.globalAlpha=.55;c.font='12px sans-serif';c.fillText('匿名构图示意 · 不代表真实素材尺寸',28,H-24);c.globalAlpha=1;
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('无法生成预设样例');
    output.push({id:plan.id,title:plan.title,bytes:new Uint8Array(await blob.arrayBuffer()),url:canvas.toDataURL('image/png')});
  }
  return output;
}

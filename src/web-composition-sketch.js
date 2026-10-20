import {compileWebSceneInput} from './web-scene-workbench.js';

const finite=(value,min,max,label)=>{
  if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max)throw Error(label+' 必须在 '+min+'–'+max+' 之间');
  return value;
};
const short=(value,max,label)=>{
  if(typeof value!=='string'||!value.trim()||value.length>max)throw Error(label+' 须为不超过 '+max+' 字的文字');
  return value.trim();
};
const color=(value,label)=>{
  if(typeof value!=='string'||!/^#[0-9a-fA-F]{6}$/.test(value))throw Error(label+' 须为六位颜色');
  return value;
};
const known=(value,allowed,label)=>{
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key)))throw Error(label+' 包含未知或无效字段');
};

// This is a deliberately small design language. The existing Scene compiler
// still owns physical sizes, provenance, protected layers and validation.
export function compileCompositionSketch(base,option,assets){
  known(option,['id','idea','materials','texts','writingAreas','paper'],'构图方案');
  if(!/^[a-z][a-z0-9_-]{0,23}$/.test(option.id||''))throw Error('构图方案 id 须为短英文标识');
  short(option.idea,120,'构图意图');
  if(!Array.isArray(option.materials)||option.materials.length>48)throw Error('构图方案最多安排 48 件素材');
  if(!Array.isArray(option.texts)||option.texts.length>8)throw Error('构图方案最多安排 8 处短文字');
  if(!Array.isArray(option.writingAreas||[])||(option.writingAreas||[]).length>6)throw Error('构图方案最多标出 6 处书写空间');
  const aliases=new Set(base.source.materials.map(m=>m.alias)),shortAliases=new Map(base.source.materials.map((m,index)=>['m'+(index+1),m.alias])),used=new Set();
  const materials=option.materials.map((m,index)=>{
    known(m,['asset','x','y','rotation','z','crop'],'构图素材');
    const alias=aliases.has(m.asset)?m.asset:shortAliases.get(m.asset);
    if(!alias)throw Error('未知素材别名：'+m.asset);
    if(used.has(alias))throw Error('候选构图中不能重复使用同一素材：'+m.asset);
    used.add(alias);
    const result={asset:alias,x:finite(m.x,0,1,'素材 x'),y:finite(m.y,0,1,'素材 y'),coordinate_unit:'ratio',z:m.z===undefined?10+index:finite(m.z,-1000,1000,'素材 z')};
    if(m.rotation!==undefined)result.rotation=finite(m.rotation,-180,180,'素材旋转');
    if(m.crop!==undefined){
      if(!Array.isArray(m.crop)||m.crop.length!==4)throw Error('素材 crop 须为四个比例值');
      const [x,y,w,h]=m.crop.map(v=>finite(v,0,1,'素材 crop'));
      if(!w||!h||x+w>1+1e-9||y+h>1+1e-9)throw Error('素材 crop 必须位于原图范围内');
      result.crop=[x,y,w,h];
    }
    return result;
  });
  const texts=option.texts.map((t,index)=>{
    known(t,['content','x','y','width','fontSize','color','role'],'构图文字');
    const role=t.role||'body';if(!['title','body','caption','label'].includes(role))throw Error('构图文字 role 无效');
    return {key:'sketch-'+option.id+'-text-'+index,content:short(t.content,160,'构图短文字'),x:finite(t.x,0,1,'文字 x'),y:finite(t.y,0,1,'文字 y'),width:finite(t.width,.02,1,'文字宽度'),coordinate_unit:'ratio',font_size:finite(t.fontSize??(role==='title'?48:role==='caption'?26:34),8,100,'文字字号'),font_style:'serif',color:color(t.color||'#30463d','文字颜色'),role};
  });
  const writingAreas=(option.writingAreas||[]).map(area=>{
    known(area,['x','y','width','height','purpose'],'书写空间');
    const box={x:finite(area.x,0,1,'书写区 x'),y:finite(area.y,0,1,'书写区 y'),width:finite(area.width,.02,1,'书写区宽度'),height:finite(area.height,.02,1,'书写区高度'),purpose:short(area.purpose,40,'书写区用途')};
    if(box.x+box.width>1+1e-9||box.y+box.height>1+1e-9)throw Error('书写空间须位于页面内');
    return box;
  });
  let paper;
  if(option.paper!==undefined){
    known(option.paper,['color','pattern'],'纸张');
    paper={color:color(option.paper.color,'纸色'),pattern:option.paper.pattern};
    if(!['plain','lines','grid','dots','columns'].includes(paper.pattern))throw Error('纸张纹样无效');
  }
  const batches=[];
  for(let index=0;index<Math.max(1,Math.ceil(materials.length/12));index++)batches.push({name:'compose_page',arguments:{materials:materials.slice(index*12,(index+1)*12),...(index===0?{texts,...(paper?{paper}:{})}:{})}});
  const input={tools:batches};
  return {doc:compileWebSceneInput(base,input,assets),writingAreas};
}

export function validateCompositionOptions(value){
  known(value,['options'],'候选构图文件');
  if(!Array.isArray(value.options)||value.options.length<2||value.options.length>3)throw Error('请提供 2–3 个真正不同的候选构图');
  const ids=value.options.map(o=>o?.id);
  if(new Set(ids).size!==ids.length)throw Error('候选构图 id 不可重复');
  return value.options;
}

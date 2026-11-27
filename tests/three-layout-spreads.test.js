import test from 'node:test';
import assert from 'node:assert/strict';
import {listThreeLayoutSpreads,describeThreeLayoutSpread,matchThreeLayoutSpread,compileThreeLayoutSpread} from '../creative-agent/library/three-layout-template-matcher.js';
import {listTemplateDrafts,compileTemplateDraft} from '../creative-agent/library/template-draft.js';
import {sourceMeasurements,measuredBox} from '../creative-agent/library/three-layout-source-measurements.js';

test('三篇首页模板各有独立的双页槽位且进入统一模板入口',()=>{
 const ids=listThreeLayoutSpreads();assert.equal(ids.length,3);
 for(const id of ids){
  assert.ok(listTemplateDrafts().includes(id));
  const template=describeThreeLayoutSpread(id);
  assert.deepEqual(template.leafMm,[125,176]);
  assert.ok(template.slots.some(s=>s.page==='left'&&s.role==='photo'));
  assert.ok(template.slots.some(s=>s.page==='right'&&s.role==='photo'));
  assert.ok(template.slots.every(s=>s.box.every(v=>v>=0&&v<=100)));
  assert.ok(template.slots.every(s=>s.z>0));
  assert.ok(template.slots.every(s=>s.targetMm.every(v=>v>0)));
  const source=sourceMeasurements[id];
  assert.ok(source&&source.image[0]>0&&source.image[1]>0);
  assert.equal(Object.keys(source.boxes).length,template.slots.length,`${id} 每个对象都应先记录原图像素框`);
  assert.ok(template.slots.every(s=>source.boxes[s.id]),`${id} 存在未量测的对象`);
  for(const required of source.required){
   const slot=template.slots.find(s=>s.id===required);
   assert.ok(slot,`${id} 源图对象 ${required} 未入模板`);
   assert.deepEqual(slot.box,measuredBox(id,slot.page,required),`${required} 未使用独立原图量测`);
  }
  for(const page of ['left','right']){
   const leaf=template.slots.filter(s=>s.page===page);
   assert.equal(leaf.filter(s=>s.role==='photo').length,2,`${id} ${page} 应对应结构图中两处图片`);
   assert.ok(leaf.some(s=>s.role==='body'),`${id} ${page} 应有正文区`);
   assert.ok(leaf.some(s=>['sticker','accent'].includes(s.role)),`${id} ${page} 应有贴纸或点缀槽位`);
   for(const body of leaf.filter(s=>s.role==='body'&&!s.style.allowPhotoOverlap))for(const photo of leaf.filter(s=>s.role==='photo')){
    const [ax,ay,bx,by]=body.box,[cx,cy,dx,dy]=photo.box;
    const overlap=Math.max(0,Math.min(bx,dx)-Math.max(ax,cx))*Math.max(0,Math.min(by,dy)-Math.max(ay,cy));
    assert.ok(overlap/((bx-ax)*(by-ay))<.1,`${id} ${body.id} 正文不应被照片主体盖住`);
   }
  }
 }
});

test('四张尺寸适合的真实照片填满四个图片槽位，字素和贴纸仍可编辑',()=>{
 const assets=[
  [48,64],[50,51],[65,44],[60,64]
 ].map(([physicalWidthMM,physicalHeightMM],i)=>({id:`photo-${i}`,alias:`p${i}`,physicalWidthMM,physicalHeightMM,visualRoles:['photo'],title:`照片 ${i}`}));
 const id='XHS-满满当当',plan=matchThreeLayoutSpread(id,assets),compiled=compileThreeLayoutSpread({templateId:id,assets,plan});
 assert.deepEqual(plan.missingPhotos,[]);
 assert.equal(compiled.operations.filter(o=>o.op==='material.add').length,4);
 assert.ok(compiled.operations.filter(o=>o.op==='material.add').every(o=>!('size' in o)));
 assert.equal(compiled.operations.filter(o=>o.op==='layer.mask').length,4);
 assert.ok(plan.assignments.filter(a=>a.asset).every(a=>a.visibleMm&&a.crop));
 assert.ok(compiled.operations.some(o=>o.op==='text.add'&&o.id==='R-middle-word'));
 assert.ok(!compiled.operations.some(o=>o.op==='graphic.add'&&['L-upper-sticker','R-lower-sticker','R-milk-bottle'].includes(o.id)),'不再程序绘制卡通贴纸');
 assert.ok(compiled.report.warnings.some(w=>w.includes('内容与参考图')&&w.includes('不匹配')),'仅尺寸合适不能冒充内容复现通过');
});

test('替换素材保留实体尺寸；不合适时生成纸而不把题字卡误作背景',()=>{
 const assets=[
  {id:'photo1',alias:'p1',physicalWidthMM:48,physicalHeightMM:64,visualRoles:['photo'],title:'咖啡照片'},
  {id:'card1',alias:'c1',physicalWidthMM:55,physicalHeightMM:65,visualRoles:['writing-card'],writableAreaRatio:.9,title:'空白便签'}
 ];
 const id='XHS-满满当当',plan=matchThreeLayoutSpread(id,assets),compiled=compileThreeLayoutSpread({templateId:id,assets,plan});
 assert.ok(compiled.operations.some(o=>o.op==='material.add'&&o.asset==='p1'));
 assert.ok(compiled.operations.some(o=>o.op==='paper.add'&&o.id==='L-upper-note'));
 assert.ok(!compiled.operations.some(o=>o.op==='material.add'&&o.asset==='c1'));
 assert.ok(compiled.operations.filter(o=>o.op==='material.add').every(o=>!('size' in o)));
 assert.ok(compiled.report.warnings.some(w=>w.includes('缺少')));
 assert.deepEqual(compileTemplateDraft({templateId:id,assets}).operations,compiled.operations);
 const explicit=matchThreeLayoutSpread(id,assets,{bindings:{'L-upper-note':'c1'}});
 assert.equal(explicit.assignments.find(a=>a.slot==='L-upper-note').asset,'c1');
});

test('原图量测驱动标题日期尺寸；真实贴纸不能退回程序卡通',()=>{
 const cases=[
  ['XHS-排版第四弹','L-upper-title',20],
  ['XHS-排版第四弹','L-middle-date',16],
  ['XHS-海岛排版','L-upper-title',24],
  ['XHS-海岛排版','R-middle-date',22]
 ];
 for(const [templateId,id,minPt] of cases){
  const output=compileThreeLayoutSpread({templateId});
  const text=output.operations.find(o=>o.id===id);
  assert.equal(text?.op,'text.add');
  assert.ok(text.style.fontSizePt>=minPt,`${id} 字号不应回退`);
  assert.ok(!output.operations.some(o=>o.op==='graphic.add'&&/sticker/.test(o.id)));
 }
 const sticker={id:'real-sticker',alias:'s1',title:'橙红圆形图案贴纸',kind:'sticker',physicalWidthMM:34.5,physicalHeightMM:34.6,visualRoles:['accent']};
 const templateId='XHS-排版第四弹',plan=matchThreeLayoutSpread(templateId,[sticker]);
 const output=compileThreeLayoutSpread({templateId,assets:[sticker],plan});
 assert.ok(output.operations.some(o=>o.op==='material.add'&&o.asset==='s1'));
 assert.ok(!output.operations.some(o=>o.op==='graphic.add'&&/sticker/.test(o.id)));
});

test('海岛排版右上纸只承托左侧正文，不铺到照片、箭头和右侧文字下面',()=>{
 const source=sourceMeasurements['XHS-海岛排版'].boxes;
 const paper=source['R-blue-paper'];
 const photo=source['R-top-photo'];
 const writing=source['R-middle-writing'];
 assert.ok(paper[2]-paper[0]<240,'右上纸宽度应接近原图的半页，而非横跨整片右上区域');
 assert.ok(paper[2]<=photo[0]+2,'纸的右边缘应在上方照片左边缘附近');
 assert.ok(paper[2]<writing[0],'右侧正文应落在页面底色上');
});

test('海岛排版左页点缀、胶带、硫酸纸字幕齐全，右页中间照片压住上下两张纸',()=>{
 const template=describeThreeLayoutSpread('XHS-海岛排版');
 const byId=id=>template.slots.find(slot=>slot.id===id);
 const source=sourceMeasurements['XHS-海岛排版'].boxes;
 const upper=source['L-mid-accent'],lower=source['L-citrus-second'];
 assert.ok(Math.abs((upper[0]+upper[2])-(lower[0]+lower[2]))<=4,'两个圆形的中心应纵向对齐');
 assert.ok(lower[1]-upper[3]>=12,'两个圆形之间应留出清楚的间距');
 for(const circle of [upper,lower]){
  assert.ok(Math.abs((circle[2]-circle[0])-(circle[3]-circle[1]))<=2,'点缀应接近正圆');
  assert.ok(circle[2]-circle[0]>=50&&circle[2]-circle[0]<=60,'点缀直径应贴近原图');
 }
 assert.equal(byId('L-mid-accent').style.kind,'ellipse');
 assert.equal(byId('L-citrus-second').style.kind,'ellipse');
 assert.ok(source['L-lower-tape'][3]>source['L-lower-photo'][1],'左下胶带应探入照片下方');
 assert.ok(byId('L-lower-tape').z<byId('L-lower-photo').z,'照片应压住胶带');
 assert.ok(byId('L-bottom-caption-vellum').style.opacity<1,'字幕底纸应为半透明硫酸纸');
 assert.ok(byId('L-bottom-caption-vellum').z<byId('L-bottom-caption').z,'字幕文字应在底纸上方');
 const middle=source['R-middle-photo'],top=source['R-blue-paper'],bottom=source['R-lower-paper'];
 const overlap=(a,b)=>Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
 assert.ok(overlap(middle,top)>0&&overlap(middle,bottom)>0,'中间照片应同时与上下纸张相交');
 assert.ok(top[3]-middle[1]>=50,'上方蓝纸应深入中间照片下方，而非仅碰到边缘');
 assert.ok(byId('R-middle-photo').z>byId('R-blue-paper').z&&byId('R-middle-photo').z>byId('R-lower-paper').z,'中间照片应盖住上下纸张');
});

test('第四弹右下纸仅承托下半部，不延伸到上方正文',()=>{
 const source=sourceMeasurements['XHS-排版第四弹'].boxes;
 assert.ok(source['R-lower-note'][1]>=500,'格纸上边缘不应早于原图下半部');
 assert.ok(source['R-lower-note'][1]>source['R-lower-photo'][1],'照片应先出现，格纸从照片中下部开始');
});

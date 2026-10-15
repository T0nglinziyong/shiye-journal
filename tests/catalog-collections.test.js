import test from 'node:test';
import assert from 'node:assert/strict';
import {catalogVisibleItems,pageSize,pageSlice,resetCatalogPage,setCatalogDataPage} from '../src/catalog-pagination.js';
import {WORK_TABS,workInTab,snapshotRecord} from '../src/work-collections.js';
import {styleGroups,purposeGroups,selectedDirections} from '../src/matching-directions.js';
import {createNativeProjectPackage,importNativeProjectPackage} from '../src/native-project-package.js';
import {project,itemFromAsset} from '../src/domain.js';
import {applyToolCalls} from '../src/creative.js';
import {buildCreativeMessages,creativeScene} from '../src/creative-runner.js';
import {generatePageImage,imagePrompt} from '../src/ai-image-generation.js';
import {materialMaskCSS,materialMaskPoints} from '../src/material-mask.js';
import {shapeSVG,textLines} from '../src/editor-tools-model.js';
import {parseMaskPoints} from '../src/material-processing-editor.js';
import {parseEditableGeometry} from '../src/editable-geometry.js';

test('page controls clamp input while counts remain independent of the page',()=>{
  assert.equal(pageSize(0),0);assert.equal(pageSize(40),40);assert.equal(pageSize(13),0);
  assert.deepEqual(pageSlice(85,40,3),{current:3,count:3,start:80,end:120});
  assert.deepEqual(pageSlice(85,40,99),{current:3,count:3,start:80,end:120});
  assert.deepEqual(pageSlice(85,0,1),{current:1,count:1,start:0,end:85});
});
test('the configured size limits ordinary and selected catalog results after filtering',()=>{
  const all=Array.from({length:95},(_,index)=>({id:index}));
  for(const key of ['library:selected','series:one:selected','works','series']){
    resetCatalogPage(key);
    const first=catalogVisibleItems(key,all,20);
    assert.equal(first.items.length,20,key);
    assert.equal(first.total,95,key);
    setCatalogDataPage(key,2);
    assert.deepEqual(catalogVisibleItems(key,all.filter(item=>item.id%2===0),20).items.map(item=>item.id),
      all.filter(item=>item.id%2===0).slice(20,40).map(item=>item.id),key);
    resetCatalogPage(key);
    assert.equal(catalogVisibleItems(key,all,40).items.length,40,key);
    assert.equal(catalogVisibleItems(key,all,80).items.length,80,key);
  }
  assert.equal(pageSize(10),0,'the setting keeps its existing 20/40/80 choices');
});
test('snapshot and editable works never share a tab',()=>{
  const picture=snapshotRecord({title:'一页画面',previewBlobId:'preview',width:800,height:1200});
  assert.deepEqual(WORK_TABS.map(([tab])=>workInTab(picture,tab)),[true,false,false,false,false]);
  assert.deepEqual(WORK_TABS.map(([tab])=>workInTab({...picture,isSnapshot:false,isDraft:false},tab)),[false,true,false,false,false]);
  assert.deepEqual(WORK_TABS.map(([tab])=>workInTab({...picture,isSnapshot:false,isDraft:true},tab)),[false,false,true,false,false]);
});
test('style and purpose groups are disjoint and allow no preset',()=>{
  const all=styleGroups.flatMap(group=>group.options);assert.equal(new Set(all).size,all.length);
  const uses=purposeGroups.flatMap(group=>group.options);assert.equal(new Set(uses).size,uses.length);
  assert.deepEqual(selectedDirections(styleGroups,['韩系清新','极简留白','不存在']),['韩系清新','极简留白']);
  assert.deepEqual(selectedDirections(purposeGroups,[]),[]);
});
test('ZIP project retains editable layers and rejects missing local assets',async()=>{
  const asset={id:'owned-asset',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const source=project('可编辑包');source.drafts[0].items.push(itemFromAsset(asset,source.drafts[0],100,100));
  const zipped=createNativeProjectPackage(source),bytes=new Uint8Array(await zipped.arrayBuffer());
  const imported=importNativeProjectPackage(bytes,[asset]);
  assert.notEqual(imported.id,source.id);assert.equal(imported.isDraft,true);
  assert.equal(imported.drafts[0].items[0].assetID,asset.id);
  assert.throws(()=>importNativeProjectPackage(bytes,[]),/不存在的素材/);
});
test('direct JSON and ZIP preserve crop, organic vectors, pen, marker, text and page geometry',async()=>{
  const asset={id:'owned-asset',title:'纸片',kind:'paper',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const source=project('图文层次');
  const page={version:2,style:'自由构图',intent:'纸片与笔迹互相呼应',paper:{color:'#fdf9ed',pattern:'lines'},
    layers:[{type:'material',id:'paper-piece',asset:asset.id,piece:'paper-piece',unit:0,role:'support',operations:[{op:'crop',box:{unit:'ratio',mode:'keep',values:[0,0,.5,1]},angle:0,finish:null}],placement:{x:.25,y:.35,rotation:8,z:10},relation:null},
    {type:'shape',id:'under-text',key:'under-text',kind:'roundedRectangle',x:.62,y:.66,width:.52,height:.19,fill:'#f8e787',stroke:null,z:30,opacity:.5},{type:'shape',id:'leaf',key:'leaf',kind:'vector',x:.72,y:.34,width:.12,height:.10,fill:'#a0bd8e',stroke:'#52734e',vector_paths:[[[0,.5],[.4,0],[1,.5],[.4,1]]],z:40},
    {type:'text',id:'journal-text',content:'在纸片旁写下观察\n让颜色牵起画面',font_style:'hand',x:.62,y:.66,width:.48,height:.16,font_size:24,color:'#30463d',line_spacing:4,z:50},
    {type:'ink',id:'ink-pen',points:[{x:.2,y:.57},{x:.35,y:.56},{x:.47,y:.59}],width:3,color:'#5278a7',pen_style:'brush'},{type:'ink',id:'ink-marker',points:[{x:.43,y:.73},{x:.58,y:.73}],width:14,color:'#ffde55',pen_style:'marker',opacity:.3}]};
  const result=applyToolCalls(page,source.drafts[0],[asset],{},{processing:'自由拆解'});
  assert.deepEqual(result.results.map(entry=>entry.ok),[true]);
  assert.equal(result.draft.items[0].cropRect.width,.5);
  assert.equal(result.draft.primitives[1].vectorPaths.length,1);
  assert.equal(result.draft.textBlocks[0].style,'hand');
  assert.equal(result.draft.strokes[1].penStyle,'marker');
  assert.equal(result.draft.strokes[1].points[0].x,result.draft.canvas.width*.43);
  source.drafts[0]=result.draft;
  const zipped=createNativeProjectPackage(source),imported=importNativeProjectPackage(new Uint8Array(await zipped.arrayBuffer()),[asset]);
  assert.deepEqual(imported.drafts[0].strokes.map(({id,aiManaged,...stroke})=>stroke),result.draft.strokes.map(({id,aiManaged,...stroke})=>stroke));
  assert.equal(imported.drafts[0].strokes[0].aiManaged,undefined,'foreign session ownership must not be inherited');
  assert.notEqual(imported.drafts[0].strokes[0].id,result.draft.strokes[0].id,'imported ink receives a new internal identity');
  assert.deepEqual(imported.drafts[0].primitives[1].vectorPaths,result.draft.primitives[1].vectorPaths);
  assert.equal(imported.drafts[0].primitives[0].opacity,.5);
  assert.equal(imported.drafts[0].textBlocks[0].content,result.draft.textBlocks[0].content);
  const invalid=structuredClone(page);invalid.layers.find(n=>n.type==='ink').points[0].x=1.2;
  assert.throws(()=>applyToolCalls(invalid,source.drafts[0],[asset]),/合同不合法|缺少字段/);
});
test('snapshot prompt leaves composition open while editable prompt advertises layered methods',()=>{
  const base=project('测试').drafts[0],image=buildCreativeMessages({draft:base,assets:[],aliases:{},generationMode:'direct',deliveryMode:'image'});
  assert.match(image[0].content,/不设素材数量、留白、密度/);
  assert.doesNotMatch(image[0].content,/每轮以实际画布/);
  const editable=buildCreativeMessages({draft:base,assets:[],aliases:{},generationMode:'direct',deliveryMode:'json'});
  assert.match(editable[0].content,/layers|ink/);
  assert.match(editable[0].content,/文字围绕图片侧边/);
});
test('GPT image delivery uses actual image edits and only accepts returned PNG bytes',async()=>{
  const asset={id:'a1',title:'小纸片',kind:'paper',physicalWidthMM:20,physicalHeightMM:30,supply:{quantity:1}};
  const p=project('直接成图'),draft=p.drafts[0],png=Uint8Array.from([137,80,78,71,13,10,26,10]);
  const input='data:image/png;base64,'+Buffer.from(png).toString('base64');let endpoint,body;
  const result=await generatePageImage({settings:{keys:{openai:'test-key'},imageModel:'gpt-image-2.5-flare',includeThumbnails:true},project:p,draft,assets:[asset],ids:['a1'],theme:'春天',createImage:async()=>input,request:async(url,options)=>{
    if(url.startsWith('data:'))return fetch(url);
    endpoint=url;body=options.body;
    return new Response(JSON.stringify({data:[{b64_json:Buffer.from(png).toString('base64')}]}),{status:200,headers:{'Content-Type':'application/json'}});
  }});
  assert.equal(endpoint,'https://api.openai.com/v1/images/edits');
  assert.equal(body.get('model'),'gpt-image-2.5-flare');
  assert.equal([...body.getAll('image[]')].length,1);
  assert.equal(result.type,'image/png');assert.deepEqual(new Uint8Array(await result.arrayBuffer()),png);
  assert.match(imagePrompt({project:p,draft,assets:[asset],ids:['a1']}),/不设素材数量、留白比例/);
  await assert.rejects(generatePageImage({settings:{keys:{}},project:p,draft,assets:[asset],ids:['a1']}),/OpenAI API 密钥/);
});
test('editable mask operations preserve irregular, rounded and scalloped cutouts in ZIP',async()=>{
  const asset={id:'a1',title:'纸片',kind:'paper',physicalWidthMM:60,physicalHeightMM:80,supply:{quantity:3}};
  const p=project('裁片');const masks=[
    {op:'mask',shape:'polygon',points:[[0,0],[1,0],[.8,.6],[.3,1],[0,.8]]},
    {op:'mask',shape:'rounded',radius:.18},
    {op:'mask',shape:'scallop',depth:.06,waves:7}
  ];
  const page={version:2,style:'自由构图',intent:null,paper:{color:'#ffffff',pattern:'plain'},layers:[{type:'text',id:'caption',content:'可编辑文字',font_style:'sans',x:.5,y:.8,width:.5,height:.1,font_size:24,color:'#333333'},...masks.map((mask,index)=>({type:'material',id:'piece-'+index,asset:'a1',piece:'piece-'+index,unit:index,role:null,operations:[{op:'whole'},mask],placement:{x:.18+index*.31,y:.4,rotation:0,z:index},relation:null}))]};
  const result=applyToolCalls(page,p.drafts[0],[asset],{},{processing:'自由拆解'});assert.deepEqual(result.results.map(x=>x.ok),[true]);
  assert.deepEqual(result.draft.items.map(x=>x.materialMask.shape),['polygon','rounded','scallop']);
  for(const item of result.draft.items){assert.ok(materialMaskPoints(item.materialMask).length>=3);assert.match(materialMaskCSS(item),/clip-path:polygon/);}
  p.drafts[0]=result.draft;const imported=importNativeProjectPackage(new Uint8Array(await createNativeProjectPackage(p).arrayBuffer()),[asset]);
  assert.deepEqual(imported.drafts[0].items.map(x=>x.materialMask),result.draft.items.map(x=>x.materialMask));
  const invalid=structuredClone(page);invalid.layers.find(n=>n.type==='material').operations[1].points[0]=[-1,0];
  assert.throws(()=>applyToolCalls(invalid,p.drafts[0],[asset]),/合同不合法|边缘无效|未实现或未知字段/);
});
test('editable JSON maps visual controls to native layers and preserves them in ZIP',async()=>{
  const asset={id:'a1',title:'纸',kind:'paper',physicalWidthMM:35,physicalHeightMM:45,supply:{quantity:1}};
  const p=project('表达完整性'),page={version:2,style:'自由构图',intent:'多层表达',paper:{color:'#fffaf2',pattern:'lines',ruling:28,center_gutter:false},
    layers:[{type:'material',id:'paper',asset:'a1',piece:'paper',unit:0,operations:[{op:'whole'},{op:'mask',shape:'rounded',radius:.13}],placement:{x:.25,y:.4,rotation:0,z:1},opacity:.65,flip_horizontal:true},
    {type:'shape',id:'round',key:'round',kind:'roundedRectangle',x:.7,y:.25,width:.25,height:.1,corner_radius:.3,fill:'#ffeeaa',stroke:null},{type:'shape',id:'ornament',key:'ornament',kind:'vector',x:.7,y:.6,width:.2,height:.2,vector_layers:[{fill:'#ff0000',opacity:.5,paths:[[[0,0],[1,0],[.5,1]]]},{fill:'#0000ff',rects:[[.2,.2,.3,.3]]}]},
    {type:'text',id:'memo',content:'第一行\n第二行',font_style:'sans',font_name:'Songti SC',x:.5,y:.8,width:.5,height:.1,font_size:24,color:'#333333',underline:true,strikethrough:true,opacity:.6,fixed_line_height:35,paragraph_spacing:7}]};
  const result=applyToolCalls(page,p.drafts[0],[asset],{},{processing:'自由拆解'});assert.deepEqual(result.results.map(x=>x.ok),[true]);
  const d=result.draft;assert.equal(d.items[0].opacity,.65);assert.equal(d.items[0].isFlippedHorizontally,true);
  assert.equal(d.paperRuling.rowPositions[0],28/d.canvas.height);assert.equal(d.drawCenterGutter,false);
  assert.match(shapeSVG(d.primitives[0]),/rx="0.3"/);assert.equal(d.primitives[1].vectorLayers.length,2);
  assert.equal(d.textBlocks[0].fontName,'Songti SC');assert.equal(d.textBlocks[0].fixedLineHeight,35);assert.equal(d.textBlocks[0].paragraphSpacing,7);
  const scene=creativeScene(d,{a1:'a1'});assert.equal(scene.layers.find(n=>n.type==='material').materialMask.shape,'rounded');assert.equal(scene.layers.find(n=>n.type==='text').fontName,'Songti SC');assert.equal(scene.layers.find(n=>n.type==='shape').kind,'roundedRectangle');
  assert.equal(textLines(d.textBlocks[0],text=>text.length*10).lines.length,2);
  p.drafts[0]=d;const roundtrip=importNativeProjectPackage(new Uint8Array(await createNativeProjectPackage(p).arrayBuffer()),[asset]);
  assert.deepEqual(roundtrip.drafts[0].items[0].materialMask,d.items[0].materialMask);
  assert.deepEqual(roundtrip.drafts[0].primitives[1].vectorLayers,d.primitives[1].vectorLayers);
  assert.equal(roundtrip.drafts[0].textBlocks[0].underline,true);
});
test('manual geometry editors accept the same paths and masks as AI, rejecting unsafe coordinates',()=>{
  assert.deepEqual(parseMaskPoints('0, 0\n1, 0\n.7, 1\n0, 1'),[[0,0],[1,0],[.7,1],[0,1]]);
  assert.deepEqual(parseEditableGeometry('[[[0,0],[1,0],[0.5,1]]]','paths'),[[[0,0],[1,0],[.5,1]]]);
  const layers=[{fill:'#ffcc00',opacity:.8,paths:[[[0,0],[1,0],[.5,1]]],rects:[[.1,.1,.2,.2]]}];
  assert.deepEqual(parseEditableGeometry(JSON.stringify(layers),'layers'),layers);
  assert.match(shapeSVG({id:'test',kind:'vector',width:100,height:100,vectorLayers:layers}),/M0.1 0.1h0.2v0.2h-0.2Z M0 0 L1 0 L0.5 1 Z/);
  assert.throws(()=>parseMaskPoints('-1, 0; 1, 0; 1, 1'),/无效/);
  assert.throws(()=>parseEditableGeometry('[[[0,0],[2,0]]]','paths'),/0–1/);
  assert.throws(()=>parseEditableGeometry(JSON.stringify([{fill:'#ffcc00',paths:[[[0,0],[2,0]]],rects:[[.1,.1,.2,.2]]}]),'layers'),/0–1/);
});

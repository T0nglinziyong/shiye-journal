import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas} from 'canvas';
import {materialKinds,materialRoles,materialTextures,materialKindGroups,materialRoleGroups,materialTextureGroups,hasKnownMaterialTexture,materialClassificationGuide} from '../src/material-taxonomy.js';
import {classificationResult,classifyRecord} from '../src/classification.js';
import {assetEditorValue} from '../src/asset-editor.js';
import {recommend} from '../src/domain.js';
import {matchingViewModel} from '../src/matching-view.js';
import {seriesCoverLayout,containCoverImage,drawSeriesCover,resolvedSeriesCoverLayout} from '../src/series-cover-layout.js';
import {seriesCovers} from '../src/library-model.js';
import {seriesCoverSignature} from '../src/series-cover-snapshot.js';

test('taxonomy dimensions have grouped, finite, unique choices and retain kind/role identities',()=>{
 assert.equal(materialKinds.length,19);assert.equal(materialRoles.length,12);
 for(const groups of [materialKindGroups,materialRoleGroups,materialTextureGroups]){
  const keys=groups.flatMap(group=>group.options.map(([key])=>key));assert.equal(new Set(keys).size,keys.length);assert.ok(groups.every(group=>group.options.length));
 }
 assert.ok(materialTextures.includes('相纸'));for(const retired of ['照片','印刷纸','待记录'])assert.equal(materialTextures.includes(retired),false);
 assert.equal(hasKnownMaterialTexture('未确定'),false);assert.equal(hasKnownMaterialTexture('其他'),false);assert.equal(hasKnownMaterialTexture('和纸'),true);
});
test('model classification cannot create source/finish labels as a physical substance',()=>{
 for(const texture of ['照片','印刷纸','待记录','invented'])assert.throws(()=>classificationResult({title:'x',kind:'photo',role:'focal',texture,tags:[]},'asset'),/预设范围/);
 assert.equal(classificationResult({title:'照片',kind:'photo',role:'focal',texture:'相纸',tags:[]},'asset').texture,'相纸');
 assert.match(materialClassificationGuide,/不能仅凭/);assert.match(materialClassificationGuide,/主要/);
});
test('AI prompt explains overlapping kinds, primary roles and uncertain material evidence',async()=>{
 let prompt='';await classifyRecord({kind:'asset',record:{},assets:[],image:'data:image/png;base64,AA==',settings:{key:'test-key',model:'gpt-4.1',provider:'openai',endpoint:'https://api.openai.com/v1/chat/completions'},request:async(_url,init)=>{
  const content=JSON.parse(init.body).messages[0].content;prompt=typeof content==='string'?content:content[0].text;
  return new Response(JSON.stringify({choices:[{message:{content:JSON.stringify({title:'x',kind:'paper',role:'writing',texture:'未确定',tags:[]})}}]}));
 }});assert.match(prompt,/照片属于类型，相纸才是材质/);assert.match(prompt,/白边本身不是背胶证据/);
});
const values=texture=>({title:'material',kind:'photo',role:'focal',texture,width:'30',height:'40',tags:'',contentTags:'',styleTags:'',materialTags:'',seriesID:'',reviewStatus:'ready',usageStatus:'unused'});
test('editing keeps an existing descriptive texture verbatim until the user explicitly changes it',()=>{
 const old={id:'a',title:'material',kind:'photo',role:'focal',texture:'照片',physicalWidthMM:30,physicalHeightMM:40,tags:[],contentTags:[],styleTags:[],materialTags:[],seriesID:null,reviewStatus:'ready',usageStatus:'unused',updatedAt:'old'};
 assert.equal(assetEditorValue(old,values('照片')),old,'unchanged edit must not migrate or sync data');
 assert.equal(assetEditorValue(old,{...values('照片'),title:'renamed'}).texture,'照片');
 assert.equal(assetEditorValue(old,values('相纸')).texture,'相纸');
 assert.throws(()=>assetEditorValue({...old,texture:'相纸'},values('照片')),/预设范围/);
 assert.equal(old.texture,'照片');
});
test('recommendation reasons distinguish type differences from actual material differences',()=>{
 const core={id:'core',kind:'photo',texture:'相纸',role:'focal'};
 const candidate={id:'other',title:'other',kind:'paper',texture:'相纸',role:'background',reviewStatus:'ready'};
 const same=recommend(core,[candidate])[0].reasons;assert.ok(same.includes('不同素材类型'));assert.equal(same.includes('不同材质层次'),false);
 assert.ok(recommend(core,[{...candidate,texture:'和纸'}])[0].reasons.includes('不同材质层次'));
 assert.equal(recommend({...core,texture:'未确定'},[{...candidate,texture:'待记录'}])[0].reasons.includes('不同材质层次'),false);
});
test('unknown or pending materials never match the material filter merely because both are unknown',()=>{
 const state={assets:[{id:'a',title:'a',texture:'未确定',kind:'paper',reviewStatus:'ready'},{id:'b',title:'b',texture:'未确定',kind:'paper',reviewStatus:'ready'}],basket:['a'],matchStyles:[],matchPurposes:[],excludedAssetIDs:[],coreIDs:[],aiSettings:{},recommendFilter:'材质'};
 assert.deepEqual(matchingViewModel(state).filtered,[]);
 state.assets.forEach(a=>a.texture='和纸');assert.equal(matchingViewModel(state).filtered[0].asset.id,'b');
});
test('cover membership is deduplicated, ignores hidden references, preserves order and has four automatic choices',()=>{
 const assets=Array.from({length:7},(_,i)=>({id:String(i),seriesID:'s',isProjectInternal:i===1}));const original=JSON.stringify(assets);
 assert.deepEqual(seriesCovers({id:'s'},assets).map(a=>a.id),['0','2','3','4']);
 assert.deepEqual(seriesCovers({id:'s',coverAssetIDs:['gone','1','4','4','2']},assets).map(a=>a.id),['4','2']);
 assert.equal(JSON.stringify(assets),original);
});
test('automatic layouts adapt to empty/single/pair/fan/grid, with explicit modes taking priority',()=>{
 assert.deepEqual(Array.from({length:6},(_,i)=>seriesCoverLayout(i).kind),['empty','single','pair','fan','grid','grid']);
 assert.equal(seriesCoverLayout(3,'grid').kind,'grid');assert.equal(seriesCoverLayout(4,'fan').kind,'fan');assert.equal(resolvedSeriesCoverLayout('unknown'),'auto');
 assert.throws(()=>seriesCoverLayout(6),/0–5/);assert.throws(()=>seriesCoverLayout(-1));
});
test('every rotated slot remains inside the cover, with no implicit asset scaling/cropping metadata',()=>{
 for(const mode of ['auto','fan','grid'])for(let n=1;n<=5;n++){
  const layout=seriesCoverLayout(n,mode);assert.equal(new Set(layout.slots.map(s=>s.index)).size,n);
  for(const s of layout.slots){const a=s.angle*Math.PI/180,c=Math.cos(a),t=Math.sin(a);for(const dx of [-s.w/2,s.w/2])for(const dy of [-s.h/2,s.h/2]){
   const x=s.x+s.w/2+dx*c-dy*t,y=s.y+s.h/2+dx*t+dy*c;assert.ok(x>=0&&x<=480&&y>=0&&y<=400,JSON.stringify({mode,n,s,x,y}));
  }}
 }
});
test('contain geometry preserves full tall, wide and square images for every slot',()=>{
 for(const count of [1,2,3,4,5])for(const slot of seriesCoverLayout(count).slots)for(const [w,h] of [[60,2400],[2400,60],[400,400]]){
  const b=containCoverImage(w,h,slot);assert.ok(Math.abs(b.w/b.h-w/h)<1e-9);assert.ok(b.x>=slot.x-1e-9&&b.y>=slot.y-1e-9&&b.x+b.w<=slot.x+slot.w+1e-9&&b.y+b.h<=slot.y+slot.h+1e-9);
 }
 assert.equal(containCoverImage(0,30,{w:10,h:20}),null);
});
test('actual canvas grid retains marker colors at all four image corners',()=>{
 const image=createCanvas(100,100),src=image.getContext('2d');src.fillStyle='#008000';src.fillRect(0,0,100,100);src.fillStyle='#ff0000';src.fillRect(0,0,20,20);src.fillStyle='#0000ff';src.fillRect(80,80,20,20);
 const canvas=createCanvas(480,400),ctx=canvas.getContext('2d'),layout=drawSeriesCover(ctx,[image,image,image,image],'grid');
 for(const slot of layout.slots){const b=containCoverImage(100,100,slot),red=ctx.getImageData(b.x+b.w*.1,b.y+b.h*.1,1,1).data,blue=ctx.getImageData(b.x+b.w*.9,b.y+b.h*.9,1,1).data;assert.ok(red[0]>230&&red[2]<30);assert.ok(blue[2]>230&&blue[0]<30);}
});
test('cover cache identity includes layout, static source, current tape crop and source geometry, but not title',()=>{
 const series={id:'s',title:'old'},asset={id:'a',seriesID:'s',kind:'tape',staticPath:'/a.png',physicalWidthMM:100,physicalHeightMM:10,tapeAxis:'x'},baseline=seriesCoverSignature(series,[asset]);
 assert.equal(seriesCoverSignature({...series,title:'new'},[asset]),baseline);
 for(const edit of [{staticPath:'/b.png'},{tapeAxis:'y'},{tapeFlatCrop:{left:0,top:.1,right:1,bottom:.9}},{physicalWidthMM:110},{kind:'paper'}])assert.notEqual(seriesCoverSignature(series,[{...asset,...edit}]),baseline);
 assert.notEqual(seriesCoverSignature({...series,coverLayout:'grid'},[asset]),baseline);
});

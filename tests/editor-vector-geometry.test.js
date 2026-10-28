import test from 'node:test';
import assert from 'node:assert/strict';
import {createCanvas,loadImage} from 'canvas';
import {editableSVGCommands,vectorEditorState,vectorContours,moveVectorHandle,changeVectorPointCount,applyInspectorVectorGeometry} from '../src/editor-vector-geometry.js';
import {shapeSVG} from '../src/editor-tools-model.js';
import {renderSceneCanvas} from '../src/scene-renderer.js';
import {beginSceneEditSession,acceptSceneEditStep,stepSceneEditSession} from '../src/scene-edit-session.js';
const node=extra=>({id:'s',type:'shape',kind:'vector',x:220,y:230,width:160,height:100,rotation:12,fill:'#d6bd8b',stroke:'#456655',lineWidth:2,...extra});
const page=s=>({id:'p',sceneVersion:2,canvas:{width:600,height:800},physicalPageHeightMM:200,paperColor:'#ffffff',paperPattern:'plain',layers:[{id:'g',type:'group',localTransform:[1,0,0,1,20,30],layoutBox:{x:0,y:0,width:500,height:700},children:[s]}]});
const svgImage=async(svg,frame)=>loadImage(Buffer.from(svg.replace('<svg ',`<svg width="${frame.width}" height="${frame.height}" `)));
const png=async p=>(await renderSceneCanvas(p,{createCanvas:()=>createCanvas(1,1),loadShapeImage:(url,f)=>svgImage(decodeURIComponent(url.split(',').slice(1).join(',')),f),waitForFonts:false})).canvas.toBuffer('image/png');
const paths=()=>[[[.1,.1],[.9,.1],[.8,.9],[.2,.9]],[[.4,.4],[.6,.4],[.6,.6],[.4,.6]]];
test('visual polygon editing preserves holes, styles, nested pose and isolated undo/redo',async()=>{
 const s=node({vectorPaths:paths()}),saved=page(s),original=await png(saved),session=beginSceneEditSession(saved,{projectID:'work',saveRevision:1});
 let draft=vectorEditorState(s);draft=moveVectorHandle(draft,0,1,[.95,.3]);draft=changeVectorPointCount(draft,0,1);draft=changeVectorPointCount(draft,0,2,true);
 applyInspectorVectorGeometry(session.working,'s',draft);acceptSceneEditStep(session,session.working,'s');
 assert.deepEqual(saved.layers[0].children[0],s);assert.deepEqual(draft.value[1],paths()[1]);
 const edited=await png(session.working);assert.notDeepEqual(edited,original);
 stepSceneEditSession(session,'undo');assert.deepEqual(await png(session.working),original);
 stepSceneEditSession(session,'redo');assert.deepEqual(await png(session.working),edited);
 assert.deepEqual(await png(JSON.parse(JSON.stringify(session.working))),edited);
 const actual=session.working.layers[0].children[0];for(const key of ['x','y','width','height','rotation','fill','stroke'])assert.equal(actual[key],s[key]);
});
test('SVG normalization retains cubic, quadratic, arc and relative/smooth path pixels',async()=>{
 const d='m10 20 h15 v10 c5 -10 10 -10 15 0 s10 10 15 0 q5 -5 10 0 t10 0 a8 12 25 01 15 20 z m0 40 l20 0',s=node({svgViewBox:[0,0,100,100],svgPaths:[{d,fillRule:'evenodd',opacity:.7}]});
 const commands=editableSVGCommands(d);assert.ok(commands.some(c=>c[0]==='A'));assert.ok(commands.some(c=>c[0]==='C'));assert.ok(commands.some(c=>c[0]==='Q'));
 const normalized=node({...s,svgPaths:[{...s.svgPaths[0],d:commands.map(c=>c.join(' ')).join(' ')}]});
 assert.deepEqual(await png(page(s)),await png(page(normalized)));
 for(const invalid of ['M0','M0 0 C2 3','L0 0','M0 0 A-1 2 0 0 1 2 3','M0 0 L1e999 0','M0 0 A1 2 0 2 1 2 3','M0 0 X1 2'])assert.throws(()=>editableSVGCommands(invalid));
});
test('curve handles change only selected path geometry and keep current colors',async()=>{
 const s=node({svgViewBox:[-10,-10,120,120],svgPaths:[{d:'M0 50 C20 0 80 100 100 50',fill:null,stroke:'#884422'},{d:'M10 80 L90 80',stroke:'#224488'}]}),p=page(s),original=await png(p);
 let state=vectorEditorState(s);const handles=vectorContours(state)[0].handles,index=handles.findIndex(h=>h.role==='control');state=moveVectorHandle(state,0,index,[30,-5]);
 s.svgPaths[0].stroke='#773311';applyInspectorVectorGeometry(p,'s',state);
 assert.equal(s.svgPaths[0].stroke,'#773311');assert.equal(s.svgPaths[1].d,'M10 80 L90 80');assert.match(s.svgPaths[0].d,/C 30 -5/);
 assert.notDeepEqual(await png(p),original);assert.deepEqual(await png(p),await png(JSON.parse(JSON.stringify(p))));
});
test('multicolor rectangles and hole paths edit in their real coordinate frame',()=>{
 const s=node({vectorSize:[100,100],vectorLayers:[{fill:'#ccaa88',opacity:.6,rects:[[0,0,100,100]],paths:[[[20,20],[80,20],[80,80],[20,80]]]},{fill:'#336655',paths:[[[40,40],[60,40],[50,60]]]}]}),p=page(s);
 let state=vectorEditorState(s);assert.deepEqual(state.frame,[0,0,100,100]);
 state=moveVectorHandle(state,1,0,[10,10]);assert.deepEqual(state.value[0].rects[0],[10,10,90,90]);
 const crossed=moveVectorHandle(state,1,0,[120,120]);assert.ok(crossed.value[0].rects[0][2]>0);assert.equal(crossed.value[0].rects[0][0]+crossed.value[0].rects[0][2],100);
 state=moveVectorHandle(state,0,0,[25,25]);s.vectorLayers[0].fill='#ffeeaa';applyInspectorVectorGeometry(p,'s',state);
 assert.equal(s.vectorLayers[0].fill,'#ffeeaa');assert.equal(s.vectorLayers[0].opacity,.6);assert.equal(s.vectorLayers[1].paths[0][0][0],40);
 assert.match(shapeSVG(s),/fill-rule="evenodd"/);
});
test('invalid edits and locks leave canonical Scene unchanged',()=>{
 const s=node({vectorPaths:paths()}),p=page(s),state=vectorEditorState(s),before=structuredClone(p);
 assert.throws(()=>moveVectorHandle(state,0,0,[NaN,0]));const bad=structuredClone(state);bad.value[0]=[[1,2]];
 assert.throws(()=>applyInspectorVectorGeometry(p,'s',bad));assert.deepEqual(p,before);
 s.locked=true;const locked=structuredClone(p);assert.throws(()=>applyInspectorVectorGeometry(p,'s',moveVectorHandle(state,0,0,[.2,.2])),/锁定/);assert.deepEqual(p,locked);
});
test('path colors can inherit, override or disable without erasing staged geometry',async()=>{
 const {applyInspectorVectorStyle}=await import('../src/editor-vector-geometry.js');
 const s=node({svgViewBox:[0,0,100,100],svgPaths:[{d:'M10 10 L90 10 L50 90 Z',fill:'#994422',stroke:null},{d:'M0 0 L20 20',stroke:'#224466'}]}),p=page(s),before=await png(p);
 const state=moveVectorHandle(vectorEditorState(s),0,0,[20,10]);
 applyInspectorVectorStyle(p,'s',{index:0,field:'fill',value:'inherit'});assert.equal(Object.hasOwn(s.svgPaths[0],'fill'),false);
 applyInspectorVectorStyle(p,'s',{index:0,field:'stroke',value:'#224455'});
 applyInspectorVectorStyle(p,'s',{index:0,field:'opacity',value:.7});
 applyInspectorVectorGeometry(p,'s',state);assert.equal(s.svgPaths[0].stroke,'#224455');assert.equal(s.svgPaths[0].opacity,.7);assert.equal(Object.hasOwn(s.svgPaths[0],'fill'),false);
 assert.notDeepEqual(await png(p),before);assert.deepEqual(await png(p),await png(JSON.parse(JSON.stringify(p))));
 const unchanged=structuredClone(p);for(const request of [{index:2,field:'fill',value:null},{index:0,field:'fill',value:'red'},{index:0,field:'opacity',value:NaN}]){assert.throws(()=>applyInspectorVectorStyle(p,'s',request));assert.deepEqual(p,unchanged);}
});
test('edited vectors remain valid for the actual native import contract',async()=>{
 const {project}=await import('../src/domain.js');const {createNativeProjectDocument,importNativeProjectDocument}=await import('../src/native-project-package.js');
 const p=project('轮廓'),d=p.drafts[0],s=node({vectorPaths:paths()});d.layers=[s];
 applyInspectorVectorGeometry(d,'s',moveVectorHandle(vectorEditorState(s),0,0,[-.1,.2]));
 assert.doesNotThrow(()=>importNativeProjectDocument(createNativeProjectDocument(p),[]));
 const state=vectorEditorState(s);state.value[0]=Array.from({length:513},()=>[.1,.2]);
 const before=structuredClone(d);assert.throws(()=>applyInspectorVectorGeometry(d,'s',state));assert.deepEqual(d,before);
});

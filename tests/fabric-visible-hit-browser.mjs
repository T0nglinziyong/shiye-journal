import assert from 'node:assert/strict';
import {browserHarness} from './browser-harness.mjs';
const b=await browserHarness('shiye-visible-hit',(process.env.SHIYE_TEST_URL||'http://127.0.0.1:5173')+'/tests/fixtures/fabric-preview.html');
try{
 await b.wait('.upper-canvas');
 const result=await b.evaluate(`(async()=>{
  const {fabric:f}=await import('/tests/fixtures/fabric-preview.jsx');
  const {selectableFabricObjectAt:hit,installSelectionFramePriority}=await import('/src/fabric-hit-test.js');
  const el=document.createElement('canvas');document.body.append(el);
  const c=new f.Canvas(el,{width:400,height:400,enableRetinaScaling:false,perPixelTargetFind:true});
  const p=(x,y)=>new f.Point(x,y),results={};
  const check=(name,object,visible,blank)=>{
    object.sceneType=name;c.add(object);object.setCoords();c.renderAll();
    const bounds=c.upperCanvasEl.getBoundingClientRect();
    const nativeAt=([x,y])=>c.findTarget(new PointerEvent('pointerdown',{
      clientX:bounds.left+x,clientY:bounds.top+y,pointerType:'mouse'}))?.target;
    results[name]=[hit(c,object,p(...visible),p(...visible)),hit(c,object,p(...blank),p(...blank)),
      nativeAt(visible)===object,!nativeAt(blank)];
    c.remove(object);
  };
  check('shape',new f.Rect({originX:'left',originY:'top',left:50,top:50,width:100,height:100,fill:'transparent',stroke:'#000',strokeWidth:8}),[52,80],[100,100]);
  const image=document.createElement('canvas');image.width=100;image.height=100;image.getContext('2d').fillRect(40,40,20,20);
  check('material',new f.FabricImage(image,{originX:'left',originY:'top',left:50,top:50}),[100,100],[60,60]);
  const text=new f.Textbox('I',{originX:'left',originY:'top',left:50,top:50,width:180,fontSize:60,fill:'#000'});
  c.add(text);text.setCoords();c.renderAll();
  let ink=null;
  for(let y=50;y<120&&!ink;y++)for(let x=50;x<110&&!ink;x++)if(!c.isTargetTransparent(text,x,y))ink=[x,y];
  c.remove(text);check('text',text,ink,[210,75]);
  const a=new f.Rect({originX:'left',originY:'top',left:50,top:50,width:30,height:30,fill:'#000'}),z=new f.Rect({originX:'left',originY:'top',left:180,top:180,width:30,height:30,fill:'#000'});
  check('group',new f.Group([a,z]),[60,60],[120,120]);
  const selected=new f.Rect({originX:'left',originY:'top',left:50,top:50,width:150,height:150,fill:'transparent',stroke:'#000'});
  const other=new f.Rect({originX:'left',originY:'top',left:70,top:70,width:40,height:40,fill:'#000'});
  c.add(selected,other);c.setActiveObject(selected);selected.setCoords();other.setCoords();c.renderAll();
  installSelectionFramePriority(c);
  const bounds=c.upperCanvasEl.getBoundingClientRect();
  const found=c.findTarget(new PointerEvent('pointerdown',{clientX:bounds.left+90,clientY:bounds.top+90,pointerType:'mouse'}));
  if(found.target!==selected)throw Error('Selected full frame did not own overlapping object hit');
  c.dispose();return results;
 })()`);
 for(const [kind,values] of Object.entries(result))assert.deepEqual(values,[true,false,true,true],
   kind+' must ignore blank pixels on pointerdown, before any selection frame appears');
 assert.deepEqual(b.errors,[]);console.log('Visible-pixel hit tests passed for hollow shape, transparent material, text and group');
}finally{await b.close();}

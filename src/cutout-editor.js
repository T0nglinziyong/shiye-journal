import {createElement} from 'react';
import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {CutoutPanel} from './react-cutout-panel.jsx';
import {paintMask,maskOrientation,refineMaskStroke} from './mask-model.js';
import {decodeImageBlob} from './image-blob-decoder.js';
import {readAlphaMask,encodeAlphaMask} from './alpha-mask-blob.js';
import {shrinkEditorBitmap,resampleMask,scaleFramePlacement,CUTOUT_EDIT_EDGE} from './cutout-edit-resolution.js';
import {containBox} from './preview-geometry.js';
import {onDialogClosed} from './dialog-lifecycle.js';

const wrap=a=>((a+180)%360+360)%360-180;
const png=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('图像处理失败')),'image/png'));
const copyMask=value=>new Uint8ClampedArray(value);

export async function showCutoutEditor({
  body,modal,original,saved,recognition=saved,candidateFrame=original,title,processing={},
  finalMaskBlob=null,onLoadInitialMask=null,isCancelled=()=>false,onPhase=()=>{},
  editPixels=CUTOUT_EDIT_EDGE,
  onApply,onRerecognize,onPostprocess,recognitionUI={},toast
}) {
  // New records read only the canonical corrected candidate RGB + final
  // alpha mask. The initial mask is a separate lazy recovery operation.
  // Existing four-image assets continue down the original legacy path.
  onPhase('正在解码候选框及透明蒙版…');
  let source,initial,recognized,frame,loadedFinalMask=null;
  if(finalMaskBlob){
    const [candidate,fullMask]=await Promise.all([
      decodeImageBlob(candidateFrame),readAlphaMask(finalMaskBlob)
    ]);
    frame=shrinkEditorBitmap(candidate,editPixels);
    const original=processing.candidateFramePlacement,
      originalW=original?.frameWidth||fullMask.width,
      originalH=original?.frameHeight||fullMask.height,
      placement=scaleFramePlacement(original,originalW,originalH,frame.width,frame.height);
    if(placement.x<-.5||placement.y<-.5||
       placement.x+placement.width>frame.width+1||
       placement.y+placement.height>frame.height+1)
      throw Error('矫正候选框与原始图片坐标不一致');
    const targetW=Math.max(1,Math.round(placement.width)),
      targetH=Math.max(1,Math.round(placement.height)),
      record=resampleMask(fullMask,targetW,targetH);
    source=document.createElement('canvas');source.width=record.width;source.height=record.height;
    source.getContext('2d').drawImage(frame,
      placement.x,placement.y,placement.width,placement.height,0,0,record.width,record.height);
    const canvas=document.createElement('canvas');canvas.width=record.width;canvas.height=record.height;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    ctx.drawImage(source,0,0);
    const rgba=ctx.getImageData(0,0,record.width,record.height);
    for(let i=0;i<record.alpha.length;i++)rgba.data[i*4+3]=record.alpha[i];
    ctx.putImageData(rgba,0,0);
    initial=recognized=canvas;
    loadedFinalMask=record.alpha;
  }else{
    const decoded=await Promise.allSettled([
      decodeImageBlob(original),decodeImageBlob(saved),decodeImageBlob(recognition),
      decodeImageBlob(candidateFrame||original)
    ]);
    const failed=decoded.find(row=>row.status==='rejected');
    if(failed){
      for(const row of decoded)if(row.status==='fulfilled')row.value?.close?.();
      throw Error('检查抠图暂无法打开：'+(failed.reason?.message||'图片未能解码')+
        '。当前素材不会被自动覆盖；请检查同步状态。');
    }
    [source,initial,recognized,frame]=decoded.map(row=>shrinkEditorBitmap(row.value,editPixels));
  }
  if(isCancelled()){
    for(const bitmap of new Set([source,initial,recognized,frame]))bitmap?.close?.();
    return;
  }
  onPhase('正在初始化原图像素与画笔…');
  const w=source.width,h=source.height,canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,0,0);
  const sourcePixels=ctx.getImageData(0,0,w,h),
    sourceAlpha=Uint8ClampedArray.from({length:w*h},(_,i)=>sourcePixels.data[i*4+3]),
    rawPlacement=processing.candidateFramePlacement,
    placement=rawPlacement
      ?scaleFramePlacement(rawPlacement,rawPlacement.frameWidth,rawPlacement.frameHeight,frame.width,frame.height)
      :{x:0,y:0,width:frame.width,height:frame.height};

  const alphaFrom=(bitmap,angle=0)=>{
    ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.rotate(-angle*Math.PI/180);
    ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);ctx.restore();
    const pixels=ctx.getImageData(0,0,w,h).data;
    return Uint8ClampedArray.from({length:w*h},(_,i)=>pixels[i*4+3]);
  };

  const initialRotation=processing.displayRotationDegrees||0,
    initialMask=loadedFinalMask||alphaFrom(initial,initialRotation),
    recognitionMask=loadedFinalMask||alphaFrom(recognized,processing.recognitionRotationDegrees||0),
    steps=[['rough','修补轮廓'],['recognition','边缘优化'],['final','调整外观']],
    methodList=recognitionUI.methods||[],
    pixelList=recognitionUI.pixels||[[900,'900 px'],[1200,'1200 px'],[1600,'1600 px']],
    savedRecognition=processing.rerecognition||{},
    savedPost=processing.autoPostprocess||savedRecognition.postprocess||{},
    defaultPre={illumination:false,denoise:false,localContrast:false,chromaEdges:true,...recognitionUI.preprocess,...savedRecognition.preprocess},
    defaultPost={shapeRegularization:true,apertures:true,...recognitionUI.postprocess,...savedPost};

  // Masks are immutable: paintMask/refineMaskStroke allocate new arrays.
  // Stage baselines can initially share their Uint8 storage. Six eager 4K
  // alpha copies used ~100MB before the editor even painted on iPhone.
  let mask=initialMask,
    roughStageMask=initialMask,
    recognitionBaseMask=recognitionMask,
    recognitionStageMask=recognitionMask,
    postprocessBaseMask=initialMask,
    finalStageMask=initialMask,
    mode='rough',restore=true,ratio=.04,
    appearance=processing.appearance||'original',intensity=processing.intensity??.5,
    rotation=initialRotation,autoStraighten=processing.autoStraighten!==false,outputPrepared=false,
    comparison=null,stroke=null,lastStroke=null,busy=false,manualTouched=false,
    recognitionState={
      method:savedRecognition.method||recognitionUI.method||methodList[0]?.id||'auto',
      pixels:Math.max(900,Number(savedRecognition.pixels||recognitionUI.pixelsValue||editPixels)),
      preprocess:{...defaultPre}
    },
    postState={...defaultPost},
    lastRecognition=savedRecognition.method?{method:savedRecognition.method,pixels:Math.max(900,Number(savedRecognition.pixels||editPixels)),preprocess:{...defaultPre}}:null,
    lastPostprocess=processing.autoPostprocess?{...processing.autoPostprocess}:null;

  const history=[],initialAppearance=appearance,initialIntensity=intensity,initialAutoStraighten=autoStraighten;

  // A cancelled or displaced asynchronous loader must not repaint the dialog.
  if(isCancelled()||!modal.open)return;
  if(!modal.matches(':modal'))throw Error('检查抠图弹窗不在模态顶层，请重新打开');
  onPhase('正在显示抠图工具…');
  // React owns the tool panel; the native dialog stays open while the
  // canvas engine renders into its stable canvas node.
  modal.classList.remove('cutout-loading-dialog');
  modal.classList.add('cutout-dialog','material-editor-dialog');
  body.replaceChildren();
  const cutoutRoot=createRoot(body);
  let preview=null,note='';
  flushSync(()=>cutoutRoot.render(createElement(CutoutPanel,{
    state:{mode:'rough',restore,ratio,history:false,lastStroke:false,busy:false,
      recognition:recognitionState,post:postState,methods:methodList,pixels:pixelList,
      methodDescription:'',canRerecognize:!!onRerecognize,canPostprocess:!!onPostprocess,
      autoStraighten,rotation,appearance,intensity,note:''},
    actions:{},canvasRef:node=>{preview=node;}
  })));
  if(!preview)throw Error('抠图画布未能挂载');
  const pctx=preview.getContext('2d');

  const push=()=>{
    history.push(copyMask(mask));
    while(history.length>1&&(history.length>12||history.length*mask.length>32*1024*1024))history.shift();
  };

  function composed(maskValue=mask,style=appearance,amount=intensity,angle=rotation){
    const c=document.createElement('canvas');c.width=w;c.height=h;
    const cx=c.getContext('2d'),imageFrame=new ImageData(new Uint8ClampedArray(sourcePixels.data),w,h);
    for(let i=0;i<maskValue.length;i++){
      const p=i*4;imageFrame.data[p+3]=Math.min(imageFrame.data[p+3],maskValue[i]);
      if(style!=='original'){
        const luminance=.2126*imageFrame.data[p]+.7152*imageFrame.data[p+1]+.0722*imageFrame.data[p+2];
        for(let k=0;k<3;k++){
          let value=imageFrame.data[p+k];
          if(style==='natural')value+=amount*14*(1-luminance/255);
          else value=(value-luminance)*(1+.3*amount)+luminance+(luminance-128)*.18*amount;
          imageFrame.data[p+k]=Math.max(0,Math.min(255,value));
        }
      }
    }
    cx.putImageData(imageFrame,0,0);
    if(!angle)return c;
    const rotated=document.createElement('canvas'),rad=angle*Math.PI/180;
    rotated.width=Math.max(1,Math.ceil(Math.abs(w*Math.cos(rad))+Math.abs(h*Math.sin(rad))));
    rotated.height=Math.max(1,Math.ceil(Math.abs(h*Math.cos(rad))+Math.abs(w*Math.sin(rad))));
    const rc=rotated.getContext('2d');rc.translate(rotated.width/2,rotated.height/2);rc.rotate(rad);rc.drawImage(c,-w/2,-h/2);
    return rotated;
  }

  const fit=()=>{
    const host=preview.parentElement,r=host.getBoundingClientRect(),box=containBox(preview.width,preview.height,r.width,r.height);
    Object.assign(preview.style,{width:box.width+'px',height:box.height+'px',left:box.left+'px',top:box.top+'px'});
  };
  const resize=new ResizeObserver(fit);resize.observe(preview.parentElement);

  // Draw the interactive preview at screen resolution, but keep sourcePixels
  // and mask at their original resolution for final PNG and border refinement.
  // The old draw() composed a 4096px full PNG on EVERY pointer movement and
  // allocated several 60MB arrays on iPhone, often freezing before first paint.
  const previewScale=Math.min(1,1100/Math.max(frame.width,frame.height));
  const displayWidth=Math.max(1,Math.round(frame.width*previewScale)),
    displayHeight=Math.max(1,Math.round(frame.height*previewScale)),
    displayCutWidth=Math.max(1,Math.round(placement.width*previewScale)),
    displayCutHeight=Math.max(1,Math.round(placement.height*previewScale)),
    displayX=(placement.x+placement.width/2)*previewScale,
    displayY=(placement.y+placement.height/2)*previewScale;
  const previewCut=document.createElement('canvas');
  previewCut.width=displayCutWidth;previewCut.height=displayCutHeight;
  const previewCtx=previewCut.getContext('2d',{willReadFrequently:true});
  const previewBuffer=previewCtx.createImageData(displayCutWidth,displayCutHeight);
  function paintCutout(alpha){
    const pixels=previewBuffer.data,rgba=sourcePixels.data;
    for(let y=0;y<displayCutHeight;y++){
      const sy=Math.min(h-1,Math.floor((y+.5)*h/displayCutHeight)),srcRow=sy*w;
      for(let x=0;x<displayCutWidth;x++){
        const sx=Math.min(w-1,Math.floor((x+.5)*w/displayCutWidth));
        const si=srcRow+sx,src=si*4,out=(y*displayCutWidth+x)*4;
        let red=rgba[src],green=rgba[src+1],blue=rgba[src+2];
        if(appearance!=='original'){
          const luma=.2126*red+.7152*green+.0722*blue;
          const correction=v=>appearance==='natural'?v+intensity*14*(1-luma/255)
            :(v-luma)*(1+.3*intensity)+luma+(luma-128)*.18*intensity;
          red=correction(red);green=correction(green);blue=correction(blue);
        }
        pixels[out]=red;pixels[out+1]=green;pixels[out+2]=blue;
        pixels[out+3]=Math.min(rgba[src+3],alpha[si]);
      }
    }
    previewCtx.putImageData(previewBuffer,0,0);
  }
  function draw(){
    if(!preview.isConnected)return;
    if(preview.width!==displayWidth)preview.width=displayWidth;
    if(preview.height!==displayHeight)preview.height=displayHeight;
    pctx.clearRect(0,0,displayWidth,displayHeight);
    if(comparison==='original'){
      pctx.drawImage(frame,0,0,displayWidth,displayHeight);fit();return;
    }
    pctx.save();pctx.filter='saturate(.42) brightness(1.18) contrast(.62)';
    pctx.globalAlpha=.46;pctx.drawImage(frame,0,0,displayWidth,displayHeight);pctx.restore();
    pctx.fillStyle='rgba(255,255,255,.34)';pctx.fillRect(0,0,displayWidth,displayHeight);
    paintCutout(comparison==='initial'?initialMask:mask);
    pctx.save();pctx.translate(displayX,displayY);
    if(mode==='final'&&comparison!=='initial')pctx.rotate(rotation*Math.PI/180);
    pctx.drawImage(previewCut,-displayCutWidth/2,-displayCutHeight/2);
    pctx.restore();fit();
  }

  const methodDescription=id=>methodList.find(item=>item.id===id)?.description||'使用当前候选作为初始边界，在本机重新计算透明 mask。';
  const framePhysicalWidthMM=processing.sourceWidthMM&&placement.width?processing.sourceWidthMM*frame.width/placement.width:null,
    framePhysicalHeightMM=processing.sourceHeightMM&&placement.height?processing.sourceHeightMM*frame.height/placement.height:null;
  const requestBase=currentMask=>({
    mask:new Uint8Array(currentMask),placement:{...placement},frameWidth:frame.width,frameHeight:frame.height,targetWidth:w,targetHeight:h,
    paperWidthMM:framePhysicalWidthMM,paperHeightMM:framePhysicalHeightMM
  });
  function prepareOutput(){
    if(outputPrepared)return;
    outputPrepared=true;
    if(autoStraighten){const angle=maskOrientation(mask,w,h);if(angle!=null)rotation=angle;}
  }
  const setNote=message=>{note=message;panel();};
  function panel(){
    if(mode==='final')prepareOutput();
    flushSync(()=>cutoutRoot.render(createElement(CutoutPanel,{
      state:{mode,restore,ratio,history:history.length>0,lastStroke:!!lastStroke,busy,
        recognition:recognitionState,post:postState,methods:methodList,pixels:pixelList,
        methodDescription:methodDescription(recognitionState.method),
        canRerecognize:!!onRerecognize,canPostprocess:!!onPostprocess,
        autoStraighten,rotation,appearance,intensity,note},
      actions,canvasRef:node=>{if(node)preview=node;}
    })));
  }
  const modified=(fn,{paint=true}={})=>()=>{
    if(busy)return;fn();comparison=null;panel();if(paint)draw();
  };
  const actions={
    cancel:()=>{if(!busy)modal.close();},apply:()=>void apply(),
    compare:value=>{comparison=value;draw();},
    repair:value=>{restore=value;panel();},ratio:value=>{ratio=value;panel();},
    undo:modified(()=>{if(history.length)mask=history.pop();lastStroke=null;manualTouched=true;outputPrepared=false;}),
    refine:modified(()=>{if(!lastStroke)return;const result=refineMaskStroke(mask,sourcePixels,lastStroke);
      if(result.changed){push();mask=result.mask;manualTouched=true;outputPrepared=false;}
      note=result.changed?'已细化画笔附近边缘，可撤销。':'没有可靠的边缘变化，保留当前修补。';lastStroke=null;}),
    restoreEntry:modified(()=>{push();mask=copyMask(initialMask);roughStageMask=copyMask(mask);lastStroke=null;}),
    restoreRecognition:async()=>{
      if(busy)return;
      if(!onLoadInitialMask){push();mask=copyMask(recognitionMask);roughStageMask=copyMask(mask);lastStroke=null;panel();draw();return;}
      busy=true;panel();try{const originalMask=await onLoadInitialMask();
        if(!originalMask?.width||!originalMask?.height)throw Error('初始透明蒙版无效');
        const initial=resampleMask(originalMask,w,h);push();mask=copyMask(initial.alpha);
        roughStageMask=copyMask(mask);recognitionBaseMask=copyMask(mask);lastStroke=null;draw();
      }catch(error){note='初始识别结果未能恢复：'+error.message;}
      finally{busy=false;panel();}
    },
    recognition:(key,value)=>{recognitionState={...recognitionState,[key]:value};panel();},
    preprocess:(key,value)=>{recognitionState={...recognitionState,preprocess:{...recognitionState.preprocess,[key]:value}};panel();},
    post:(key,value)=>{postState={...postState,[key]:value};panel();},
    rerecognize:async()=>{
      if(busy||!onRerecognize)return;
      roughStageMask=copyMask(mask);busy=true;setNote('正在使用当前 rough mask 重新识别…');
      try{const result=await onRerecognize({...requestBase(roughStageMask),...recognitionState});
        if(!result?.mask||result.mask.length!==mask.length)throw Error('重新识别没有返回可用边界');
        mask=copyMask(result.mask);recognitionBaseMask=copyMask(result.mask);recognitionStageMask=copyMask(result.mask);
        postprocessBaseMask=copyMask(result.mask);finalStageMask=copyMask(result.mask);
        history.length=0;manualTouched=false;outputPrepared=false;lastStroke=null;
        lastRecognition={...recognitionState,method:result.method||recognitionState.method};
        mode='recognition';note='主识别完成。现在可先手修识别结果，再执行后处理。';draw();
      }catch(error){note=error.message||'重新识别失败，保留当前 rough mask。';}
      finally{busy=false;panel();}
    },
    restoreRecognitionBase:modified(()=>{push();mask=copyMask(recognitionBaseMask);recognitionStageMask=copyMask(mask);lastStroke=null;}),
    postprocess:async()=>{
      if(busy||!onPostprocess)return;
      recognitionStageMask=copyMask(mask);busy=true;setNote('正在对你修正后的 mask 应用后处理…');
      try{const result=await onPostprocess({...requestBase(recognitionStageMask),
          preprocess:recognitionState.preprocess,postprocess:{...postState}});
        if(!result?.mask||result.mask.length!==mask.length)throw Error('自动修整没有返回可用边界');
        mask=copyMask(result.mask);postprocessBaseMask=copyMask(result.mask);finalStageMask=copyMask(result.mask);
        history.length=0;manualTouched=false;outputPrepared=false;lastStroke=null;
        lastPostprocess={...postState,shapeModel:result.shapeModel||null};mode='final';
        note=result.shapeModel?'后处理完成，并采用 '+result.shapeModel+' 规则图形。现在可做最终人工修正。':'后处理完成。现在可做最终人工修正。';draw();
      }catch(error){note=error.message||'自动修整失败，保留当前识别结果。';}
      finally{busy=false;panel();}
    },
    restoreFinalBase:modified(()=>{push();mask=copyMask(postprocessBaseMask);finalStageMask=copyMask(mask);lastStroke=null;outputPrepared=false;}),
    autoStraighten:value=>{autoStraighten=value;if(value){const angle=maskOrientation(mask,w,h);if(angle!=null)rotation=angle;}panel();draw();},
    angle:value=>{autoStraighten=false;rotation=value;panel();draw();},
    rotate:delta=>{autoStraighten=false;rotation=wrap(rotation+delta);panel();draw();},
    originalDirection:()=>{autoStraighten=false;rotation=initialRotation;panel();draw();},
    align:()=>{const angle=maskOrientation(mask,w,h);if(angle!=null){rotation=angle;autoStraighten=true;}else note='轮廓不足，请手动调整角度。';panel();draw();},
    appearance:value=>{appearance=value;panel();draw();},
    intensity:value=>{intensity=value;panel();draw();},
    reset:()=>{push();mask=copyMask(initialMask);roughStageMask=copyMask(initialMask);
      recognitionBaseMask=copyMask(recognitionMask);recognitionStageMask=copyMask(recognitionMask);
      postprocessBaseMask=copyMask(initialMask);finalStageMask=copyMask(initialMask);
      appearance=initialAppearance;intensity=initialIntensity;rotation=initialRotation;autoStraighten=initialAutoStraighten;
      outputPrepared=false;manualTouched=false;lastStroke=null;lastRecognition=null;lastPostprocess=null;mode='rough';panel();draw();},
    previous:()=>{if(busy)return;
      if(mode==='recognition'){recognitionStageMask=copyMask(mask);mode='rough';mask=copyMask(roughStageMask);}
      else if(mode==='final'){finalStageMask=copyMask(mask);mode='recognition';mask=copyMask(recognitionStageMask);}
      comparison=null;history.length=0;lastStroke=null;outputPrepared=false;panel();draw();},
    next:()=>{if(busy)return;
      if(mode==='rough'){roughStageMask=copyMask(mask);recognitionBaseMask=copyMask(mask);recognitionStageMask=copyMask(mask);mode='recognition';mask=copyMask(recognitionStageMask);}
      else if(mode==='recognition'){recognitionStageMask=copyMask(mask);postprocessBaseMask=copyMask(mask);finalStageMask=copyMask(mask);mode='final';mask=copyMask(finalStageMask);outputPrepared=false;prepareOutput();}
      else{void apply();return;}
      comparison=null;history.length=0;lastStroke=null;panel();draw();}
  };

  const point=e=>{
    const r=preview.getBoundingClientRect(),scale=Math.min(r.width/frame.width,r.height/frame.height),
      fw=frame.width*scale,fh=frame.height*scale,left=r.left+(r.width-fw)/2,top=r.top+(r.height-fh)/2,
      nx=(e.clientX-left)/scale,ny=(e.clientY-top)/scale;
    return {x:(nx-placement.x)/placement.width,y:(ny-placement.y)/placement.height};
  };

  preview.onpointerdown=e=>{
    if(comparison||busy)return;
    const p=point(e);if(p.x<0||p.x>1||p.y<0||p.y>1)return;
    e.preventDefault();preview.setPointerCapture(e.pointerId);push();stroke={id:e.pointerId,points:[p],ratio,restore};
    mask=paintMask(mask,w,h,[p],ratio,restore,sourceAlpha);manualTouched=true;outputPrepared=false;draw();
  };
  preview.onpointermove=e=>{
    if(!stroke||stroke.id!==e.pointerId)return;
    e.preventDefault();const p=point(e),last=stroke.points.at(-1),
      steps=Math.max(1,Math.ceil(Math.hypot((p.x-last.x)*w,(p.y-last.y)*h)/Math.max(1,Math.min(w,h)*ratio/4))),
      points=Array.from({length:Math.min(steps,2048)},(_,i)=>({x:last.x+(p.x-last.x)*(i+1)/steps,y:last.y+(p.y-last.y)*(i+1)/steps}));
    stroke.points.push(...points);mask=paintMask(mask,w,h,points,ratio,restore,sourceAlpha);manualTouched=true;outputPrepared=false;draw();
  };
  preview.onpointerup=e=>{if(!stroke||stroke.id!==e.pointerId)return;lastStroke=stroke;stroke=null;if(mode==='final'&&autoStraighten){const angle=maskOrientation(mask,w,h);if(angle!=null)rotation=angle;}panel();};
  preview.onpointercancel=()=>{if(!stroke)return;mask=history.pop();stroke=null;draw();panel();};

  const apply=async()=>{
    if(busy||stroke)return;finalStageMask=copyMask(mask);
    if(!mask.some(a=>a>0)){toast('没有可见素材，请回到手动修补恢复区域');return;}
    busy=true;panel();
    try{
      const blob=await png(composed());
      setNote('正在读取高清候选框并映射小蒙版，准备完整 PNG…');
      await new Promise(resolve=>requestAnimationFrame(resolve));
      await onApply(blob,{
        appearance,intensity,displayRotationDegrees:rotation,autoStraighten,
        recognitionRotationDegrees:processing.recognitionRotationDegrees||0,
        sourcePixelWidth:w,sourcePixelHeight:h,recognitionPixels:editPixels,
        candidateFramePlacement:processing.candidateFramePlacement||null,
        rerecognition:lastRecognition,autoPostprocess:lastPostprocess,manualBoundaryEdited:manualTouched
      },recognition,encodeAlphaMask(mask,w,h));
      modal.close();
    }catch(e){toast(e.message);busy=false;panel();}
  };

  const cancel=e=>{if(busy)e.preventDefault();};
  modal.addEventListener('cancel',cancel);
  onDialogClosed(modal,()=>{
    resize.disconnect();cutoutRoot.unmount();modal.removeEventListener('cancel',cancel);modal.classList.remove('cutout-dialog','material-editor-dialog','cutout-loading-dialog');
    for(const image of new Set([source,initial,recognized,frame]))image?.close?.();
  });
  // The tool layout should be presented while the native dialog remains
  // open, before any expensive preview paint. Do not close and showModal again.
  // Size the preview at once so the first visible frame is never stretched
  // while the higher-cost mask composition waits for the next animation frame.
  preview.width=displayWidth;preview.height=displayHeight;fit();
  await new Promise(resolve=>requestAnimationFrame(resolve));
  if(isCancelled()||!modal.open)return;
  panel();draw();
}

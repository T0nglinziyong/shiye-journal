import {paintMask,maskOrientation,refineMaskStroke} from './mask-model.js';
import {containBox} from './preview-geometry.js';
import {onDialogClosed} from './dialog-lifecycle.js';

const wrap=a=>((a+180)%360+360)%360-180;
const png=c=>new Promise((resolve,reject)=>c.toBlob(b=>b?resolve(b):reject(Error('图像处理失败')),'image/png'));
const copyMask=value=>new Uint8ClampedArray(value);

export async function showCutoutEditor({
  body,modal,original,saved,recognition=saved,candidateFrame=original,title,processing={},
  onApply,onRerecognize,onPostprocess,recognitionUI={},toast
}) {
  const [source,initial,recognized,frame]=await Promise.all([
    createImageBitmap(original),createImageBitmap(saved),createImageBitmap(recognition),createImageBitmap(candidateFrame||original)
  ]);
  const w=source.width,h=source.height,canvas=document.createElement('canvas');
  canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{willReadFrequently:true});
  ctx.drawImage(source,0,0);
  const sourcePixels=ctx.getImageData(0,0,w,h),
    sourceAlpha=Uint8ClampedArray.from({length:w*h},(_,i)=>sourcePixels.data[i*4+3]),
    rawPlacement=processing.candidateFramePlacement,
    placement=rawPlacement&&rawPlacement.frameWidth===frame.width&&rawPlacement.frameHeight===frame.height
      ?{x:rawPlacement.x,y:rawPlacement.y,width:rawPlacement.width,height:rawPlacement.height}
      :{x:0,y:0,width:frame.width,height:frame.height};

  const alphaFrom=(bitmap,angle=0)=>{
    ctx.clearRect(0,0,w,h);ctx.save();ctx.translate(w/2,h/2);ctx.rotate(-angle*Math.PI/180);
    ctx.drawImage(bitmap,-bitmap.width/2,-bitmap.height/2);ctx.restore();
    const pixels=ctx.getImageData(0,0,w,h).data;
    return Uint8ClampedArray.from({length:w*h},(_,i)=>pixels[i*4+3]);
  };

  const initialRotation=processing.displayRotationDegrees||0,
    initialMask=alphaFrom(initial,initialRotation),
    recognitionMask=alphaFrom(recognized,processing.recognitionRotationDegrees||0),
    steps=[['recognize','重新识别'],['auto','自动修整'],['manual','手动修补'],['output','摆正与外观']],
    methodList=recognitionUI.methods||[],
    pixelList=recognitionUI.pixels||[[900,'900 px'],[1200,'1200 px'],[1600,'1600 px']],
    savedRecognition=processing.rerecognition||{},
    savedPost=processing.autoPostprocess||savedRecognition.postprocess||{},
    defaultPre={illumination:true,denoise:true,localContrast:true,chromaEdges:true,...recognitionUI.preprocess,...savedRecognition.preprocess},
    defaultPost={edgePolish:true,shapeRegularization:true,curveSmooth:true,apertures:true,...recognitionUI.postprocess,...savedPost};

  let mask=copyMask(initialMask),
    recognitionStageMask=copyMask(initialMask),
    autoStageMask=copyMask(initialMask),
    mode='recognize',restore=true,ratio=.04,
    appearance=processing.appearance||'original',intensity=processing.intensity??.5,
    rotation=initialRotation,autoStraighten=processing.autoStraighten!==false,outputPrepared=false,
    comparison=null,stroke=null,lastStroke=null,busy=false,manualTouched=false,
    recognitionState={
      method:savedRecognition.method||recognitionUI.method||methodList[0]?.id||'auto',
      pixels:Number(savedRecognition.pixels||recognitionUI.pixelsValue||1200),
      preprocess:{...defaultPre}
    },
    postState={...defaultPost},
    lastRecognition=savedRecognition.method?{method:savedRecognition.method,pixels:Number(savedRecognition.pixels||1200),preprocess:{...defaultPre}}:null,
    lastPostprocess=processing.autoPostprocess?{...processing.autoPostprocess}:null;

  const history=[],initialAppearance=appearance,initialIntensity=intensity,initialAutoStraighten=autoStraighten;

  body.innerHTML='<div class="material-editor cutout-modal">'
    +'<header><button type="button" id="cutout-cancel">取消</button><strong>检查抠图</strong><button type="button" id="cutout-apply" disabled>应用</button></header>'
    +'<div class="cutout-steps">'+steps.map(([id,label],i)=>'<span data-cut-step="'+id+'"><b>'+(i+1)+'</b>'+label+'</span>').join('')+'</div>'
    +'<div class="cutout-compare"><button type="button" id="compare-original">按住看候选框原图</button><button type="button" id="compare-initial">按住看进入时抠图</button></div>'
    +'<div class="material-editor-preview cutout-preview"><canvas id="cutout-canvas" aria-label="素材抠图预览"></canvas></div>'
    +'<p>正常颜色是当前抠图；浅色底图是候选框中的完整原始画面。自动步骤不会在手动修补之后偷偷修改边界。</p>'
    +'<section class="cutout-controls"><div id="cutout-mode-panel"></div><p id="cutout-note" role="status"></p>'
    +'<div class="cutout-step-nav"><button type="button" class="btn" id="cutout-prev">上一步</button><button type="button" class="btn primary" id="cutout-next">下一步</button></div>'
    +'<div class="stack"><button type="button" class="btn" id="cutout-reset">恢复进入时的状态</button></div></section></div>';

  modal.classList.add('cutout-dialog','material-editor-dialog');
  if(!modal.open)modal.showModal();
  const preview=body.querySelector('#cutout-canvas'),pctx=preview.getContext('2d');

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

  function draw(){
    if(!preview.isConnected)return;
    if(comparison==='original'){
      preview.width=frame.width;preview.height=frame.height;pctx.clearRect(0,0,preview.width,preview.height);pctx.drawImage(frame,0,0);fit();return;
    }
    const showRotation=mode==='output'?rotation:0,
      cut=comparison==='initial'?initial:composed(mask,appearance,intensity,showRotation);
    preview.width=frame.width;preview.height=frame.height;pctx.clearRect(0,0,preview.width,preview.height);
    pctx.save();pctx.filter='saturate(.42) brightness(1.18) contrast(.62)';pctx.globalAlpha=.46;pctx.drawImage(frame,0,0);pctx.restore();
    pctx.fillStyle='rgba(255,255,255,.34)';pctx.fillRect(0,0,preview.width,preview.height);
    const cx=placement.x+placement.width/2,cy=placement.y+placement.height/2;
    pctx.drawImage(cut,cx-cut.width/2,cy-cut.height/2);fit();
  }

  const switchRow=(id,label,checked,help)=>'<label class="toggle-row setting-toggle"><span><b>'+label+'</b><small class="setting-help">'+help+'</small></span><input id="'+id+'" type="checkbox" '+(checked?'checked':'')+'></label>';
  const methodDescription=id=>methodList.find(item=>item.id===id)?.description||'使用当前候选作为初始边界，在本机重新计算透明 mask。';

  const requestBase=currentMask=>({
    mask:new Uint8Array(currentMask),placement:{...placement},frameWidth:frame.width,frameHeight:frame.height,targetWidth:w,targetHeight:h
  });

  const readRecognition=el=>{
    const checked=id=>el.querySelector('#'+id)?.checked!==false;
    recognitionState={
      method:el.querySelector('#cutout-method')?.value||recognitionState.method,
      pixels:Number(el.querySelector('#cutout-pixels')?.value||recognitionState.pixels),
      preprocess:{
        illumination:checked('cutout-pre-light'),denoise:checked('cutout-pre-denoise'),
        localContrast:checked('cutout-pre-contrast'),chromaEdges:checked('cutout-pre-chroma')
      }
    };
  };

  const readPost=el=>{
    const checked=id=>el.querySelector('#'+id)?.checked!==false;
    postState={
      edgePolish:checked('cutout-post-edge'),
      shapeRegularization:checked('cutout-post-shapes'),
      curveSmooth:checked('cutout-post-curves'),
      apertures:checked('cutout-post-apertures')
    };
  };

  function prepareOutput(){
    if(outputPrepared)return;
    outputPrepared=true;
    if(autoStraighten){
      const angle=maskOrientation(mask,w,h);
      if(angle!=null)rotation=angle;
    }
  }

  function panel(){
    const stepIndex=steps.findIndex(([id])=>id===mode);
    body.querySelectorAll('[data-cut-step]').forEach((node,i)=>{
      node.classList.toggle('current',i===stepIndex);node.classList.toggle('passed',i<stepIndex);
    });
    const previous=body.querySelector('#cutout-prev'),next=body.querySelector('#cutout-next'),topApply=body.querySelector('#cutout-apply');
    previous.disabled=stepIndex===0;next.textContent=stepIndex===steps.length-1?'应用当前结果':'下一步';topApply.disabled=stepIndex!==steps.length-1;
    const el=body.querySelector('#cutout-mode-panel');

    if(mode==='recognize'){
      const options=methodList.map(item=>'<option value="'+item.id+'" '+(recognitionState.method===item.id?'selected':'')+'>'+item.label+'</option>').join(''),
        pixels=pixelList.map(([value,label])=>'<option value="'+value+'" '+(Number(value)===recognitionState.pixels?'selected':'')+'>'+label+'</option>').join('');
      el.innerHTML='<div class="stack"><label>识别方法<select id="cutout-method">'+options+'</select><small id="cutout-method-help" class="setting-help">'+methodDescription(recognitionState.method)+'</small></label>'
        +'<label>处理像素<select id="cutout-pixels">'+pixels+'</select><small class="setting-help">只影响这一次重新识别，不修改全局设置。</small></label><h3>识别预处理</h3>'
        +switchRow('cutout-pre-light','光照场校正',recognitionState.preprocess.illumination,'补偿候选框内的渐变照明和阴影。')
        +switchRow('cutout-pre-denoise','轻度去噪',recognitionState.preprocess.denoise,'减少噪点和 JPEG 纹理对边界的干扰。')
        +switchRow('cutout-pre-contrast','局部对比增强',recognitionState.preprocess.localContrast,'轻量增强浅色边缘，不修改最终保存颜色。')
        +switchRow('cutout-pre-chroma','Lab 色差边缘增强',recognitionState.preprocess.chromaEdges,'对绿白、浅色载体更有帮助，只作为边缘证据。')
        +'<button type="button" class="btn primary" id="cutout-rerecognize" '+(!onRerecognize?'disabled':'')+'>重新识别当前候选</button>'
        +'<small class="setting-help">这一阶段只运行主识别算法，不做规则图形、曲线平滑、孔洞等自动后处理。</small></div>';
      const method=el.querySelector('#cutout-method');
      method?.addEventListener('change',()=>{readRecognition(el);el.querySelector('#cutout-method-help').textContent=methodDescription(recognitionState.method);});
      el.querySelector('#cutout-rerecognize')?.addEventListener('click',async()=>{
        if(busy||!onRerecognize)return;
        readRecognition(el);busy=true;const button=el.querySelector('#cutout-rerecognize');button.disabled=true;body.querySelector('#cutout-note').textContent='正在重新识别候选框…';
        try{
          const result=await onRerecognize({...requestBase(recognitionStageMask),...recognitionState});
          if(!result?.mask||result.mask.length!==mask.length)throw Error('重新识别没有返回可用边界');
          push();mask=copyMask(result.mask);recognitionStageMask=copyMask(result.mask);autoStageMask=copyMask(result.mask);
          manualTouched=false;outputPrepared=false;lastStroke=null;
          lastRecognition={...recognitionState,method:result.method||recognitionState.method};
          body.querySelector('#cutout-note').textContent='主识别完成。下一步可以独立选择自动修整项目。';draw();
        }catch(error){body.querySelector('#cutout-note').textContent=error.message||'重新识别失败，保留当前抠图。';}
        finally{busy=false;panel();}
      });
    }else if(mode==='auto'){
      el.innerHTML='<div class="stack"><h3>识别后处理</h3>'
        +switchRow('cutout-post-edge','原分辨率边缘精修',postState.edgePolish,'用原分辨率 GrabCut 贴近真实物理边缘。')
        +switchRow('cutout-post-shapes','规则图形规整',postState.shapeRegularization,'四边形、圆/椭圆和多边形并行拟合并统一仲裁。')
        +switchRow('cutout-post-curves','曲线平滑',postState.curveSmooth,'规则图形没有明显胜出时抑制像素锯齿。')
        +switchRow('cutout-post-apertures','真实孔洞识别',postState.apertures,'保守恢复已识别物理孔洞；宁可漏孔也避免误挖图案。')
        +'<button type="button" class="btn primary" id="cutout-postprocess" '+(!onPostprocess?'disabled':'')+'>应用自动修整</button>'
        +'<small class="setting-help">自动修整始终基于第 1 步的识别结果。进入手动修补后，系统不会再自动覆盖你的边界。</small></div>';
      el.querySelector('#cutout-postprocess')?.addEventListener('click',async()=>{
        if(busy||!onPostprocess)return;
        readPost(el);busy=true;const button=el.querySelector('#cutout-postprocess');button.disabled=true;body.querySelector('#cutout-note').textContent='正在应用自动修整…';
        try{
          const result=await onPostprocess({...requestBase(recognitionStageMask),preprocess:recognitionState.preprocess,postprocess:{...postState}});
          if(!result?.mask||result.mask.length!==mask.length)throw Error('自动修整没有返回可用边界');
          push();mask=copyMask(result.mask);autoStageMask=copyMask(result.mask);manualTouched=false;outputPrepared=false;lastStroke=null;
          lastPostprocess={...postState,shapeModel:result.shapeModel||null};
          body.querySelector('#cutout-note').textContent=result.shapeModel?'已自动修整，并采用 '+result.shapeModel+' 规则图形。':'已完成自动修整。';draw();
        }catch(error){body.querySelector('#cutout-note').textContent=error.message||'自动修整失败，保留当前识别结果。';}
        finally{busy=false;panel();}
      });
    }else if(mode==='manual'){
      el.innerHTML='<div class="cutout-tabs two"><button type="button" data-repair="restore" class="'+(restore?'selected':'')+'">补回</button><button type="button" data-repair="erase" class="'+(!restore?'selected':'')+'">擦除</button></div>'
        +'<label>笔宽 · 短边的 <b id="brush-value">'+Math.round(ratio*100)+'%</b><input id="cutout-strength" type="range" min="0.5" max="20" step="0.5" value="'+ratio*100+'"></label>'
        +'<div class="stack"><button type="button" id="cutout-undo" '+(!history.length?'disabled':'')+'>撤销上次修补</button><button type="button" id="cutout-refine" '+(!lastStroke?'disabled':'')+'>细化上次涂抹</button>'
        +'<small>这一阶段是最终边界人工校正。后续摆正和颜色调整不会改变 mask。</small><button type="button" id="cutout-auto-result">恢复自动修整结果</button><button type="button" id="cutout-recognition">恢复初始识别</button></div>';
      el.querySelectorAll('[data-repair]').forEach(b=>b.onclick=()=>{restore=b.dataset.repair==='restore';panel();});
      const strength=el.querySelector('#cutout-strength');if(strength)strength.oninput=()=>{ratio=+strength.value/100;el.querySelector('#brush-value').textContent=strength.value+'%';};
      const action=(id,fn)=>{const b=el.querySelector('#'+id);if(b)b.onclick=()=>{if(busy)return;fn();comparison=null;panel();draw();};};
      action('cutout-undo',()=>{if(history.length)mask=history.pop();lastStroke=null;manualTouched=true;outputPrepared=false;});
      action('cutout-auto-result',()=>{push();mask=copyMask(autoStageMask);lastStroke=null;manualTouched=false;outputPrepared=false;});
      action('cutout-recognition',()=>{push();mask=copyMask(recognitionMask);recognitionStageMask=copyMask(recognitionMask);autoStageMask=copyMask(recognitionMask);lastStroke=null;manualTouched=false;outputPrepared=false;});
      action('cutout-refine',()=>{
        if(!lastStroke)return;
        const result=refineMaskStroke(mask,sourcePixels,lastStroke);
        if(result.changed){push();mask=result.mask;manualTouched=true;outputPrepared=false;}
        body.querySelector('#cutout-note').textContent=result.changed?'已细化画笔附近边缘，可撤销。':'没有可靠的边缘变化，保留当前修补。';lastStroke=null;
      });
    }else{
      prepareOutput();
      el.innerHTML='<div class="stack"><h3>方向</h3>'
        +switchRow('cutout-auto-straighten','自动摆正',autoStraighten,'根据最终手动修补后的 mask 估计素材主方向；只旋转最终输出，不再改变边界。')
        +'<label>显示角度 <b id="rotation-value">'+rotation.toFixed(1)+'°</b><input id="cutout-angle" type="range" min="-180" max="180" step=".1" value="'+rotation+'"></label>'
        +'<div class="form-grid"><button type="button" id="cutout-left">左转90°</button><button type="button" id="cutout-rotate">右转90°</button></div>'
        +'<button type="button" id="cutout-align">重新按最终边缘摆正</button><button type="button" id="cutout-original-direction">恢复原方向</button>'
        +'<h3>外观</h3><div class="cutout-tabs"><button type="button" data-appearance="original">原色</button><button type="button" data-appearance="natural">自然增强</button><button type="button" data-appearance="vivid">鲜明展示</button></div>'
        +'<label>增强强度 <b id="appearance-value">'+Math.round(intensity*100)+'%</b><input id="cutout-intensity" type="range" min="0" max="100" value="'+intensity*100+'" '+(appearance==='original'?'disabled':'')+'></label>'
        +'<small class="setting-help">外观调整只改变最终显示像素，不参与识别，也不会改变透明 mask。</small></div>';
      const auto=el.querySelector('#cutout-auto-straighten');
      auto.onchange=()=>{autoStraighten=auto.checked;if(autoStraighten){const angle=maskOrientation(mask,w,h);if(angle!=null)rotation=angle;}panel();draw();};
      const angle=el.querySelector('#cutout-angle');if(angle)angle.oninput=()=>{autoStraighten=false;auto.checked=false;rotation=+angle.value;el.querySelector('#rotation-value').textContent=rotation.toFixed(1)+'°';draw();};
      const action=(id,fn)=>{const b=el.querySelector('#'+id);if(b)b.onclick=()=>{if(busy)return;fn();comparison=null;panel();draw();};};
      action('cutout-left',()=>{autoStraighten=false;rotation=wrap(rotation-90);});
      action('cutout-rotate',()=>{autoStraighten=false;rotation=wrap(rotation+90);});
      action('cutout-original-direction',()=>{autoStraighten=false;rotation=initialRotation;});
      action('cutout-align',()=>{const angle=maskOrientation(mask,w,h);if(angle!=null){rotation=angle;autoStraighten=true;}else body.querySelector('#cutout-note').textContent='轮廓不足，请手动调整角度。';});
      el.querySelectorAll('[data-appearance]').forEach(b=>{b.classList.toggle('selected',b.dataset.appearance===appearance);b.onclick=()=>{appearance=b.dataset.appearance;panel();draw();};});
      const amount=el.querySelector('#cutout-intensity');if(amount)amount.oninput=()=>{intensity=+amount.value/100;el.querySelector('#appearance-value').textContent=amount.value+'%';draw();};
    }
  }

  for(const [id,value] of [['compare-original','original'],['compare-initial','initial']]){
    const b=body.querySelector('#'+id);
    b.onpointerdown=e=>{if(busy)return;e.preventDefault();b.setPointerCapture(e.pointerId);comparison=value;draw();};
    b.onpointerup=b.onpointercancel=()=>{comparison=null;draw();};
    b.onkeydown=e=>{if([' ','Enter'].includes(e.key)){e.preventDefault();comparison=value;draw();}};
    b.onkeyup=()=>{comparison=null;draw();};
  }

  const point=e=>{
    const r=preview.getBoundingClientRect(),scale=Math.min(r.width/frame.width,r.height/frame.height),
      fw=frame.width*scale,fh=frame.height*scale,left=r.left+(r.width-fw)/2,top=r.top+(r.height-fh)/2,
      nx=(e.clientX-left)/scale,ny=(e.clientY-top)/scale;
    return {x:(nx-placement.x)/placement.width,y:(ny-placement.y)/placement.height};
  };

  preview.onpointerdown=e=>{
    if(mode!=='manual'||comparison||busy)return;
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
  preview.onpointerup=e=>{if(!stroke||stroke.id!==e.pointerId)return;lastStroke=stroke;stroke=null;panel();};
  preview.onpointercancel=()=>{if(!stroke)return;mask=history.pop();stroke=null;draw();panel();};

  body.querySelector('#cutout-reset').onclick=()=>{
    push();mask=copyMask(initialMask);recognitionStageMask=copyMask(initialMask);autoStageMask=copyMask(initialMask);
    appearance=initialAppearance;intensity=initialIntensity;rotation=initialRotation;autoStraighten=initialAutoStraighten;
    outputPrepared=false;manualTouched=false;lastStroke=null;lastRecognition=null;lastPostprocess=null;mode='recognize';panel();draw();
  };
  body.querySelector('#cutout-cancel').onclick=()=>{if(!busy)modal.close();};

  const apply=async()=>{
    if(busy||stroke)return;
    if(!mask.some(a=>a>0)){toast('没有可见素材，请回到手动修补恢复区域');return;}
    busy=true;for(const b of body.querySelectorAll('button'))b.disabled=true;
    try{
      const blob=await png(composed());
      await onApply(blob,{
        appearance,intensity,displayRotationDegrees:rotation,autoStraighten,
        recognitionRotationDegrees:processing.recognitionRotationDegrees||0,
        sourcePixelWidth:w,sourcePixelHeight:h,candidateFramePlacement:processing.candidateFramePlacement||null,
        rerecognition:lastRecognition,autoPostprocess:lastPostprocess,manualBoundaryEdited:manualTouched
      },recognition);
      modal.close();
    }catch(e){toast(e.message);busy=false;body.querySelectorAll('button').forEach(b=>b.disabled=false);panel();}
  };

  body.querySelector('#cutout-apply').onclick=apply;
  body.querySelector('#cutout-prev').onclick=()=>{
    if(busy)return;const i=steps.findIndex(([id])=>id===mode);
    if(i>0){mode=steps[i-1][0];comparison=null;panel();draw();}
  };
  body.querySelector('#cutout-next').onclick=()=>{
    if(busy)return;const i=steps.findIndex(([id])=>id===mode);
    if(i<steps.length-1){
      mode=steps[i+1][0];comparison=null;
      if(mode==='output')prepareOutput();
      panel();draw();
    }else void apply();
  };

  const cancel=e=>{if(busy)e.preventDefault();};
  modal.addEventListener('cancel',cancel);
  onDialogClosed(modal,()=>{
    resize.disconnect();modal.removeEventListener('cancel',cancel);modal.classList.remove('cutout-dialog','material-editor-dialog');
    source.close();initial.close();recognized.close();frame.close();
  });
  panel();draw();
}

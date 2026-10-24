import {hasGraphicEffects,graphicPaintFrame,inkEffectSVG} from './graphic-effects.js';
import {prepareJournalFont} from './journal-fonts.js';
import {scaleTextEffects} from './text-effects.js';
import {applyScenePatchBatch} from './scene-edit-kernel.js';
import {USER_SCENE_POLICY,requireScenePolicy,confirmSceneCapability} from './scene-edit-policy.js';
import {findSceneNode} from './scene-v2.js';
import {shapeSVG,textFont,textFontFamily,textLineHeight,drawSceneText} from './editor-tools-model.js';
import {materialMaskGeometry} from './material-mask.js';
import {geometryIntersection} from './craft-topology.js';
import {validateVectorMask} from './scene-v2.js';
import {smoothInkSVG} from './ink-path-geometry.js';
import {pressureInkPath} from './pressure-ink.js';
import {sceneDisplaySiblings} from './craft-display.js';
import {paintTapeStrip} from './tape-strip.js';
import {configureFabricEditorFrame} from './fabric-editor-frame.js';
import {assertRigidMatrix,multiplyMatrix,rigidMatrix,transformPoint,matrixAngle} from './scene-spatial.js';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const positive=(value,fallback=1)=>Number.isFinite(value)&&value>0?value:fallback;
const ringPath=(points,width,height)=>points.map(([x,y],index)=>
  `${index?'L':'M'} ${(x-.5)*width} ${(y-.5)*height}`).join(' ')+' Z';

// Fabric is the interactive projection. Scene v2 remains the persisted source
// of truth, so an editor change never replaces the physical-data contract.
export function createFabricSceneBridge(fabric,{assetURL=()=>null,canvasSize=()=>null}={}){
  const configureControls=object=>configureFabricEditorFrame(fabric,object);
  const maskGeometry=mask=>[[mask.outer,...(mask.holes||[])]];
  const clipPath=(geometry,width,height,{page=false,topOffset=0,leftOffset=0}={})=>{
    // A compound path keeps openings transparent. Fabric recenters Path data
    // around its own bounds, so place that center back in the Scene frame.
    if(!geometry.length)return new fabric.Path('M 0 0',{fill:'black',stroke:null});
    const points=geometry.flat(2),xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
    const centerX=(Math.min(...xs)+Math.max(...xs))/2;
    const centerY=(Math.min(...ys)+Math.max(...ys))/2;
    const path=geometry.flatMap(polygon=>polygon.map(ring=>ringPath(ring,width,height))).join(' ');
    return new fabric.Path(path,{originX:'center',originY:'center',
      left:(centerX-(page?0:.5))*width+leftOffset,
      top:(centerY-(page?0:.5))*height+topOffset,
      fill:'black',stroke:null,fillRule:'evenodd',absolutePositioned:page});
  };
  class SceneTextbox extends fabric.Textbox{
    initHiddenTextarea(){
      super.initHiddenTextarea();
      // Fabric focuses its offscreen input when editing starts. Browsers may
      // scroll the entire document to that 1px element and hide the page.
      const focus=this.hiddenTextarea.focus.bind(this.hiddenTextarea);
      this.hiddenTextarea.focus=options=>focus({...options,preventScroll:true});
    }
    _render(ctx){
      if(this.isEditing||!this.sceneTextNode){super._render(ctx);return;}
      // The canonical renderer and the interactive view share one text layout.
      // Fabric's native text metrics still power cursor movement while editing.
      const node={...this.sceneTextNode,content:this.text};
      drawSceneText(ctx,node,this.height);
    }
  }
  const transformChildren=(children,from,to,rotation,scaleX=1,scaleY=1,groupAngle=0)=>{
    const theta=rotation*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
    const frame=groupAngle*Math.PI/180,fc=Math.cos(frame),fs=Math.sin(frame);
    const vector=(x,y)=>{
      const localX=x*fc+y*fs,localY=-x*fs+y*fc;
      const scaledX=localX*scaleX,scaledY=localY*scaleY;
      const pageX=scaledX*fc-scaledY*fs,pageY=scaledX*fs+scaledY*fc;
      return {x:pageX*cos-pageY*sin,y:pageX*sin+pageY*cos};
    };
    const move=(x,y)=>{const delta=vector(x-from.x,y-from.y);
      return {x:to.x+delta.x,y:to.y+delta.y};};
    for(const child of children||[]){
      if(child.type==='group')transformChildren(child.children,from,to,rotation,scaleX,scaleY,groupAngle);
      else if(child.type==='ink'){
        child.points=(child.points||[]).map(point=>({...point,...move(point.x,point.y)}));
        child.width=positive(child.width,3)*Math.sqrt(scaleX*scaleY);
      }
      else{
        const position=move(child.x,child.y);
        child.x=position.x;child.y=position.y;
        if(child.type==='material'){
          // A manual group transform changes visual placement, never the
          // crop/source geometry used by the physical material ledger.
          const radians=finite(child.rotation)*Math.PI/180;
          const widthAxis=vector(Math.cos(radians),Math.sin(radians));
          const heightAxis=vector(-Math.sin(radians),Math.cos(radians));
          const widthScale=Math.hypot(widthAxis.x,widthAxis.y);
          const heightScale=Math.hypot(heightAxis.x,heightAxis.y);
          if(Math.abs(widthScale-1)>1e-6||Math.abs(heightScale-1)>1e-6){
            child.width=positive(child.width)*widthScale;
            child.height=positive(child.height)*heightScale;
            if(child.tapeStrip?.version===2){
              const strip=child.tapeStrip,pageScale=strip.bandWidthScene/strip.physicalWidthMM;
              const widthRatio=Math.sqrt(widthScale*heightScale);
              strip.physicalWidthMM*=widthRatio;strip.bandWidthScene*=widthRatio;
              strip.baseWidth=child.width;strip.baseHeight=child.height;
              const points=strip.points.map(([u,v])=>[u*child.width,v*child.height]);
              strip.pathLengthMM=points.slice(1).reduce((sum,p,i)=>
                sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0)/pageScale;
              if((strip.textureMode||'sample')==='sample'&&
                strip.sourceOffsetMM+strip.pathLengthMM>strip.sourceLengthMM)
                strip.textureMode='stretch';
            }
          }
          child.rotation=Math.atan2(widthAxis.y,widthAxis.x)*180/Math.PI;
          // The edit policy, not the renderer, grants visual resize.
        }else{
          if(Math.abs(scaleX-1)<1e-9&&Math.abs(scaleY-1)<1e-9){
            child.rotation=finite(child.rotation)+rotation;
            continue;
          }
          const radians=finite(child.rotation)*Math.PI/180;
          const widthAxis=vector(Math.cos(radians),Math.sin(radians));
          const heightAxis=vector(-Math.sin(radians),Math.cos(radians));
          const widthScale=Math.hypot(widthAxis.x,widthAxis.y);
          const heightScale=Math.hypot(heightAxis.x,heightAxis.y);
          child.width=positive(child.width)*widthScale;
          child.height=positive(child.height)*heightScale;
          child.rotation=Math.atan2(widthAxis.y,widthAxis.x)*180/Math.PI;
          if(child.type==='text'&&Math.abs(scaleX-scaleY)<.02)scaleTextEffects(child,scaleX);
          if(child.type==='text'&&Math.abs(scaleX-scaleY)<.02)
            for(const field of ['fontSize','fixedLineHeight','lineHeight','lineSpacing',
              'additionalLineSpacing','paragraphSpacing','letterSpacing','curveHeight'])
              if(Number.isFinite(child[field]))child[field]*=scaleX;
        }
      }
    }
  };
  const containsLocked=nodes=>(nodes||[]).some(child=>child.locked||child.isLocked||
    child.type==='group'&&containsLocked(child.children));
  async function fromNode(node){
    if(!node||node.hidden||node.isHidden||node.isParked||node.parked)return null;
    if(node.vectorMask)validateVectorMask(node.vectorMask);
    if(node.type==='group'){
      const children=(await Promise.all(sceneDisplaySiblings(node.children||[]).map(fromNode))).filter(Boolean);
      if(!children.length)return null;
      const group=new fabric.Group(children,{opacity:finite(node.opacity,1),
        globalCompositeOperation:node.blendMode==='multiply'?'multiply':'source-over'});
      if(node.shadow)group.set({shadow:new fabric.Shadow({color:node.shadow.color,blur:node.shadow.blur,offsetX:node.shadow.offsetX,offsetY:node.shadow.offsetY})});
      if(node.localTransform){
        const original=group.getCenterPoint(),next=transformPoint(node.localTransform,original.x,original.y);
        group.set({angle:(group.angle||0)+matrixAngle(node.localTransform)});
        group.setPositionByOrigin(new fabric.Point(next.x,next.y),'center','center');
        group.setCoords();
      }
      group.sceneID=node.id;group.sceneRenderKey=node.renderKey||node.id;group.sceneType='group';
      if(node.vectorMask){
        const size=typeof canvasSize==='function'?canvasSize():canvasSize;
        if(!(size?.width>0&&size?.height>0))throw Error('图层组蒙版缺少画布尺寸：'+node.id);
        group.clipPath=clipPath(maskGeometry(node.vectorMask),size.width,size.height,{page:true});
      }
      group.sceneGroupPose={center:group.getCenterPoint(),angle:group.angle||0};
      // Group resizing preserves the dimensions of physical material children.
      const canvasSelectable=!node.autoInkGroup&&!node.locked&&!node.isLocked&&
        !containsLocked(node.children);
      group.set({selectable:canvasSelectable,evented:canvasSelectable,lockScalingFlip:true});
      configureControls(group);
      return group;
    }
    let object;
    if(node.type==='shape'){
      const {objects,options}=await fabric.loadSVGFromString(shapeSVG(node));
      if(!objects.length)throw Error('图形无法由画布引擎解析：'+node.id);
      object=fabric.util.groupSVGElements(objects,options);
      if(hasGraphicEffects(node)){
        const frame=graphicPaintFrame(node),a=(node.rotation||0)*Math.PI/180,dx=(frame.right-frame.left)/2,dy=(frame.bottom-frame.top)/2;
        object.sceneFrameWidth=node.width;object.sceneFrameHeight=node.height;object.scenePaintInsets=frame;
        object.set({originX:'center',originY:'center',left:node.x+dx*Math.cos(a)-dy*Math.sin(a),top:node.y+dx*Math.sin(a)+dy*Math.cos(a),scaleX:1,scaleY:1});
      }else{
        object.sceneFrameWidth=positive(options.viewBoxWidth||options.width);object.sceneFrameHeight=positive(options.viewBoxHeight||options.height);
        object.set({originX:'center',originY:'center',left:finite(node.x),top:finite(node.y),scaleX:positive(node.width)/object.sceneFrameWidth,scaleY:positive(node.height)/object.sceneFrameHeight});
      }
    }else if(node.type==='text'){
      await prepareJournalFont(node);
      const frameHeight=positive(node.height,135),radians=finite(node.rotation)*Math.PI/180;
      object=new SceneTextbox(String(node.content||''),{
        width:positive(node.width),fontSize:positive(node.fontSize,40),
        fontFamily:textFontFamily(node),
        fill:node.color||'#30463d',fontWeight:node.bold?'bold':'normal',
        fontStyle:node.italic?'italic':'normal',textAlign:node.alignment||'left',
        charSpacing:finite(node.letterSpacing)*1000/positive(node.fontSize,40),
        lineHeight:positive(textLineHeight(node))/positive(node.fontSize,40),
        underline:!!node.underline,linethrough:!!node.strikethrough,
        strokeWidth:0,originX:'center',originY:'top',
        left:finite(node.x)+Math.sin(radians)*frameHeight/2,
        top:finite(node.y)-Math.cos(radians)*frameHeight/2
      });
      object.sceneTextFrameHeight=frameHeight;object.sceneNativeTextWidth=object.width;
      object.sceneTextNode=node;
      // Use the saved text frame for controls and caching too. Fabric's native
      // single-line measurement otherwise clips canonical wrapped Chinese text.
      object.set({height:Math.max(frameHeight,object.height)});
      object.setCoords();
      if(node.vectorMask)object.clipPath=clipPath(maskGeometry(node.vectorMask),
        object.width,frameHeight,{topOffset:(frameHeight-object.height)/2});
    }else if(node.type==='ink'){
      if(node.vectorMask)throw Error('墨迹蒙版需要先将墨迹分组，再在组上添加裁切蒙版');
      if(!node.points?.length)return null;
      const color=node.color||'#2b5245',width=positive(node.width,3);
      if(hasGraphicEffects(node)){const {svg,frame}=inkEffectSVG(node),parsed=await fabric.loadSVGFromString(svg);object=fabric.util.groupSVGElements(parsed.objects,parsed.options);object.set({originX:'center',originY:'center',left:frame.x+frame.width/2,top:frame.y+frame.height/2,scaleX:1,scaleY:1});}
      else if(node.penStyle==='pressure'){
        object=new fabric.Path(pressureInkPath(node),{fill:color,stroke:null,strokeWidth:0});
      }else if(node.points.length===1){
        const point=node.points[0];
        object=new fabric.Circle({radius:width/2,left:point.x,top:point.y,
          originX:'center',originY:'center',fill:color,stroke:null});
      }else if(node.penStyle==='brush'){
        const segments=node.points.slice(1).map((point,index)=>{
          const prior=node.points[index],pressure=Math.max(0,Math.min(1,
            ((prior.p??.5)+(point.p??.5))/2));
          return new fabric.Path(`M ${finite(prior.x)} ${finite(prior.y)} L ${finite(point.x)} ${finite(point.y)}`,{
            fill:null,stroke:color,strokeWidth:width*(.35+.9*pressure),
            strokeLineCap:'round',strokeLineJoin:'round'});
        });
        object=new fabric.Group(segments);
      }else object=new fabric.Path(smoothInkSVG(node.points,finite),{
        fill:null,stroke:color,strokeWidth:width,
        strokeLineCap:'round',strokeLineJoin:'round'});
      object.set({globalCompositeOperation:node.blendMode==='multiply'?'multiply':'source-over'});
      object.set({lockScalingX:true,lockScalingY:true,lockSkewingX:true,lockSkewingY:true});
    }else if(node.type==='material'){
      // The production image queue can resolve a screen-sized variant before
      // Fabric decodes it. A plain URL remains valid for local/static assets.
      const url=await assetURL(node.assetID,node);
      if(!url)throw Error('素材图片尚未准备好：'+node.assetID);
      object=await fabric.FabricImage.fromURL(url,{crossOrigin:'anonymous'});
      if(node.tapeStrip){
        const source=object.getElement(),resolution=Math.min(2,4096/Math.max(node.width,node.height)),
          bitmap=document.createElement('canvas');
        bitmap.width=Math.max(1,Math.round(node.width*resolution));
        bitmap.height=Math.max(1,Math.round(node.height*resolution));
        const context=bitmap.getContext('2d');
        context.scale(resolution,resolution);
        context.translate(node.width/2,node.height/2);
        paintTapeStrip(context,node,source);
        object=new fabric.FabricImage(bitmap,{originX:'center',originY:'center',
          left:finite(node.x),top:finite(node.y),
          scaleX:node.width/bitmap.width,scaleY:node.height/bitmap.height,
          flipX:!!node.isFlippedHorizontally,
          lockSkewingX:true,lockSkewingY:true,
          lockScalingX:true,lockScalingY:true});
        if(node.vectorMask)object.clipPath=clipPath(maskGeometry(node.vectorMask),
          object.width,object.height);
      }else{
      const naturalWidth=positive(object.width),naturalHeight=positive(object.height);
      const crop=node.cropRect||{x:0,y:0,width:1,height:1};
      object.set({cropX:finite(crop.x)*naturalWidth,cropY:finite(crop.y)*naturalHeight,
        width:positive(crop.width)*naturalWidth,height:positive(crop.height)*naturalHeight,
        scaleX:positive(node.width)/(positive(crop.width)*naturalWidth),
        scaleY:positive(node.height)/(positive(crop.height)*naturalHeight),
        originX:'center',originY:'center',left:finite(node.x),top:finite(node.y),
        flipX:!!node.isFlippedHorizontally,
        lockSkewingX:true,lockSkewingY:true});
      const material=node.materialMask&&maskGeometry(materialMaskGeometry(node.materialMask));
      const vector=node.vectorMask&&maskGeometry(node.vectorMask);
      if(material||vector)object.clipPath=clipPath(material&&vector?
        geometryIntersection(material,vector):material||vector,object.width,object.height);
      }
    }else throw Error('不支持的 Scene 图层：'+node.type);
    if(node.type==='shape'&&node.vectorMask)object.clipPath=clipPath(maskGeometry(node.vectorMask),
      object.sceneFrameWidth,object.sceneFrameHeight,object.scenePaintInsets?{leftOffset:(object.scenePaintInsets.left-object.scenePaintInsets.right)/2,topOffset:(object.scenePaintInsets.top-object.scenePaintInsets.bottom)/2}:{});
    object.set({angle:finite(node.rotation),opacity:finite(node.opacity,1),
      selectable:node.type!=='ink'&&!node.locked&&!node.isLocked&&
        !(node.type==='group'&&containsLocked(node.children)),
      evented:node.type!=='ink'&&!node.locked&&!node.isLocked&&
        !(node.type==='group'&&containsLocked(node.children)),
      globalCompositeOperation:node.blendMode==='multiply'?'multiply':'source-over'});
    if(node.shadow)object.set({shadow:new fabric.Shadow({color:node.shadow.color,blur:node.shadow.blur,offsetX:node.shadow.offsetX,offsetY:node.shadow.offsetY})});
    if(node.type!=='ink')configureControls(object);
    object.sceneID=node.ownerID||node.id;
    object.sceneRenderKey=node.renderKey||node.id;
    object.sceneType=node.type;
    if(node.type==='ink')object.sceneInkMatrix=object.calcTransformMatrix();
    return object;
  }

  function proposeObject(node,object){
    if(!node||node.id!==object?.sceneID||node.type!==object?.sceneType)
      throw Error('画布对象与 Scene 图层身份不一致');
    if(node.locked||node.isLocked||node.type==='group'&&containsLocked(node.children))
      throw Error('锁定图层或组合不能修改');
    if(node.type==='group'){
      const before=object.sceneGroupPose;
      if(!before)throw Error('组合缺少上一次画布位置');
      const center=object.getCenterPoint(),angle=finite(object.angle),delta=angle-before.angle;
      if(node.localTransform){
        if(Math.abs(positive(object.scaleX)-1)>1e-6||Math.abs(positive(object.scaleY)-1)>1e-6)
          throw Error('局部组合不能缩放实体素材；请编辑数字子图层');
        const move=multiplyMatrix(rigidMatrix(center.x,center.y,delta),rigidMatrix(-before.center.x,-before.center.y));
        node.localTransform=assertRigidMatrix(multiplyMatrix(move,node.localTransform));
      }else transformChildren(node.children,before.center,center,delta,
        positive(object.scaleX),positive(object.scaleY),before.angle);
      node.opacity=object.opacity??1;
      return node;
    }
    const center=object.getCenterPoint();
    if(node.type==='ink'){
      if(Math.abs(object.scaleX-1)>1e-5||Math.abs(object.scaleY-1)>1e-5)
        throw Error('笔迹暂不能缩放');
      const before=object.sceneInkMatrix;
      if(!before)throw Error('笔迹缺少上一次画布位置');
      const after=object.calcTransformMatrix();
      const delta=fabric.util.multiplyTransformMatrices(after,fabric.util.invertTransform(before));
      node.points=node.points.map(point=>{
        const moved=fabric.util.transformPoint(new fabric.Point(point.x,point.y),delta);
        return {...point,x:moved.x,y:moved.y};
      });
      node.layoutRotation=(node.layoutRotation||0)+matrixAngle(delta);
    }else{
      const textChanged=node.type==='text'&&object.text!==node.content;
      const textFrame=node.type==='text'?
        (object.sceneTextFrameHeight||node.height)*object.scaleY:null;
      if(node.type==='text'){
        const offset=(textFrame-object.height*object.scaleY)/2;
        const angle=finite(object.angle)*Math.PI/180;
        node.x=center.x-Math.sin(angle)*offset;
        node.y=center.y+Math.cos(angle)*offset;
      }else{node.x=center.x;node.y=center.y;if(node.type==='shape'&&object.scenePaintInsets){const p=object.scenePaintInsets,a=finite(object.angle)*Math.PI/180,dx=(p.right-p.left)*object.scaleX/2,dy=(p.bottom-p.top)*object.scaleY/2;node.x-=dx*Math.cos(a)-dy*Math.sin(a);node.y-=dx*Math.sin(a)+dy*Math.cos(a);}}
      const previousWidth=node.width,previousHeight=node.height;
      node.width=(node.type==='text'?(textChanged?node.width:node.width*object.width/(object.sceneNativeTextWidth||object.width)):node.type==='shape'?object.sceneFrameWidth:object.width)*object.scaleX;
      node.height=node.type==='text'?textFrame:
        (node.type==='shape'?object.sceneFrameHeight:object.height)*object.scaleY;
      node.rotation=object.angle||0;
      if(node.type==='material'&&
        (Math.abs(node.width-previousWidth)>1e-5||Math.abs(node.height-previousHeight)>1e-5)){
        // Visual permission and provenance are applied by the shared kernel.
      }
      if(node.type==='text'){
        // The bottom-right grip scales the whole text object. Persist its
        // typography along with its frame; a side grip only changes reflow.
        const sx=positive(object.scaleX),sy=positive(object.scaleY);
        if(Math.abs(sx-sy)<.02&&Math.abs(sx-1)>.001)scaleTextEffects(node,sx);
        if(Math.abs(sx-sy)<.02&&Math.abs(sx-1)>.001)
          for(const field of ['fontSize','fixedLineHeight','lineHeight','lineSpacing',
            'additionalLineSpacing','paragraphSpacing','letterSpacing','curveHeight'])
            if(Number.isFinite(node[field]))node[field]*=sx;
        node.content=object.text;
        if(node.textLayout){node.textLayout={...node.textLayout,minimumHeight:node.textLayout.minimumHeight*object.scaleY};}
        // Keep composition/caret state in Fabric; canonical reflow is committed below.
      }
      if(node.type==='material')node.isFlippedHorizontally=!!object.flipX;
    }
    node.opacity=object.opacity??1;
    return node;
  }


  function applyObject(page,object,{policy,confirm}={}){
    requireScenePolicy(policy);
    const node=findSceneNode(page,object?.sceneID);
    if(!node)throw Error('画布图层不存在');
    const proposal=proposeObject(structuredClone(node),object),changes=[],resized=[];
    const collect=(before,after)=>{
      const values={};
      for(const key of new Set([...Object.keys(before),...Object.keys(after)])){
        if(['children','manualVisualResize','manualVisualCopy','userOverrideFlags'].includes(key))continue;
        if(JSON.stringify(before[key])!==JSON.stringify(after[key]))values[key]=after[key];
      }
      if(before.type==='material'&&(Math.abs(before.width-after.width)>1e-6||Math.abs(before.height-after.height)>1e-6))resized.push(before);
      if(Object.keys(values).length)changes.push({id:before.id,values});
      if(before.children)before.children.forEach((child,i)=>collect(child,after.children[i]));
    };
    collect(node,proposal);
    if(node.type==='text'&&changes.some(change=>change.id===node.id)&&page.physicalPageHeightMM>0){
      const change=changes.find(change=>change.id===node.id),angle=proposal.rotation*Math.PI/180;
      const top={x:proposal.x+Math.sin(angle)*proposal.height/2,y:proposal.y-Math.cos(angle)*proposal.height/2};
      const scale=page.canvas.height/page.physicalPageHeightMM;
      // The visual control explicitly anchors the top of a text frame. Reflow
      // and positioning still run through the SAME kernel used by AI place.
      change.place={reference:'page',unit:'mm',at:[top.x/scale,top.y/scale],anchor:'top-center',rotationDeg:proposal.rotation,rotationSpace:'page'};
    }
    let confirmation;
    if(resized.length){
      if(policy!==USER_SCENE_POLICY||confirm?.({capability:'material.visualResize',targets:resized.map(n=>n.id),message:'改变这些实体素材的显示尺寸？这只调整作品中的视觉大小，不改变真实来源尺寸或库存。'})!==true)throw Object.assign(Error('已取消素材显示尺寸调整'),{code:'EDIT_CONFIRMATION_REQUIRED'});
      confirmation=confirmSceneCapability(resized,'material.visualResize');
    }
    applyScenePatchBatch(page,changes,{policy,confirmation,linked:'offset'});
    if(node.type==='group')object.sceneGroupPose={center:object.getCenterPoint(),angle:finite(object.angle)};
    if(node.type==='ink')object.sceneInkMatrix=object.calcTransformMatrix();
    if(node.type==='text'){
      object.sceneTextFrameHeight=node.height/positive(object.scaleY);object.sceneNativeTextWidth=object.width;
      object.sceneTextNode=node;
      if(node.vectorMask)object.clipPath=clipPath(maskGeometry(node.vectorMask),object.width,object.sceneTextFrameHeight,{topOffset:(object.sceneTextFrameHeight-object.height)/2});
    }
    return node;
  }
  return {fromNode,applyObject};
}

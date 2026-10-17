import {shapeSVG,textFont,textFontFamily,textLineHeight,drawSceneText} from './editor-tools-model.js';
import {materialMaskGeometry} from './material-mask.js';
import {geometryIntersection} from './craft-topology.js';
import {validateVectorMask} from './scene-v2.js';
import {smoothInkSVG} from './ink-path-geometry.js';
import {pressureInkPath} from './pressure-ink.js';
import {sceneDisplaySiblings} from './craft-display.js';
import {configureFabricEditorFrame} from './fabric-editor-frame.js';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const positive=(value,fallback=1)=>Number.isFinite(value)&&value>0?value:fallback;
const ringPath=(points,width,height)=>points.map(([x,y],index)=>
  `${index?'L':'M'} ${(x-.5)*width} ${(y-.5)*height}`).join(' ')+' Z';

// Fabric is the interactive projection. Scene v2 remains the persisted source
// of truth, so an editor change never replaces the physical-data contract.
export function createFabricSceneBridge(fabric,{assetURL=()=>null,canvasSize=()=>null}={}){
  const configureControls=object=>configureFabricEditorFrame(fabric,object);
  const maskGeometry=mask=>[[mask.outer,...(mask.holes||[])]];
  const clipPath=(geometry,width,height,{page=false,topOffset=0}={})=>{
    // A compound path keeps openings transparent. Fabric recenters Path data
    // around its own bounds, so place that center back in the Scene frame.
    if(!geometry.length)return new fabric.Path('M 0 0',{fill:'black',stroke:null});
    const points=geometry.flat(2),xs=points.map(point=>point[0]),ys=points.map(point=>point[1]);
    const centerX=(Math.min(...xs)+Math.max(...xs))/2;
    const centerY=(Math.min(...ys)+Math.max(...ys))/2;
    const path=geometry.flatMap(polygon=>polygon.map(ring=>ringPath(ring,width,height))).join(' ');
    return new fabric.Path(path,{originX:'center',originY:'center',
      left:(centerX-(page?0:.5))*width,
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
            child.manualVisualResize=true;
          }
          child.rotation=Math.atan2(widthAxis.y,widthAxis.x)*180/Math.PI;
          child.userOverrideFlags=[...new Set([...(child.userOverrideFlags||[]),'moved',
            ...(child.manualVisualResize?['resized']:[])])];
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
      object.sceneFrameWidth=positive(options.viewBoxWidth||options.width);
      object.sceneFrameHeight=positive(options.viewBoxHeight||options.height);
      object.set({originX:'center',originY:'center',left:finite(node.x),top:finite(node.y),
        scaleX:positive(node.width)/object.sceneFrameWidth,
        scaleY:positive(node.height)/object.sceneFrameHeight});
    }else if(node.type==='text'){
      await globalThis.document?.fonts?.load(textFont(node),String(node.content||'示例'));
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
      object.sceneTextFrameHeight=frameHeight;
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
      if(node.penStyle==='pressure'){
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
    }else throw Error('不支持的 Scene 图层：'+node.type);
    if(node.type==='shape'&&node.vectorMask)object.clipPath=clipPath(maskGeometry(node.vectorMask),
      object.sceneFrameWidth,object.sceneFrameHeight);
    object.set({angle:finite(node.rotation),opacity:finite(node.opacity,1),
      selectable:node.type!=='ink'&&!node.locked&&!node.isLocked&&
        !(node.type==='group'&&containsLocked(node.children)),
      evented:node.type!=='ink'&&!node.locked&&!node.isLocked&&
        !(node.type==='group'&&containsLocked(node.children)),
      globalCompositeOperation:node.blendMode==='multiply'?'multiply':'source-over'});
    if(node.type!=='ink')configureControls(object);
    object.sceneID=node.ownerID||node.id;
    object.sceneRenderKey=node.renderKey||node.id;
    object.sceneType=node.type;
    if(node.type==='ink')object.sceneInkMatrix=object.calcTransformMatrix();
    return object;
  }

  function applyObject(node,object){
    if(!node||node.id!==object?.sceneID||node.type!==object?.sceneType)
      throw Error('画布对象与 Scene 图层身份不一致');
    if(node.locked||node.isLocked||node.type==='group'&&containsLocked(node.children))
      throw Error('锁定图层或组合不能修改');
    if(node.type==='group'){
      const before=object.sceneGroupPose;
      if(!before)throw Error('组合缺少上一次画布位置');
      const center=object.getCenterPoint(),angle=finite(object.angle),delta=angle-before.angle;
      transformChildren(node.children,before.center,center,delta,
        positive(object.scaleX),positive(object.scaleY),before.angle);
      object.sceneGroupPose={center,angle};
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
      object.sceneInkMatrix=after;
    }else{
      const textChanged=node.type==='text'&&object.text!==node.content;
      const textFrame=node.type==='text'?
        Math.max(object.sceneTextFrameHeight||node.height,textChanged?object.height:0)*object.scaleY:null;
      if(node.type==='text'){
        const offset=(textFrame-object.height*object.scaleY)/2;
        const angle=finite(object.angle)*Math.PI/180;
        node.x=center.x-Math.sin(angle)*offset;
        node.y=center.y+Math.cos(angle)*offset;
      }else{node.x=center.x;node.y=center.y;}
      const previousWidth=node.width,previousHeight=node.height;
      node.width=(node.type==='shape'?object.sceneFrameWidth:object.width)*object.scaleX;
      node.height=node.type==='text'?textFrame:
        (node.type==='shape'?object.sceneFrameHeight:object.height)*object.scaleY;
      node.rotation=object.angle||0;
      if(node.type==='material'&&
        (Math.abs(node.width-previousWidth)>1e-5||Math.abs(node.height-previousHeight)>1e-5)){
        node.manualVisualResize=true;
        node.userOverrideFlags=[...new Set([...(node.userOverrideFlags||[]),'resized'])];
      }
      if(node.type==='text'){
        // The bottom-right grip scales the whole text object. Persist its
        // typography along with its frame; a side grip only changes reflow.
        const sx=positive(object.scaleX),sy=positive(object.scaleY);
        if(Math.abs(sx-sy)<.02&&Math.abs(sx-1)>.001)
          for(const field of ['fontSize','fixedLineHeight','lineHeight','lineSpacing',
            'additionalLineSpacing','paragraphSpacing','letterSpacing','curveHeight'])
            if(Number.isFinite(node[field]))node[field]*=sx;
        node.content=object.text;
        object.sceneTextFrameHeight=textFrame/object.scaleY;
        if(node.vectorMask)object.clipPath=clipPath(maskGeometry(node.vectorMask),
          object.width,object.sceneTextFrameHeight,
          {topOffset:(object.sceneTextFrameHeight-object.height)/2});
      }
      if(node.type==='material')node.isFlippedHorizontally=!!object.flipX;
    }
    node.opacity=object.opacity??1;
    return node;
  }

  return {fromNode,applyObject};
}

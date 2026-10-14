import {shapeSVG,textFont,textFontFamily,textLineHeight,textLines} from './editor-tools-model.js';
import {materialMaskGeometry} from './material-mask.js';
import {smoothInkSVG} from './ink-path-geometry.js';
import {pressureInkPath} from './pressure-ink.js';

const finite=(value,fallback=0)=>Number.isFinite(value)?value:fallback;
const positive=(value,fallback=1)=>Number.isFinite(value)&&value>0?value:fallback;
const ringPath=(points,width,height)=>points.map(([x,y],index)=>
  `${index?'L':'M'} ${(x-.5)*width} ${(y-.5)*height}`).join(' ')+' Z';

// Fabric is the interactive projection. Scene v2 remains the persisted source
// of truth, so an editor change never replaces the physical-data contract.
export function createFabricSceneBridge(fabric,{assetURL=()=>null}={}){
  class SceneTextbox extends fabric.Textbox{
    _render(ctx){
      if(this.isEditing||!this.sceneTextNode){super._render(ctx);return;}
      // The canonical renderer and the interactive view share one text layout.
      // Fabric's native text metrics still power cursor movement while editing.
      const node={...this.sceneTextNode,content:this.text};
      ctx.save();
      ctx.fillStyle=node.color||'#30463d';
      ctx.font=textFont(node);
      ctx.letterSpacing=(node.letterSpacing||0)+'px';
      ctx.textAlign=node.alignment||'left';
      ctx.textBaseline='alphabetic';
      const left=ctx.textAlign==='center'?0:ctx.textAlign==='right'?node.width/2:-node.width/2;
      for(const line of textLines(node,value=>ctx.measureText(value).width).lines){
        const y=-this.height/2+node.fontSize+line.y;
        ctx.fillText(line.text,left,y);
        if(node.underline||node.strikethrough){
          const length=ctx.measureText(line.text).width;
          const x=ctx.textAlign==='center'?-length/2:ctx.textAlign==='right'?node.width/2-length:-node.width/2;
          ctx.strokeStyle=node.color;ctx.lineWidth=Math.max(1,node.fontSize/18);
          for(const offset of [node.underline?2:null,node.strikethrough?-node.fontSize*.35:null].filter(value=>value!==null)){
            ctx.beginPath();ctx.moveTo(x,y+offset);ctx.lineTo(x+length,y+offset);ctx.stroke();
          }
        }
      }
      ctx.restore();
    }
  }
  const transformChildren=(children,from,to,rotation)=>{
    const theta=rotation*Math.PI/180,cos=Math.cos(theta),sin=Math.sin(theta);
    const move=(x,y)=>({x:to.x+(x-from.x)*cos-(y-from.y)*sin,
      y:to.y+(x-from.x)*sin+(y-from.y)*cos});
    for(const child of children||[]){
      if(child.type==='group')transformChildren(child.children,from,to,rotation);
      else if(child.type==='ink')child.points=(child.points||[]).map(point=>({...point,...move(point.x,point.y)}));
      else{
        const position=move(child.x,child.y);
        child.x=position.x;child.y=position.y;
        child.rotation=finite(child.rotation)+rotation;
      }
    }
  };
  async function fromNode(node){
    if(!node||node.hidden||node.isHidden||node.isParked||node.parked)return null;
    if(node.vectorMask)throw Error('Fabric 画布尚未支持该图层的矢量蒙版：'+node.id);
    if(node.type==='group'){
      const children=(await Promise.all((node.children||[]).map(fromNode))).filter(Boolean);
      if(!children.length)return null;
      const group=new fabric.Group(children,{opacity:finite(node.opacity,1),
        globalCompositeOperation:node.blendMode==='multiply'?'multiply':'source-over'});
      group.sceneID=node.id;group.sceneType='group';
      group.sceneGroupPose={center:group.getCenterPoint(),angle:group.angle||0};
      // A Scene group contains real materials. Its gesture may move and rotate
      // the children, but resizing would silently change physical inventory.
      group.set({lockScalingX:true,lockScalingY:true,
        selectable:!node.locked&&!node.isLocked,evented:!node.locked&&!node.isLocked});
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
    }else if(node.type==='ink'){
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
      const url=assetURL(node.assetID,node);
      if(!url)throw Error('素材图片尚未准备好：'+node.assetID);
      object=await fabric.FabricImage.fromURL(url,{crossOrigin:'anonymous'});
      const naturalWidth=positive(object.width),naturalHeight=positive(object.height);
      const crop=node.cropRect||{x:0,y:0,width:1,height:1};
      object.set({cropX:finite(crop.x)*naturalWidth,cropY:finite(crop.y)*naturalHeight,
        width:positive(crop.width)*naturalWidth,height:positive(crop.height)*naturalHeight,
        scaleX:positive(node.width)/(positive(crop.width)*naturalWidth),
        scaleY:positive(node.height)/(positive(crop.height)*naturalHeight),
        originX:'center',originY:'center',left:finite(node.x),top:finite(node.y),
        flipX:!!node.isFlippedHorizontally,lockScalingX:true,lockScalingY:true,
        lockSkewingX:true,lockSkewingY:true});
      if(node.materialMask){
        const geometry=materialMaskGeometry(node.materialMask);
        const path=[ringPath(geometry.outer,object.width,object.height),
          ...geometry.holes.map(ring=>ringPath(ring,object.width,object.height))].join(' ');
        object.clipPath=new fabric.Path(path,{originX:'center',originY:'center',
          fill:'black',fillRule:geometry.holes.length?'evenodd':'nonzero'});
      }
    }else throw Error('不支持的 Scene 图层：'+node.type);
    object.set({angle:finite(node.rotation),opacity:finite(node.opacity,1),
      selectable:!node.locked&&!node.isLocked,evented:!node.locked&&!node.isLocked,
      globalCompositeOperation:node.blendMode==='multiply'?'multiply':'source-over'});
    object.sceneID=node.id;object.sceneType=node.type;
    if(node.type==='ink')object.sceneInkMatrix=object.calcTransformMatrix();
    return object;
  }

  function applyObject(node,object){
    if(!node||node.id!==object?.sceneID||node.type!==object?.sceneType)
      throw Error('画布对象与 Scene 图层身份不一致');
    if(node.type==='group'){
      const before=object.sceneGroupPose;
      if(!before)throw Error('组合缺少上一次画布位置');
      if(Math.abs(object.scaleX-1)>1e-5||Math.abs(object.scaleY-1)>1e-5)
        throw Error('包含实物素材的组合不能缩放');
      const center=object.getCenterPoint(),angle=finite(object.angle),delta=angle-before.angle;
      transformChildren(node.children,before.center,center,delta);
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
      if(node.type==='material'&&(Math.abs(object.scaleX-positive(node.width)/positive(object.width))>1e-5||
        Math.abs(object.scaleY-positive(node.height)/positive(object.height))>1e-5))
        throw Error('实物素材不能通过画布控件缩放');
      const textChanged=node.type==='text'&&object.text!==node.content;
      const textFrame=node.type==='text'?
        Math.max(object.sceneTextFrameHeight||node.height,textChanged?object.height:0)*object.scaleY:null;
      if(node.type==='text'){
        const offset=(textFrame-object.height*object.scaleY)/2;
        const angle=finite(object.angle)*Math.PI/180;
        node.x=center.x-Math.sin(angle)*offset;
        node.y=center.y+Math.cos(angle)*offset;
      }else{node.x=center.x;node.y=center.y;}
      node.width=(node.type==='shape'?object.sceneFrameWidth:object.width)*object.scaleX;
      node.height=node.type==='text'?textFrame:
        (node.type==='shape'?object.sceneFrameHeight:object.height)*object.scaleY;
      node.rotation=object.angle||0;
      if(node.type==='text'){
        node.content=object.text;
        object.sceneTextFrameHeight=textFrame/object.scaleY;
      }
      if(node.type==='material')node.isFlippedHorizontally=!!object.flipX;
    }
    node.opacity=object.opacity??1;
    return node;
  }

  return {fromNode,applyObject};
}

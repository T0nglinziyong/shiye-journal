import {detachSceneLayout} from './scene-layout.js';
import {creationReferenceBox} from './creation-placement.js';
import {spatialPath,worldBox,setWorldPosition} from './scene-spatial.js';

// A deterministic geometry pass; never resize or clone physical materials.
export function arrangeCreationNodes(page,ids,rule,container){
 if(rule.behavior&&rule.behavior!=='once')throw Error('自动排列目前只接受 once；持续跟随请使用 place.behavior=linked');
 if(ids.length<2||new Set(ids).size!==ids.length)throw Error('排列需要至少两个不同图层');
 const paths=ids.map(id=>spatialPath(page.layers,id));
 if(paths.some(path=>!path))throw Error('排列对象不存在');
 const parent=paths[0].ancestors.at(-1)?.id||null;
 if(paths.some(path=>(path.ancestors.at(-1)?.id||null)!==parent))throw Error('自动排列需要同级对象，请先组合或重设父级');
 if(paths.some(path=>[...path.ancestors,path.node].some(node=>node.isLocked||node.locked)))throw Error('不能排列锁定对象');
 const ref=creationReferenceBox(page,container,parent),factor=page.canvas.height/page.physicalPageHeightMM;
 if(container.startsWith('node:')&&ids.includes(container.slice(5)))throw Error('排列容器不能同时是排列对象');
 const boxes=ids.map(id=>worldBox(page,id)).map(box=>{const a=(box.rotation-ref.rotation)*Math.PI/180,c=Math.abs(Math.cos(a)),s=Math.abs(Math.sin(a));return {...box,fw:box.w*c+box.h*s,fh:box.w*s+box.h*c};});
 const gap=rule.gapMm*factor,align=rule.align||'center',fraction={start:0,center:.5,end:1}[align];
 if(!Number.isFinite(gap)||gap<0||fraction===undefined)throw Error('排列间距或对齐无效');
 const positions=[];let width,height;
 if(rule.direction==='horizontal'||rule.direction==='vertical'){
  const horizontal=rule.direction==='horizontal';
  const length=boxes.reduce((sum,b)=>sum+(horizontal?b.fw:b.fh),0)+gap*(boxes.length-1);
  const cross=Math.max(...boxes.map(b=>horizontal?b.fh:b.fw));
  width=horizontal?length:cross;height=horizontal?cross:length;
  let cursor=0;
  for(const b of boxes){positions.push(horizontal?[cursor+b.fw/2,(cross-b.fh)*fraction+b.fh/2]:[(cross-b.fw)*fraction+b.fw/2,cursor+b.fh/2]);cursor+=(horizontal?b.fw:b.fh)+gap;}
 }else if(rule.direction==='grid'){
  const columns=Math.min(rule.columns,boxes.length);if(!Number.isInteger(columns)||columns<1)throw Error('网格 columns 必须是正整数');
  const rows=Math.ceil(boxes.length/columns),cw=Math.max(...boxes.map(b=>b.fw)),ch=Math.max(...boxes.map(b=>b.fh));
  width=columns*cw+(columns-1)*gap;height=rows*ch+(rows-1)*gap;
  boxes.forEach((b,i)=>positions.push([(i%columns)*(cw+gap)+(cw-b.fw)*fraction+b.fw/2,Math.floor(i/columns)*(ch+gap)+(ch-b.fh)*fraction+b.fh/2]));
 }else throw Error('排列方向无效');
 if(width>ref.w+1e-7||height>ref.h+1e-7)throw Object.assign(Error('排列超出容器；减少间距、改用网格或增大布局框，不能缩放实体素材。'),{code:'LAYOUT_OVERFLOW'});
 const a=ref.rotation*Math.PI/180,c=Math.cos(a),s=Math.sin(a);
 for(const [i,[px,py]] of positions.entries()){
  const x=-ref.w/2+(ref.w-width)*fraction+px,y=-ref.h/2+(ref.h-height)*fraction+py;
  detachSceneLayout(page,ids[i],'place');
  setWorldPosition(page,ids[i],{x:ref.cx+c*x-s*y,y:ref.cy+s*x+c*y,rotation:boxes[i].rotation});
 }
 return ids;
}

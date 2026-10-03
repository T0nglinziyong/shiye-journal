import './material-anatomy.css';
import {assetSourceRevision,assetVisualDescriptor,createMaterialAnatomy,readMaterialRegions,validateRegion} from './material-anatomy.js';
import {craftDigest} from './craft-fingerprint.js';
import {craftAssert} from './craft-errors.js';

const NAMES={pattern:'图案',text:'印刷词句',texture:'纹理',blank:'空白区',focal:'主体',edge:'边饰'};
const SVG='http://www.w3.org/2000/svg';
export function mountMaterialAnatomy(c,asset,controls,tabs){
 const before=structuredClone(asset),sourceRevision=assetSourceRevision(before),valid=readMaterialRegions(before);
 let regions=structuredClone(valid),dirty=false,selected=null,points=[],drag=null,mode='rectangle';
 const abort=new AbortController(),panel=document.createElement('div');panel.className='material-info-panel material-anatomy-panel';panel.hidden=true;
 panel.innerHTML='<p>标出值得取用的图案、印刷词句或纹理。只有明确确认的区域会进入 AI 任务；矩形标注不等于沿图案轮廓。</p><p class="anatomy-source-note"></p><div class="anatomy-stage"></div><div class="anatomy-draw-controls"><button type="button" class="btn" data-anatomy-mode="rectangle">画矩形区域</button><button type="button" class="btn" data-anatomy-mode="polygon">沿轮廓点选</button><button type="button" class="btn" data-anatomy-finish>结束轮廓</button><button type="button" class="btn" data-anatomy-new>新区域</button></div><div class="anatomy-region-list"></div><label>区域名称<input data-anatomy-name maxlength="120" placeholder="例如：左上标题、叶片、格纹"></label><label>区域类型<select data-anatomy-kind></select></label><div class="anatomy-dimensions"><label>左 mm<input data-anatomy-x type="number" min="0" step="0.1"></label><label>上 mm<input data-anatomy-y type="number" min="0" step="0.1"></label><label>宽 mm<input data-anatomy-w type="number" min="0.1" step="0.1"></label><label>高 mm<input data-anatomy-h type="number" min="0.1" step="0.1"></label></div><label class="anatomy-protect"><input type="checkbox" data-anatomy-preserve>保护这个区域，不让 AI 切断主体或文字</label><div class="actions"><button type="button" class="btn primary" data-anatomy-confirm>确认区域</button><button type="button" class="btn danger" data-anatomy-delete>删除所选区域</button></div><p class="anatomy-error" role="status"></p>';
 const stage=panel.querySelector('.anatomy-stage');stage.innerHTML=c.imgTag(asset);
 const image=stage.querySelector('img');if(image)image.alt='素材区域标注';
 const width=before.physicalWidthMM,height=before.physicalHeightMM,calibrated=Number.isFinite(width)&&width>0&&Number.isFinite(height)&&height>0;
 stage.style.aspectRatio=calibrated?String(width/height):'1';
 const svg=document.createElementNS(SVG,'svg');svg.setAttribute('viewBox','0 0 1 1');svg.setAttribute('preserveAspectRatio','none');svg.setAttribute('aria-label','在素材原图上标注区域');stage.append(svg);
 const kind=panel.querySelector('[data-anatomy-kind]');for(const [value,label] of Object.entries(NAMES)){const o=document.createElement('option');o.value=value;o.textContent=label;kind.append(o);}
 const field=key=>panel.querySelector('[data-anatomy-'+key+']');
 const message=value=>panel.querySelector('.anatomy-error').textContent=value;
 const note=panel.querySelector('.anatomy-source-note');note.textContent=!calibrated?'请先保存素材的真实毫米尺寸，再进行区域标注。':before.anatomy&&!valid.length&&before.anatomy.regions?.length?'旧标注的图像或标定版本已变化；本次不将旧框直接作为可靠区域。':'区域将与当前图像、尺寸和来源版本绑定。';
 function setBounds(bounds){if(!calibrated)return;for(const [key,value] of [['x',bounds[0]*width],['y',bounds[1]*height],['w',bounds[2]*width],['h',bounds[3]*height]])field(key).value=Number(value.toFixed(3));}
 function draw(){
  svg.replaceChildren();
  const outline=(coords,active=false)=>{const shape=document.createElementNS(SVG,'polygon');shape.setAttribute('points',coords.map(p=>p.join(',')).join(' '));shape.setAttribute('class',active?'anatomy-outline active':'anatomy-outline');shape.setAttribute('vector-effect','non-scaling-stroke');svg.append(shape);};
  for(const r of regions){const [x,y,w,h]=r.boundsRatio;outline(r.outlineRatio||[[x,y],[x+w,y],[x+w,y+h],[x,y+h]],r.id===selected);}
  if(points.length)outline(points,true);
  const list=panel.querySelector('.anatomy-region-list');list.replaceChildren();
  for(const r of regions){const button=document.createElement('button');button.type='button';button.className='btn'+(r.id===selected?' primary':'');button.textContent=(r.label||NAMES[r.kind])+' · '+(r.status==='confirmed'?'已确认':'待确认');button.onclick=()=>{selected=r.id;points=r.outlineRatio?structuredClone(r.outlineRatio):[];field('name').value=r.label;kind.value=r.kind;field('preserve').checked=!!r.preserve;setBounds(r.boundsRatio);draw();};list.append(button);}
  field('delete').disabled=!selected;
  for(const button of panel.querySelectorAll('[data-anatomy-mode]'))button.setAttribute('aria-pressed',String(mode===button.dataset.anatomyMode));
 }
 const reset=()=>{selected=null;points=[];field('name').value='';field('preserve').checked=false;for(const key of ['x','y','w','h'])field(key).value='';message('');draw();};
 field('new').onclick=reset;
 field('delete').onclick=()=>{regions=regions.filter(r=>r.id!==selected);dirty=true;reset();};
 for(const button of panel.querySelectorAll('[data-anatomy-mode]'))button.onclick=()=>{mode=button.dataset.anatomyMode;reset();};
 const position=event=>{const r=svg.getBoundingClientRect();return [Math.max(0,Math.min(1,(event.clientX-r.left)/r.width)),Math.max(0,Math.min(1,(event.clientY-r.top)/r.height))];};
 const boundsOf=pts=>{const xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys);return [x,y,Math.max(...xs)-x,Math.max(...ys)-y];};
 svg.addEventListener('pointerdown',event=>{
  if(!calibrated)return;event.preventDefault();message('');const p=position(event);
  if(mode==='polygon'){if(points.length>=128){message('轮廓最多 128 点');return;}points.push(p);if(points.length>=2)setBounds(boundsOf(points));draw();}
  else{drag=p;points=[p,p,p,p];svg.setPointerCapture?.(event.pointerId);draw();}
 },{signal:abort.signal});
 svg.addEventListener('pointermove',event=>{if(!drag)return;const p=position(event),x=Math.min(p[0],drag[0]),y=Math.min(p[1],drag[1]),w=Math.abs(p[0]-drag[0]),h=Math.abs(p[1]-drag[1]);points=[[x,y],[x+w,y],[x+w,y+h],[x,y+h]];setBounds([x,y,w,h]);draw();},{signal:abort.signal});
 for(const type of ['pointerup','pointercancel'])svg.addEventListener(type,()=>{drag=null;},{signal:abort.signal});
 field('finish').onclick=()=>{if(points.length<3){message('沿轮廓至少需要三个点');return;}setBounds(boundsOf(points));message('轮廓已结束；请核对名称与范围，再点击确认区域。');};
 for(const key of ['x','y','w','h'])field(key).oninput=()=>{points=[];};
 field('confirm').onclick=()=>{
  try{
   craftAssert(calibrated,'MISSING_CALIBRATION','请先确认毫米尺寸');
   craftAssert(assetSourceRevision(c.state.assets.find(a=>a.id===asset.id)||asset)===sourceRevision,'STALE_REGION_SOURCE','素材已经变化，请关闭后重新打开标注');
   const bounds=[Number(field('x').value)/width,Number(field('y').value)/height,Number(field('w').value)/width,Number(field('h').value)/height];
   const region={id:selected||'region-'+crypto.randomUUID(),kind:kind.value,label:field('name').value.trim(),boundsRatio:bounds,outlineRatio:mode==='polygon'&&points.length>=3?structuredClone(points):null,status:'confirmed',provenance:'user',preserve:field('preserve').checked};
   validateRegion(region);craftAssert(regions.length<32||selected,'REGION_BUDGET','每件素材最多 32 个区域');
   regions=regions.filter(r=>r.id!==region.id).concat(region);selected=region.id;dirty=true;draw();message('已确认，保存素材后生效。');
  }catch(error){message(error.message);}
 };
 controls.append(panel);
 const tab=document.createElement('button');tab.type='button';tab.textContent='可取用区域';tab.onclick=()=>{for(const button of tabs.children)button.classList.toggle('selected',button===tab);for(const pane of controls.querySelectorAll('.material-info-panel'))pane.hidden=pane!==panel;};tabs.append(tab);draw();
 return {
  panel,
  commit(next){
   const current=c.state.assets.find(a=>a.id===asset.id)||asset;
   craftAssert(assetSourceRevision(current)===sourceRevision,'STALE_REGION_SOURCE','素材在编辑期间发生变化，请重新打开后保存');
   const visualSame=craftDigest(assetVisualDescriptor(before))===craftDigest(assetVisualDescriptor(next));
   if(dirty){craftAssert(visualSame,'STALE_REGION_SOURCE','请先保存新尺寸或图像，再重新确认区域');return createMaterialAnatomy(next,regions);}
   if(before.anatomy&&visualSame&&before.anatomy.sourceRevision===sourceRevision)return createMaterialAnatomy(next,regions);
   return before.anatomy?structuredClone(before.anatomy):undefined;
  },
  dispose(){abort.abort();}
 };
}

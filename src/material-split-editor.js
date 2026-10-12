import {splitMaterialInDraft,splitMaterialRegions} from './material-split.js';
import {onDialogClosed} from './dialog-lifecycle.js';

const clamp=v=>Math.max(0,Math.min(1,v));
export function showMaterialSplitEditor(c,item,{onBack}={}){
 const {body,modal,asset,imgTag,current,checkpoint,saveProject,render,toast}=c;
 const source=asset(item.assetID);if(!source)return;
 let mode='vertical',position=.5,points=[],from=null,to=null,dragging=false;
 body.innerHTML='<section class="material-split-editor">'+
   '<header><button type="button" id="split-back">返回加工</button><h2>分割素材</h2><button type="button" class="btn primary" id="split-confirm">确认分割</button></header>'+
   '<p class="split-explain">分割为两个独立图层，共用同一素材和实物编号；移除其中一片后会进入「备选素材」。</p>'+
   '<div class="split-options" role="group" aria-label="分割方式">'+
   [['vertical','垂直切割'],['horizontal','水平切割'],['line','自由直线'],['lasso','套索分割']].map(([key,title])=>
     '<button type="button" data-split-mode="'+key+'" '+(key===mode?'aria-pressed="true"':'aria-pressed="false"')+'>'+title+'</button>').join('')+
   '</div><div class="split-image-wrap"><canvas id="split-source" aria-label="按所选方式划出两个裁片"></canvas>'+
   '<svg id="split-overlay" viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">'+
   '<path id="split-shape" fill="#52634b26" stroke="#52634b" stroke-width=".008" vector-effect="non-scaling-stroke"/></svg></div>'+
   '<label class="split-position">切割位置 <output id="split-position-value">50%</output><input id="split-position" type="range" min="5" max="95" value="50"></label>'+
   '<div class="split-actions"><button type="button" class="btn" id="split-redraw">重新画线</button><span id="split-status" role="status"></span></div>'+
   '<p class="split-note">默认两片都放在当前画布，可独立移动、旋转。复杂套索需要得到两个连通裁片。</p></section>';
 const canvas=body.querySelector('#split-source'),ctx=canvas.getContext('2d'),overlay=body.querySelector('#split-overlay'),
  shape=body.querySelector('#split-shape'),pos=body.querySelector('#split-position'),posValue=body.querySelector('#split-position-value'),
  status=body.querySelector('#split-status'),image=new Image();
 const sourceCrop=item.cropRect||{x:0,y:0,width:1,height:1};
 const renderPreview=()=>{
   if(!image.naturalWidth)return;
   const w=Math.max(1,Math.round(image.naturalWidth*sourceCrop.width)),
    h=Math.max(1,Math.round(image.naturalHeight*sourceCrop.height));
   canvas.width=w;canvas.height=h;
   ctx.drawImage(image,sourceCrop.x*image.naturalWidth,sourceCrop.y*image.naturalHeight,
     sourceCrop.width*image.naturalWidth,sourceCrop.height*image.naturalHeight,0,0,w,h);
 };
 const imgHost=document.createElement('div');imgHost.innerHTML=imgTag(source);const img=imgHost.querySelector('img');
 image.onload=renderPreview;image.onerror=()=>status.textContent='图片尚未加载，请等待后重试';
 if(img?.src)image.src=img.src;
 const currentSpec=()=>{
  if(mode==='vertical'||mode==='horizontal')return {mode,position};
  if(mode==='line')return {mode,from,to};
  return {mode,points};
 };
 const outline=()=>{
   status.textContent='';
   pos.parentElement.hidden=!['vertical','horizontal'].includes(mode);
   let path='';
   if(mode==='vertical')path='M '+position+' 0 L '+position+' 1';
   if(mode==='horizontal')path='M 0 '+position+' L 1 '+position;
   if(mode==='line'&&from)path='M '+from.join(' ')+' L '+(to||from).join(' ');
   if(mode==='lasso'&&points.length)path='M '+points.map(p=>p.join(' ')).join(' L ')+(dragging?'':' Z');
   shape.setAttribute('d',path);
   body.querySelectorAll('[data-split-mode]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.splitMode===mode)));
 };
 body.querySelectorAll('[data-split-mode]').forEach(b=>b.onclick=()=>{mode=b.dataset.splitMode;points=[];from=to=null;outline();});
 pos.oninput=()=>{position=Number(pos.value)/100;posValue.value=pos.value+'%';outline();};
 const point=e=>{const box=canvas.getBoundingClientRect();return [
   clamp((e.clientX-box.left)/box.width),clamp((e.clientY-box.top)/box.height)]};
 overlay.style.touchAction='none';
 overlay.onpointerdown=e=>{
   if(!['line','lasso'].includes(mode))return;
   e.preventDefault();overlay.setPointerCapture(e.pointerId);dragging=true;
   const p=point(e);if(mode==='line'){from=p;to=p;}else points=[p];
   outline();
 };
 overlay.onpointermove=e=>{
   if(!dragging)return;
   const p=point(e);
   if(mode==='line')to=p;
   else if(points.length<128&&Math.hypot(p[0]-points.at(-1)[0],p[1]-points.at(-1)[1])>.012)points.push(p);
   outline();
 };
 const release=()=>{dragging=false;outline();};
 overlay.onpointerup=release;overlay.onpointercancel=release;
 body.querySelector('#split-redraw').onclick=()=>{points=[];from=to=null;dragging=false;outline();};
 body.querySelector('#split-back').onclick=()=>onBack?onBack():modal.close();
 body.querySelector('#split-confirm').onclick=()=>{
   try{
     const draft=current(),spec=currentSpec();
     splitMaterialRegions(item,source,spec); // validate before mutation
     checkpoint();const copies=splitMaterialInDraft(draft,source,item.id,spec);
     saveProject();modal.close();render();toast?.('已分割为两个独立裁片，可分别拖动；删除会转入备选');
     c.state.selected=copies[0].id;
   }catch(error){status.textContent=error.message||'无法完成分割';}
 };
 modal.classList.add('material-split-dialog');
 onDialogClosed(modal,()=>modal.classList.remove('material-split-dialog'));
 if(!modal.open)modal.showModal();
 outline();
}

// A template node is a relationship and a replaceable role, not just a pixel box.
// Reference boxes are measured on the 630 × 900 study image; output is in mm.
export const D146_REFERENCE_PX=[630,900];
export const D146_PAGE_MM=[110,157];

export const D146_NODES={
 'page':{parent:null,box:[0,0,630,900],role:'canvas',accepts:['page-color'],fit:'none'},
 'dark-top':{parent:'page',box:[22,34,385,421],role:'backing-paper',accepts:['plain-paper','generated-paper'],fit:'crop-or-mask'},
 'dark-bottom':{parent:'page',box:[194,556,595,875],role:'backing-paper',accepts:['plain-paper','generated-paper'],fit:'crop-or-mask'},
 'yellow-top':{parent:'page',box:[230,86,559,294],role:'contrast-paper',accepts:['plain-paper','generated-paper'],fit:'crop-or-mask'},
 'main-paper':{parent:'page',box:[69,158,486,793],role:'writing-field',accepts:['light-paper','generated-paper'],fit:'crop-or-mask'},
 'gray-dot-paper':{parent:'main-paper',box:[14,461,348,747],role:'side-pattern-paper',accepts:['pattern-paper','generated-paper'],fit:'crop-or-mask'},
 'bottom-writing':{parent:'main-paper',box:[85,555,355,793],role:'lower-writing-field',accepts:['light-paper','generated-paper'],fit:'crop-or-mask'},
 'yellow-number-bar':{parent:'main-paper',box:[132,428,212,603],role:'numeral-backing',accepts:['plain-paper','generated-paper'],fit:'crop-or-mask'},
 'top-one':{parent:'yellow-top',box:[379,80,457,225],role:'large-numeral',value:'1',accepts:['number-material','editable-text'],fit:'complete-or-text'},
 'top-four':{parent:'yellow-top',box:[446,180,541,380],role:'large-numeral',value:'4',accepts:['number-material','editable-text'],fit:'complete-or-text'},
 'bottom-one':{parent:'yellow-number-bar',box:[99,425,205,608],role:'large-numeral',value:'1',accepts:['number-material','editable-text'],fit:'complete-or-text'},
 'stamp-frame':{parent:'main-paper',box:[317,598,554,776],role:'accent-card-frame',accepts:['graphic','generated-paper'],fit:'digital'},
 'stamp-border':{parent:'stamp-frame',box:[345,622,529,749],role:'accent-card-border',accepts:['graphic'],fit:'digital'},
 'stamp-material':{parent:'stamp-frame',box:[317,598,554,776],role:'accent-card-content',accepts:['small-card','sticker','editable-text'],fit:'complete-or-fallback'},
 'stamp-word':{parent:'stamp-frame',box:[337,641,535,735],role:'accent-card-text',accepts:['editable-text'],fit:'reflow'},
 'top-clip':{parent:'yellow-top',box:[217,115,278,205],role:'edge-connector',accepts:['clip-sticker','graphic'],fit:'complete-or-fallback'},
 'clip-ring':{parent:'top-clip',box:[226,117,272,161],role:'clip-part',accepts:['graphic'],fit:'digital'},
 'clip-body':{parent:'top-clip',box:[227,148,271,188],role:'clip-part',accepts:['graphic'],fit:'digital'},
 'arc-left':{parent:'main-paper',box:[69,158,207,359],role:'printed-line',accepts:['line-sticker','graphic'],fit:'complete-or-graphic'},
 'arc-right':{parent:'main-paper',box:[365,338,483,570],role:'printed-line',accepts:['line-sticker','graphic'],fit:'complete-or-graphic'},
 'q1':{parent:'main-paper',box:[120,218,195,253],role:'section-number',accepts:['editable-text','number-material'],fit:'text-or-complete'},
 'q1-head':{parent:'main-paper',box:[188,239,386,269],role:'section-heading',accepts:['editable-text','label-sticker'],fit:'text-or-complete'},
 'q1-body':{parent:'main-paper',box:[190,270,432,335],role:'body-text',accepts:['editable-text'],fit:'reflow'},
 'q2':{parent:'main-paper',box:[255,334,330,371],role:'section-number',accepts:['editable-text','number-material'],fit:'text-or-complete'},
 'q2-head':{parent:'main-paper',box:[313,352,479,384],role:'section-heading',accepts:['editable-text','label-sticker'],fit:'text-or-complete'},
 'q2-body':{parent:'main-paper',box:[214,407,456,471],role:'body-text',accepts:['editable-text'],fit:'reflow'},
 'q3':{parent:'bottom-writing',box:[117,599,192,636],role:'section-number',accepts:['editable-text','number-material'],fit:'text-or-complete'},
 'q3-head':{parent:'bottom-writing',box:[184,613,344,645],role:'section-heading',accepts:['editable-text','label-sticker'],fit:'text-or-complete'},
 'q3-body':{parent:'bottom-writing',box:[184,649,316,741],role:'body-text',accepts:['editable-text'],fit:'reflow'},
 'star-left':{parent:'main-paper',box:[126,190,152,216],role:'balance-accent',accepts:['star','dot','flower','small-sticker'],fit:'complete-or-graphic'},
 'star-mid':{parent:'main-paper',box:[234,383,255,408],role:'balance-accent',accepts:['star','dot','flower','small-sticker'],fit:'complete-or-graphic'},
 'star-right':{parent:'main-paper',box:[421,462,453,495],role:'balance-accent',accepts:['star','dot','flower','small-sticker'],fit:'complete-or-graphic'},
 'star-bottom':{parent:'bottom-writing',box:[188,742,212,776],role:'balance-accent',accepts:['star','dot','flower','small-sticker'],fit:'complete-or-graphic'},
 'arrow-q1':{parent:'main-paper',box:[173,337,221,373],role:'section-connector',accepts:['arrow-sticker','graphic'],fit:'complete-or-graphic'},
 'arrow-q2':{parent:'main-paper',box:[356,469,391,556],role:'section-connector',accepts:['arrow-sticker','graphic'],fit:'complete-or-graphic'}
};

export const D146_SLOT_DEFAULTS={
 page:{color:'#F7F5F0'},'dark-top':{color:'#171D2A'},'dark-bottom':{color:'#171D2A'},
 'yellow-top':{color:'#F0C51E'},'main-paper':{color:'#F3F0E9'},
 'gray-dot-paper':{color:'#B8BBC5'},'bottom-writing':{color:'#E8E2D7'},
 'yellow-number-bar':{color:'#F0C51E'},'stamp-frame':{color:'#8BD2E8'},
 'stamp-border':{color:'#171D2A'},'stamp-material':{text:'BEAUTIFUL\nTHINGS'},'stamp-word':{text:'BEAUTIFUL\nTHINGS'},
 'top-clip':{kind:'graphic-clip'},'clip-ring':{color:'#B8BBC5'},'clip-body':{color:'#B8BBC5'},
 'arc-left':{color:'#1D2027'},'arc-right':{color:'#1D2027'},
 'arrow-q1':{color:'#1D2027'},'arrow-q2':{color:'#1D2027'},
 'top-one':{value:'1'},'top-four':{value:'4'},'bottom-one':{value:'1'},
 q1:{text:'Q1'},q2:{text:'Q2'},q3:{text:'Q3'},
 'q1-head':{text:'今日成果：'},'q2-head':{text:'今日惊喜：'},'q3-head':{text:'今日目标：'},
 'q1-body':{text:'搁置的事有了进展。\n也记下沿路的小发现。'},
 'q2-body':{text:'路上的颜色亮了起来。\n把心情留给今天。'},
 'q3-body':{text:'□ 收好物件\n□ 留点时间\n□ 慢慢走'},
 'star-left':{kind:'star'},'star-mid':{kind:'star'},'star-right':{kind:'star'},'star-bottom':{kind:'star'}
};

const pxFromMm=(v,axis)=>v*D146_REFERENCE_PX[axis]/D146_PAGE_MM[axis];
const rectSize=box=>[box[2]-box[0],box[3]-box[1]];
export function resolveD146Graph({overrides={}}={}){
 const cache=new Map();
 function resolve(id){
  if(cache.has(id))return cache.get(id);
  const node=D146_NODES[id];if(!node)throw new RangeError(`未知的 D146 模板节点：${id}`);
  let box=[...node.box];
  if(node.parent){
   const parent=D146_NODES[node.parent],p=resolve(node.parent),[pw,ph]=rectSize(parent.box),[rw,rh]=rectSize(p);
   box=[p[0]+(node.box[0]-parent.box[0])*rw/pw,p[1]+(node.box[1]-parent.box[1])*rh/ph,p[0]+(node.box[2]-parent.box[0])*rw/pw,p[1]+(node.box[3]-parent.box[1])*rh/ph];
  }
  const o=overrides[id]||{};
  if(o.scale!==undefined){
   const [sx,sy]=Array.isArray(o.scale)?o.scale:[o.scale,o.scale];
   if(!(sx>0&&sy>0&&sx<=3&&sy<=3))throw new RangeError(`模板节点 ${id} 的缩放无效`);
   const cx=(box[0]+box[2])/2,cy=(box[1]+box[3])/2,w=(box[2]-box[0])*sx,h=(box[3]-box[1])*sy;
   box=[cx-w/2,cy-h/2,cx+w/2,cy+h/2];
  }
  if(o.shiftMm){const [dx,dy]=o.shiftMm;box=[box[0]+pxFromMm(dx,0),box[1]+pxFromMm(dy,1),box[2]+pxFromMm(dx,0),box[3]+pxFromMm(dy,1)];}
  cache.set(id,box);return box;
 }
 const boxes=Object.fromEntries(Object.keys(D146_NODES).map(id=>[id,resolve(id)]));
 const slots=Object.fromEntries(Object.entries(D146_NODES).map(([id,node])=>{
  const w=(boxes[id][2]-boxes[id][0])*110/630,h=(boxes[id][3]-boxes[id][1])*157/900;
  const factor=node.role.includes('paper')||node.role==='writing-field'||node.role==='lower-writing-field'?[.6,2]:node.role==='large-numeral'?[.6,1.2]:[.5,1.25];
  return [id,{parent:node.parent,role:node.role,accepts:node.accepts,fit:node.fit,defaultValue:D146_SLOT_DEFAULTS[id]||{},visibleSizeMm:[w,h],inputSizeRangeMm:{width:[w*factor[0],w*factor[1]],height:[h*factor[0],h*factor[1]]}}];
 }));
 return {boxes,slots,pageMm:D146_PAGE_MM};
}

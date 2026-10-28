// Mutable preset slots displayed in the editor context toolbar. Selecting a
// slot activates it; tapping the active slot edits it without adding buttons.
const defaults={
  pen:{width:[2,4,9],color:['#2b5245','#009cff','#ff3348']},
  highlighter:{width:[2,4,9],color:['#2b5245','#009cff','#ff3348']},
  eraser:{width:[8,20,40]}
};
const keyFor=(mode,kind)=>mode+(kind==='width'?'WidthSlots':'ColorSlots');
const idxKey=(mode,kind)=>mode+(kind==='width'?'WidthSlot':'ColorSlot');
const bound=(mode,kind,value)=>{
  if(kind==='color')return /^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
  const n=Number(value);return Number.isFinite(n)?Math.max(mode==='eraser'?6:1,Math.min(mode==='eraser'?80:20,n)):null;
};
export function ensureInkSlots(prefs){
  for(const [mode,values] of Object.entries(defaults)){
    for(const [kind,original] of Object.entries(values)){
      const key=keyFor(mode,kind),indexKey=idxKey(mode,kind);
      if(!Array.isArray(prefs[key])||prefs[key].length!==3){
        const slots=[...original],selectedValue=kind==='width'?
          prefs[mode==='highlighter'?'markerWidth':mode==='pen'?'penWidth':'eraserWidth']:
          prefs[mode==='highlighter'?'markerColor':'penColor'];
        const exact=slots.findIndex(x=>x===selectedValue);
        if(exact<0){const v=bound(mode,kind,selectedValue);if(v!==null)slots[1]=v;}
        prefs[key]=slots;prefs[indexKey]=exact>=0?exact:1;
      }else{
        prefs[key]=prefs[key].map((x,i)=>bound(mode,kind,x)??original[i]);
        prefs[indexKey]=Math.max(0,Math.min(2,Number(prefs[indexKey])||0));
      }
    }
  }
  return prefs;
}
export function inkSlot(prefs,mode,kind,index){
  ensureInkSlots(prefs);return prefs[keyFor(mode,kind)][index];
}
export function activeInkSlot(prefs,mode,kind){
  ensureInkSlots(prefs);return prefs[idxKey(mode,kind)];
}
export function selectInkSlot(prefs,mode,kind,index){
  ensureInkSlots(prefs);
  if(!Number.isInteger(index)||index<0||index>2)throw Error('工具栏预设编号无效');
  prefs[idxKey(mode,kind)]=index;
  const value=prefs[keyFor(mode,kind)][index];
  const target=kind==='color'?(mode==='highlighter'?'markerColor':'penColor'):(mode==='highlighter'?'markerWidth':mode==='pen'?'penWidth':'eraserWidth');
  prefs[target]=value;
  if(mode==='eraser'){prefs.eraserStyle='fine';prefs.wholeStroke=false;}
  return value;
}
export function editInkSlot(prefs,mode,kind,index,value){
  ensureInkSlots(prefs);
  const normalized=bound(mode,kind,value);
  if(normalized===null)throw Error('无效的笔刷参数');
  prefs[keyFor(mode,kind)][index]=normalized;
  selectInkSlot(prefs,mode,kind,index);
  return normalized;
}

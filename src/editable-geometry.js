const point=value=>Array.isArray(value)&&value.length===2&&value.every(number=>Number.isFinite(number)&&number>=0&&number<=1);
const path=value=>Array.isArray(value)&&value.length>=2&&value.length<=512&&value.every(point);
const paths=value=>Array.isArray(value)&&value.length>=1&&value.length<=48&&value.every(path);
const rect=value=>Array.isArray(value)&&value.length===4&&value.every(number=>Number.isFinite(number)&&number>=0&&number<=1)&&value[2]>0&&value[3]>0&&value[0]+value[2]<=1&&value[1]+value[3]<=1;
export function parseEditableGeometry(text,kind){
  let value;try{value=JSON.parse(text);}catch{throw Error('图形坐标不是有效 JSON');}
  if(kind==='paths'){
    if(!paths(value))throw Error('自由图形须为多条路径，每条至少两个 0–1 坐标点');
  }else if(kind==='layers'){
    if(!Array.isArray(value)||!value.length||value.length>64||value.some(layer=>!layer||typeof layer!=='object'||(layer.fill!==null&&!/^#[0-9a-f]{6}$/i.test(layer.fill||''))||!Number.isFinite(layer.opacity??1)||(layer.opacity??1)<0||(layer.opacity??1)>1||(layer.paths!==undefined&&(!Array.isArray(layer.paths)||!layer.paths.every(path)))||(layer.rects!==undefined&&(!Array.isArray(layer.rects)||!layer.rects.every(rect)))||(!layer.paths?.length&&!layer.rects?.length)))throw Error('多色图形须为有效色层和 0–1 坐标路径');
  }else throw Error('未知图形几何类型');
  return value;
}

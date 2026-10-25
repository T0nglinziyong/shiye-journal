// One set of bounded controls is shared by the editor, Scene and GPT commands.
export const shapeOptionFields=Object.freeze({
  rows:{label:'行数',type:'integer',min:1,max:16},columns:{label:'列数',type:'integer',min:1,max:16},
  showOuterBorder:{label:'显示外边框',type:'boolean'},showInnerLines:{label:'显示内部线',type:'boolean'},
  showInnerBorder:{label:'显示内边框',type:'boolean'},
  showHeader:{label:'显示表头',type:'boolean'},showMarkers:{label:'显示打卡点',type:'boolean'},
  spacing:{label:'间距',type:'number',min:4,max:60},dotSize:{label:'点大小',type:'number',min:.5,max:8},
  angle:{label:'倾斜角度',type:'number',min:-75,max:75},
  depth:{label:'凹口／波幅',type:'number',min:.02,max:.35},
  count:{label:'重复数量',type:'integer',min:2,max:32},
  tailPosition:{label:'尾巴位置',type:'number',min:.15,max:.85},
  radius:{label:'圆角程度',type:'number',min:0,max:.3},
  clipGap:{label:'内圈宽度',type:'number',min:.12,max:.36},
  innerLength:{label:'内圈长度',type:'number',min:.3,max:.72}
});
const fields={
  grid:['rows','columns','showOuterBorder'],dots:['rows','columns','dotSize','showOuterBorder'],
  stripes:['rows','columns','angle','showOuterBorder'],
  linedNote:['rows','showOuterBorder','showInnerLines'],
  checklistTable:['rows','showOuterBorder','showInnerLines','showMarkers'],
  weeklyTable:['rows','columns','showOuterBorder','showInnerLines','showHeader'],
  habitTracker:['rows','columns','showOuterBorder','showInnerLines','showMarkers'],
  calendarTable:['rows','columns','showOuterBorder','showInnerLines','showHeader'],
  ribbon:['depth'],tag:['depth','radius'],bubble:['tailPosition','depth','radius'],
  chevron:['depth'],burst:['count','depth'],scallop:['count','depth'],
  wave:['count','depth'],zigzag:['count','depth'],ticket:['depth','radius'],
  postage:['count','depth'],washi:['count','depth'],bracket:['depth'],
  paperclip:['clipGap','innerLength'],
  postageFrame:['count','depth','showInnerBorder'],ticketFrame:['depth','radius','showInnerBorder']
};
const defaults={rows:5,columns:7,showOuterBorder:true,showInnerLines:true,showInnerBorder:true,
  showHeader:true,showMarkers:true,spacing:18,dotSize:1.5,angle:45,
  depth:.12,count:8,tailPosition:.25,radius:.04,clipGap:.22,innerLength:.62};
const overrides={grid:{rows:6,columns:8},dots:{rows:6,columns:8},stripes:{rows:6,columns:8},linedNote:{rows:6},weeklyTable:{rows:3},habitTracker:{rows:5},calendarTable:{rows:6},
  wave:{count:4},zigzag:{count:5},burst:{count:16,depth:.12},scallop:{count:10,depth:.04},
  postage:{count:18,depth:.055},postageFrame:{count:10,depth:.055},
  ticketFrame:{depth:.12,radius:.04},washi:{count:10,depth:.08}};
const labels={
  ribbon:{depth:'燕尾切口'},tag:{depth:'尖端长度',radius:'左端圆角'},
  bubble:{tailPosition:'尾巴位置',depth:'尾巴宽度',radius:'框角圆度'},
  chevron:{depth:'折角深度'},burst:{count:'尖角数量',depth:'尖角深度'},
  scallop:{count:'花边数量',depth:'花边起伏'},wave:{count:'波浪数量',depth:'波浪幅度'},
  zigzag:{count:'折角数量',depth:'折角幅度'},ticket:{depth:'票根凹口',radius:'外角圆度'},
  postage:{count:'齿边数量',depth:'齿边深度'},washi:{count:'撕口数量',depth:'撕口深度'},
  bracket:{depth:'括号开口'},
  postageFrame:{count:'齿边数量',depth:'齿边深度'},
  ticketFrame:{depth:'票根凹口',radius:'外角圆度'}
};
export const advancedShapeOptionKinds=Object.freeze(Object.keys(fields));
export function advancedShapeControls(kind){return (fields[kind]||[]).map(key=>({key,...shapeOptionFields[key],label:labels[kind]?.[key]||shapeOptionFields[key].label}));}
export function resolvedShapeOptions(kind,provided={}){
  const allowed=fields[kind];if(!allowed){if(provided&&Object.keys(provided).length)throw Error('该图形不支持高级参数');return {};}
  if(!provided||typeof provided!=='object'||Array.isArray(provided))throw Error('图形参数应为对象');
  const result={...defaults,...overrides[kind]};
  for(const [key,value] of Object.entries(provided)){
    // Former pattern spacing is accepted in saved scenes; repeat counts now
    // determine density so resizing cannot add dots or stripes either.
    if(!allowed.includes(key)&&!(['grid','dots','stripes'].includes(kind)&&key==='spacing'))throw Error('该图形不支持参数：'+key);
    const field=shapeOptionFields[key];
    if(field.type==='boolean'){
      if(typeof value!=='boolean')throw Error('图形参数需为布尔值：'+key);
    }else if(!Number.isFinite(value)||value<field.min||value>field.max||field.type==='integer'&&!Number.isInteger(value))throw Error('图形参数超出范围：'+key);
    result[key]=value;
  }
  return result;
}
export function validateShapeOptions(kind,options){resolvedShapeOptions(kind,options);return true;}
// Changing the number of cells adds/removes space at the same cell pitch.
// Resizing the shape itself leaves shapeOptions alone and scales that pitch.
export function shapeRepeatCountPatch(shape,key,count){
  if(!['rows','columns','count'].includes(key)||!advancedShapeControls(shape.kind).some(control=>control.key===key))
    throw Error('该图形没有可调整的重复数量：'+key);
  const options=resolvedShapeOptions(shape.kind,shape.shapeOptions||{});
  const next={...shape.shapeOptions,[key]:count};
  let oldCount=options[key];
  if(['grid','dots','stripes'].includes(shape.kind)&&!Object.hasOwn(shape.shapeOptions||{},'rows')&&
      !Object.hasOwn(shape.shapeOptions||{},'columns')){
    // A grid with no saved counts is rendered with the current defaults.
    const rows=options.rows,columns=options.columns;
    oldCount=key==='rows'?rows:columns;
    next.rows=key==='rows'?count:rows;
    next.columns=key==='columns'?count:columns;
    delete next.spacing;
  }
  validateShapeOptions(shape.kind,next);
  if(key==='count'){
    // Horizontal motifs grow in length; washi teeth repeat vertically.
    // Perimeter and radial motifs retain their approximate tooth/lobe pitch.
    const axes=shape.kind==='washi'?['height']:
      ['wave','zigzag'].includes(shape.kind)?['width']:['width','height'];
    return {shapeOptions:next,...Object.fromEntries(axes.map(axis=>[axis,shape[axis]*count/oldCount]))};
  }
  const dimension=key==='rows'?'height':'width';
  return {shapeOptions:next,[dimension]:shape[dimension]*count/oldCount};
}
export const shapeOptionsJSONSchema={type:'object',additionalProperties:false,properties:Object.fromEntries(
  Object.entries(shapeOptionFields).map(([key,field])=>[key,field.type==='boolean'?{type:'boolean'}:
    {type:field.type,minimum:field.min,maximum:field.max}]))};

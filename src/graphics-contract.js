// Geometry utilities are read-only computations, not new Scene operations.
// Shared placement, geometry and paint vocabulary stays identical to Commands.
import {creationCommonDefinitions} from './creation-command-spec.js';
const obj=(properties,required=[])=>({type:'object',properties,required,additionalProperties:false});
const number=(minimum,maximum)=>({type:'number',minimum,maximum});
const enumeration=(...values)=>({enum:values});
const ref=name=>({$ref:'#/$defs/'+name});
export const graphicsRequestSchema={
 $schema:'https://json-schema.org/draft/2020-12/schema',
 ...obj({version:{const:1},operation:enumeration('rough','smooth','simplify','flatten','boolean','stroke','measure'),
  id:{type:'string',pattern:'^[A-Za-z][A-Za-z0-9._-]{0,47}$'},geometry:ref('GraphicGeometry'),operand:ref('GraphicGeometry'),
  size:obj({width:number(.1,500),height:number(.1,500),unit:{const:'mm'}},['width','height','unit']),
  place:ref('Place'),parent:ref('Id'),order:ref('Order'),
  style:obj({fill:creationCommonDefinitions.Style.properties.fill,stroke:creationCommonDefinitions.Style.properties.stroke,
   strokeWidthMm:number(.01,10),opacity:number(0,1)}),
  seed:{type:'integer',minimum:1,maximum:2147483646},
  options:obj({roughness:number(0,3),bowing:number(0,4),fillStyle:enumeration('solid','hachure','cross-hatch','dots','dashed','zigzag'),
   hachureGapMm:number(.5,30),hachureAngle:number(-180,180),fillWeightMm:number(.05,3),
   method:enumeration('continuous','catmull-rom'),factor:number(0,1),toleranceMm:number(.05,5),
   mode:enumeration('unite','intersect','subtract','exclude'),thinning:number(-1,1),smoothing:number(0,1),streamline:number(0,1)})
 },['version','operation','geometry','size']),
 $defs:creationCommonDefinitions
};
export const graphicsHelp=Object.freeze({
 version:1,readOnly:true,engines:{rough:'roughjs@4.6.6',paths:'paper@0.12.18',stroke:'perfect-freehand@1.2.3'},
 operations:{rough:'按固定 seed 手绘化；支持斜线/交叉线/点状填充。',smooth:'平滑路径，不改变控制点数量。',simplify:'按毫米误差简化曲线。',flatten:'按毫米误差将曲线变为折线。',boolean:'闭合区域的并/交/差/异或；不消耗真实材料。',stroke:'压力点转数字笔画轮廓；不代替原有可编辑压力点。',measure:'只读边界、长度、面积；不是视觉质量判断。'},
 input:'graphics work/graphics.json；geometry/place/style 与普通 Command 共用；计算尺寸为固定 mm，不推断位置或用途。',
 output:'output/graphics.json + output/graphics.svg；返回普通 group.compose/graphic.add 草稿。同时生成 work/graphics-result.commands.json，可直接 check/apply；多次计算请改 id 并保留需要的草稿。不自动修改 Scene。',
 limits:{requestBytes:150000,pathCharacters:12000,segments:800,outputPaths:64},
 example:{version:1,operation:'rough',id:'hand-star',geometry:{kind:'star'},size:{width:16,height:16,unit:'mm'},style:{fill:'#B8CCD2',stroke:'#486573',strokeWidthMm:.4},seed:42,options:{roughness:1.1,fillStyle:'hachure',hachureGapMm:1.8}}
});

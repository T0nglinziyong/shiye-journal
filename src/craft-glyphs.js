import opentype from 'opentype.js';
import {craftAssert} from './craft-errors.js';
import {normalizeGeometry,geometryUnion,geometryDifference,geometryBounds,transformGeometry,bridgeGeometry} from './craft-topology.js';

// Read a caller-provided font; return numeric outlines only. The font bytes
// and user text never leave this local function or enter a repository.
export function glyphCutGeometry(bytes,text,{fontSizeMM=12,toleranceMM=.025,bridges=[]}={}){
 craftAssert(bytes instanceof Uint8Array&&bytes.byteLength>0&&bytes.byteLength<=16_000_000,'INVALID_FONT','字体文件需小于 16 MB');
 craftAssert(typeof text==='string'&&Array.from(text).length>0&&Array.from(text).length<=32,'GLYPH_BUDGET','镂空文字需为 1–32 个字符');
 craftAssert(Number.isFinite(fontSizeMM)&&fontSizeMM>=2&&fontSizeMM<=100&&Number.isFinite(toleranceMM)&&toleranceMM>=.005&&toleranceMM<=.1,'INVALID_GLYPH_SIZE','字体毫米尺寸或轮廓精度无效');
 const font=opentype.parse(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
 for(const character of text)if(!/\s/u.test(character))craftAssert(font.charToGlyphIndex(character)!==0,'GLYPH_MISSING','所选字体缺少字符：'+character);
 const commands=font.getPath(text,0,0,fontSizeMM,{kerning:true}).commands;
 craftAssert(commands.length<=4096,'GLYPH_BUDGET','文字路径过于复杂');
 const rings=[];let ring=[],current=[0,0],points=0;
 const add=p=>{craftAssert(++points<=8192,'GLYPH_BUDGET','文字轮廓超过 8192 点');if(!ring.length||Math.hypot(p[0]-ring.at(-1)[0],p[1]-ring.at(-1)[1])>1e-9)ring.push(p);current=p;};
 const distance=(p,a,b)=>{const length=Math.hypot(b[0]-a[0],b[1]-a[1]);return length?Math.abs((b[0]-a[0])*(a[1]-p[1])-(a[0]-p[0])*(b[1]-a[1]))/length:Math.hypot(p[0]-a[0],p[1]-a[1]);};
 const midpoint=(a,b)=>[(a[0]+b[0])/2,(a[1]+b[1])/2];
 const curve=(p,depth=0)=>{
  if(Math.max(...p.slice(1,-1).map(x=>distance(x,p[0],p.at(-1))))<=toleranceMM){add(p.at(-1));return;}
  craftAssert(depth<16,'GLYPH_BUDGET','字体曲线无法在精度预算内展开');
  let levels=[p];while(levels.at(-1).length>1){const q=levels.at(-1);levels.push(q.slice(0,-1).map((a,i)=>midpoint(a,q[i+1])));}
  curve(levels.map(q=>q[0]),depth+1);curve(levels.map(q=>q.at(-1)).reverse(),depth+1);
 };
 const finish=()=>{if(ring.length>=3)rings.push(ring);ring=[];};
 for(const c of commands){
  if(c.type==='M'){finish();add([c.x,c.y]);}
  else if(c.type==='L')add([c.x,c.y]);
  else if(c.type==='Q')curve([current,[c.x1,c.y1],[c.x,c.y]]);
  else if(c.type==='C')curve([current,[c.x1,c.y1],[c.x2,c.y2],[c.x,c.y]]);
  else if(c.type==='Z')finish();else throw Error('字体路径包含不支持的指令');
 }
 finish();craftAssert(rings.length>0&&rings.length<=128,'GLYPH_BUDGET','字体没有可剪取轮廓或轮廓过多');
 // Even-odd contour composition retains enclosed counters irrespective of
 // each glyph's winding. Malformed/self-crossing outlines fail validation.
 let geometry=[];
 for(const r of rings){const g=normalizeGeometry([[r]]);geometry=geometryUnion(geometryDifference(geometry,g),geometryDifference(g,geometry));}
 const bounds=geometryBounds(geometry);geometry=transformGeometry(geometry,p=>[p[0]-bounds.x,p[1]-bounds.y]);
 craftAssert(Array.isArray(bridges)&&bridges.length<=32,'BRIDGE_BUDGET','文字模板最多 32 条连接桥');
 for(const b of bridges){craftAssert(b.widthMM>=.2&&b.widthMM<=5,'INVALID_BRIDGE','模板连接桥宽度为 0.2–5 mm');geometry=geometryDifference(geometry,bridgeGeometry(b.fromMM,b.toMM,b.widthMM));}
 return {version:1,units:'mm',text,fontSizeMM,toleranceMM,geometryMM:geometry,boundsMM:geometryBounds(geometry),note:'这是待移除的字形区域；放入素材后仍须核对连通性及余料，不包含字体文件'};
}

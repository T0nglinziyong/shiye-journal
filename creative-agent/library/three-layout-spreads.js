// The first image of each note contains a finished spread above a schematic.
// Boxes below were measured against the FINISHED pages, not the schematic's
// arbitrary colored placeholders. Coordinates are percentages of one B6 leaf;
// the desk, book edges, binding and surrounding background are excluded.
import {measuredBox} from './three-layout-source-measurements.js';
export const LAYOUT_LEAF_MM=Object.freeze([125,176]);
const spreadDefinitions=[
  {id:'XHS-满满当当',source:'https://xhslink.cn/o/Av5wQDKbeCT',pages:{left:'#F8F5E9',right:'#F8F5E9'},logic:'左页：上方粉色字纸被照片与大标题压住，下方照片叠横向横线纸；右页：上粉下黄两块密集文字，照片与贴纸穿插。',slots:[
    ['L-upper-note','left','paper',[10,22,49,58],1,{fill:'#F2E6E7',pattern:'grid'}],
    ['L-lower-note','left','paper',[24,53,93,88],1,{fill:'#DCE1E5',pattern:'ruled'}],
    ['L-upper-photo','left','photo',[47,10,81,42],3,{subject:'food-drink'}],
    ['L-lower-photo','left','photo',[8,58,46,85],3,{subject:'food-drink'}],
    ['L-upper-writing','left','body',[14,25,46,55],5],
    ['L-lower-writing','left','body',[53,57,90,85],5],
    ['L-upper-title','left','title',[14,13,60,20],7,{fontSizePt:23}],
    ['L-upper-title-second','left','title',[29,17,61,26],7,{fontSizePt:23}],
    ['L-upper-sticker','left','sticker',[74,29,96,49],8,{motif:'doodle-animal'}],
    ['L-mid-strip','left','strip',[48,50,90,54],8,{fill:'#E8DB83'}],
    ['L-mid-strip-text','left','micro',[53,50,87,54],9],
    ['L-bottom-caption','left','micro',[19,84,69,93],9],
    ['L-lower-sticker','left','sticker',[33,78,41,86],9,{glyph:'✿',color:'#785F69',fontSizePt:14}],
    ['L-bottom-highlight','left','mark',[30,89,68,90],10,{fill:'#DDB57E'}],
    ['R-upper-grid','right','paper',[10,11,30,23],1,{fill:'#E7E9E6',pattern:'grid'}],
    ['R-upper-note','right','paper',[41,12,91,45],2,{fill:'#F0E0E3',pattern:'grid'}],
    ['R-lower-note','right','paper',[11,37,53,88],1,{fill:'#F3EDBB',pattern:'ruled'}],
    ['R-lower-grid','right','paper',[57,49,94,57],1,{fill:'#DDE9E7',pattern:'grid'}],
    ['R-upper-photo','right','photo',[15,18,50,37],3,{subject:'food-drink'}],
    ['R-lower-photo','right','photo',[53,53,87,84],3,{subject:'architecture'}],
    ['R-upper-writing','right','body',[51,15,89,41],5],
    ['R-lower-writing','right','body',[15,43,49,79],5],
    ['R-top-strip','right','strip',[12,10,67,14],7,{fill:'#EAD86F'}],
    ['R-top-strip-text','right','micro',[20,10,64,14],8],
    ['R-middle-word','right','word',[22,38,70,46],8,{fontSizePt:9.5}],
    ['R-lower-sticker','right','sticker',[33,72,65,85],9,{motif:'doodle-ghost-pair'}],
    ['R-milk-bottle','right','sticker',[80,69,93,84],9,{motif:'milk-bottle'}],
    ['R-photo-label','right','micro',[50,84,83,89],9],
    ['R-bottom-caption','right','micro',[15,79,52,90],9],
    ['R-edge-dot','right','accent',[10,11,13,14],10,{fill:'#DDAF78'}]
  ]},
  {id:'XHS-排版第四弹',source:'https://xhslink.cn/o/2aSUAVg618m',pages:{left:'#FAF7E7',right:'#FAF7E7'},logic:'左页上半是宽条纹书写区、左上咖啡贴纸和右侧照片，下半照片在左、正文在右；右页上粉下浅绿，两张照片均在右，字素横跨中缝。',slots:[
    ['L-upper-note','left','paper',[7,10,90,49],1,{fill:'#F5F1E7',pattern:'stripes'}],
    ['L-lower-card','left','paper',[7,59,39,88],1,{fill:'#F3D6D9'}],
    ['L-upper-photo','left','photo',[57,25,92,55],3,{subject:'stationery'}],
    ['L-lower-photo','left','photo',[8,73,52,88],3,{subject:'food-drink'}],
    ['L-upper-writing','left','body',[32,16,55,45],5],
    ['L-upper-writing-top','left','body',[49,15,55,27],5],
    ['L-lower-writing','left','body',[57,62,92,88],5],
    ['L-upper-title','left','word',[59,18,93,25],7,{fontSizePt:20.5,fontWeight:800}],
    ['L-upper-sticker','left','sticker',[4,11,31,28],8,{motif:'coffee-cup'}],
    ['L-middle-date','left','date',[25,55,45,61],7,{fontSizePt:17,fontWeight:700}],
    ['L-middle-arrow','left','word',[45,61,57,69],8,{fontSizePt:17}],
    ['L-lower-card-title','left','micro',[10,61,36,71],7,{fontSizePt:9.5,fontWeight:800}],
    ['L-lower-sticker','left','sticker',[3,76,20,89],8,{motif:'teddy-bear'}],
    ['L-lower-label','left','strip',[33,84,56,89],8,{fill:'#B8D6C6'}],
    ['L-lower-label-text','left','micro',[35,84,55,88],9],
    ['L-edge-star','left','accent',[35,70,41,76],9,{fill:'#A7BE89',kind:'ellipse'}],
    ['R-upper-note','right','paper',[10,14,81,51],1,{fill:'#F2DFE3'}],
    ['R-lower-note','right','paper',[11,58,94,90],1,{fill:'#DFEAD1',pattern:'grid'}],
    ['R-upper-photo','right','photo',[59,10,87,33],3,{subject:'flowers'}],
    ['R-lower-photo','right','photo',[50,58,86,83],3,{subject:'food-drink'}],
    ['R-upper-writing','right','body',[19,21,60,39],5],
    ['R-lower-writing','right','body',[15,56,45,86],5],
    ['R-mid-strip','right','strip',[35,73,50,77],8,{fill:'#66483A'}],
    ['R-mid-strip-text','right','micro',[37,73,50,77],9,{color:'#FFFFFF'}],
    ['R-mid-title','right','word',[15,42,89,49],8,{fontSizePt:10.5,fontWeight:700}],
    ['R-upper-label','right','micro',[14,10,61,20],8],
    ['R-upper-sticker','right','sticker',[52,26,65,36],9,{glyph:'♡',color:'#A98782',fontSizePt:18}],
    ['R-lower-label','right','micro',[50,81,87,90],8]
  ]},
  {id:'XHS-海岛排版',source:'https://xhslink.cn/o/90SsllAgMgl',pages:{left:'#F8F8EE',right:'#F8F8EE'},logic:'左页上方格纸加圆形书写纸，照片压在右边；下方照片在左、正文在右。右页上方淡蓝纸、下方浅灰纸是两层独立纸，照片与日期插在其间。',slots:[
    ['L-upper-grid','left','paper',[14,9,83,32],1,{fill:'#DFEBE0',pattern:'grid'}],
    ['L-circle-note','left','circle',[19,13,61,33],2,{fill:'#F5E7D5'}],
    ['L-upper-photo','left','photo',[62,23,91,52],4,{subject:'food-drink'}],
    ['L-lower-photo','left','photo',[17,68,60,92],4,{subject:'outdoors'}],
    ['L-circle-writing','left','body',[27,17,59,30],5],
    ['L-mid-writing','left','body',[15,45,46,65],5],
    ['L-lower-writing','left','body',[66,55,96,80],5],
    ['L-upper-title','left','word',[18,38,63,48],7,{fontSizePt:26,fontWeight:700,color:'#7D73A6',fillOpacity:0,outline:{color:'#7D73A6',widthMm:.32}}],
    ['L-mid-highlight','left','mark',[14,61,44,62],8,{fill:'#9BCBD3'}],
    ['L-mid-accent','left','accent',[54,54,65,65],9,{fill:'#93AF70',kind:'ellipse'}],
    ['L-upper-sticker','left','sticker',[77,40,85,48],9,{glyph:'✦',color:'#94AAA2',fontSizePt:16}],
    ['L-lower-tape','left','strip',[13,60,25,72],2,{fill:'#DCEAD8',pattern:'grid'}],
    ['L-photo-label','left','micro',[13,75,32,80],9,{fontSizePt:9,fontWeight:700}],
    ['L-bottom-caption-vellum','left','paper',[51,82,91,93],8,{fill:'#DCE6E2',opacity:.72}],
    ['L-bottom-caption','left','micro',[52,84,89,92],9,{fontSizePt:7.5,fontWeight:400}],
    ['R-blue-paper','right','paper',[10,11,52,49],1,{fill:'#DDEDF0'}],
    ['R-lower-paper','right','paper',[45,58,91,92],1,{fill:'#E8EDEE',pattern:'dots'}],
    ['R-top-photo','right','photo',[54,11,89,31],3,{subject:'flowers'}],
    ['R-middle-photo','right','photo',[16,49,50,79],3,{subject:'outdoors'}],
    ['R-top-writing','right','body',[24,18,49,43],5],
    ['R-middle-writing','right','body',[56,34,86,47],5],
    ['R-bottom-writing','right','body',[59,59,88,78],5],
    ['R-photo-caption','right','micro',[13,67,44,78],5,{color:'#FFFDF5',fontSizePt:7.5}],
    ['R-bottom-left-writing','right','body',[12,80,48,91],5],
    ['R-top-label','right','micro',[13,13,21,29],7],
    ['R-photo-word','right','word',[18,49,45,56],7,{fontSizePt:11}],
    ['R-middle-date','right','date',[50,50,89,57],8,{fontSizePt:23,fontWeight:700,color:'#6975A0',fillOpacity:0,outline:{color:'#6975A0',widthMm:.24}}],
    ['R-middle-arrow-one','right','word',[49,32,65,37],8,{fontSizePt:24,color:'#D8AFC9'}],
    ['R-middle-arrow-two','right','word',[49,38,65,43],8,{fontSizePt:24,color:'#B7D69C'}],
    ['L-citrus-second','left','accent',[54,62,65,71],9,{fill:'#93AF70',kind:'ellipse'}],
    ['R-mid-highlight','right','mark',[53,40,87,41],8,{fill:'#9BCBD3'}],
    ['R-mid-sticker','right','sticker',[48,50,54,57],9,{glyph:'✦',color:'#85A49B',fontSizePt:16}],
    ['R-bottom-label','right','micro',[13,88,48,93],8],
    ['R-bottom-sticker','right','sticker',[71,78,91,91],9,{motif:'doodle-animal'}],
    ['R-bottom-star','right','accent',[85,83,92,90],10,{fill:'#A7C9BC',kind:'star'}]
  ]}
];

// The diagram gives the object inventory. For visible objects, the finished
// photograph supplies the independent measured rectangle used for placement.
export const layoutSpreads=Object.freeze(spreadDefinitions.map(t=>Object.freeze({
 ...t,slots:Object.freeze(t.slots.map(s=>{
  const box=measuredBox(t.id,s[1],s[0]);
  return Object.freeze(box?[s[0],s[1],s[2],box,s[4],s[5]]:s);
 }))
})));

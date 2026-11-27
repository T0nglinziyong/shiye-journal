// Measured on the finished spread in each note's first image. The lower
// schematic is used to count object roles; it is not a pixel-accurate canvas.
// Source coordinates include the notebook but exclude the diagram below it.
export const sourceMeasurements=Object.freeze({
 'XHS-满满当当':{
  image:[1080,1509],pages:{left:[78,43,527,677],right:[528,49,974,674]},
  boxes:{
   'L-upper-note':[121,182,322,413],'L-lower-note':[183,381,491,583],
   'L-upper-photo':[286,106,436,314],'L-lower-photo':[111,410,283,582],
   'L-upper-title':[119,121,322,169],'L-upper-title-second':[212,158,359,203],
   'L-upper-sticker':[408,244,503,340],'L-mid-strip':[284,359,472,385],
   'L-upper-writing':[143,203,305,373],'L-lower-writing':[314,405,485,559],
   'L-bottom-caption':[161,551,355,639],
   'L-mid-strip-text':[310,360,470,383],
   'L-lower-sticker':[212,589,250,615],
   'L-bottom-highlight':[203,605,349,615],
   'R-upper-grid':[572,112,665,212],'R-upper-note':[658,120,931,327],
   'R-lower-note':[577,279,776,598],'R-lower-grid':[775,349,945,410],
   'R-upper-photo':[594,159,748,281],'R-lower-photo':[755,380,913,576],
   'R-top-strip':[596,107,819,135],'R-middle-word':[671,267,848,308],
   'R-upper-writing':[756,139,911,319],'R-lower-writing':[614,325,756,524],
   'R-lower-sticker':[669,503,809,585],'R-milk-bottle':[909,476,965,599],
   'R-top-strip-text':[611,109,810,132],
   'R-bottom-caption':[620,507,754,584],
   'R-photo-label':[806,386,872,413],
   'R-edge-dot':[570,108,593,133]
  },
  required:['L-upper-note','L-lower-note','L-upper-photo','L-lower-photo','L-upper-title','L-upper-title-second','L-upper-sticker','R-upper-note','R-lower-note','R-upper-photo','R-lower-photo','R-lower-sticker','R-milk-bottle']
 },
 'XHS-排版第四弹':{
  image:[1080,1440],pages:{left:[72,0,558,710],right:[560,0,1032,710]},
  boxes:{
   'L-upper-note':[112,74,518,345],'L-lower-card':[109,419,265,620],
   'L-upper-photo':[354,178,519,390],'L-lower-photo':[103,521,327,621],
   'L-upper-writing':[151,199,319,318],'L-upper-writing-top':[239,106,319,196],
   'L-lower-writing':[353,430,518,624],
   'L-upper-title':[358,125,520,162],'L-upper-sticker':[106,87,229,181],
   'L-middle-date':[196,385,296,432],'L-lower-sticker':[84,521,188,631],
   'L-middle-arrow':[271,432,348,480],
   'L-lower-card-title':[114,431,262,496],
   'L-lower-label':[177,600,285,635],
   'L-lower-label-text':[180,602,282,628],
   'L-edge-star':[252,502,287,536],
   'R-upper-note':[609,97,941,359],'R-lower-note':[611,518,1005,642],
   'R-upper-photo':[837,73,970,235],'R-lower-photo':[795,411,971,585],
   'R-upper-writing':[640,151,834,280],'R-lower-writing':[639,399,796,616],
   'R-mid-title':[625,300,977,351],'R-mid-strip':[737,512,810,553],
   'R-mid-strip-text':[743,516,807,541],
   'R-upper-label':[609,67,839,145],
   'R-upper-sticker':[794,185,868,251],
   'R-lower-label':[852,564,981,615]
  },
  required:['L-upper-note','L-lower-card','L-upper-photo','L-lower-photo','L-upper-sticker','L-lower-sticker','L-middle-date','R-upper-note','R-lower-note','R-upper-photo','R-lower-photo','R-mid-title']
 },
 'XHS-海岛排版':{
  image:[1080,1440],pages:{left:[51,39,549,724],right:[550,43,1022,725]},
  boxes:{
   'L-upper-grid':[121,97,465,266],'L-circle-note':[146,124,451,265],
   'L-upper-photo':[356,194,501,394],'L-lower-photo':[136,498,324,665],
   'L-circle-writing':[175,151,356,246],'L-mid-writing':[133,338,309,484],
   'L-lower-writing':[393,416,533,587],'L-upper-title':[106,276,359,332],
   'L-mid-accent':[317,401,373,457],
   'L-mid-highlight':[122,461,173,470],
   'L-upper-sticker':[451,192,492,227],
   'L-lower-tape':[115,458,175,529],
   'L-photo-label':[118,500,208,527],
   // 替换素材版用半透明纸承托原图字幕；这是对字幕范围的适配框，不是作者原图中的独立纸张。
   'L-bottom-caption-vellum':[305,600,505,672],
   'L-bottom-caption':[310,611,494,665],
  'L-citrus-second':[319,472,373,526],
  'R-blue-paper':[595,111,798,425],'R-lower-paper':[755,438,990,670],
   'R-top-photo':[797,112,967,249],'R-middle-photo':[663,368,789,566],
   'R-top-writing':[632,153,790,331],'R-middle-writing':[834,255,997,358],
   'R-bottom-writing':[830,468,985,550],'R-middle-date':[806,379,978,428],
   'R-bottom-sticker':[791,553,983,669],
   'R-photo-caption':[591,538,738,637],
   'R-bottom-left-writing':[594,571,776,650],
   'R-top-label':[598,119,667,264],
   'R-photo-word':[660,398,756,430],
   'R-middle-arrow-one':[797,264,853,306],
   'R-middle-arrow-two':[796,305,853,347],
   'R-mid-highlight':[598,352,663,393],
   'R-mid-sticker':[971,381,997,414],
   'R-bottom-label':[655,636,780,664],
   'R-bottom-star':[845,557,880,601]
  },
  required:['L-upper-grid','L-circle-note','L-upper-photo','L-lower-photo','L-upper-title','L-mid-accent','L-citrus-second','L-lower-tape','L-photo-label','L-bottom-caption-vellum','L-bottom-caption','R-blue-paper','R-lower-paper','R-top-photo','R-middle-photo','R-middle-date','R-bottom-sticker']
 }
});

export function measuredBox(templateId,page,id){
 const source=sourceMeasurements[templateId],box=source?.boxes[id];
 if(!box)return null;
 const [x0,y0,x1,y1]=source.pages[page],w=x1-x0,h=y1-y0;
 return [(box[0]-x0)/w*100,(box[1]-y0)/h*100,(box[2]-x0)/w*100,(box[3]-y0)/h*100].map(v=>Math.round(v*100)/100);
}

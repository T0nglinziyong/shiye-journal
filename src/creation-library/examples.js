export const exampleMaterials=[
 {id:'example-photo',alias:'m1',title:'示意照片',kind:'photo',role:'focal',physicalWidthMM:28,physicalHeightMM:38,supply:{quantity:1}},
 {id:'example-card',alias:'m2',title:'示意卡片',kind:'card',role:'secondary',physicalWidthMM:22,physicalHeightMM:26,supply:{quantity:1}},
 {id:'example-paper',alias:'m3',title:'示意图案纸',kind:'paper',role:'background',physicalWidthMM:42,physicalHeightMM:32,supply:{quantity:1}},
 {id:'example-tape',alias:'m4',title:'示意胶带',kind:'tape',role:'connector',physicalWidthMM:100,physicalHeightMM:6,tapeAxis:'horizontal',supply:{quantity:1}},
 {id:'example-ticket',alias:'m5',title:'示意票根（非真实票据）',kind:'ticket',role:'secondary',physicalWidthMM:22,physicalHeightMM:46,supply:{quantity:1}},
 {id:'example-note',alias:'m6',title:'示意空白便签',kind:'note',role:'information',physicalWidthMM:42,physicalHeightMM:32,supply:{quantity:1}},
 {id:'example-strip',alias:'m7',title:'示意纸条',kind:'paper',role:'connector',physicalWidthMM:60,physicalHeightMM:4,supply:{quantity:1}}
];
export function techniqueExample(method){
 const p={id:'demo',at:[72,88]},before=[];
 if(method.recipe==='title')p.text='收集小美好';
 if(method.recipe==='accent'&&method.defaults.motif==='materials')p.aliases=['m1','m2'];
 if(method.recipe==='film'){p.aliases=['m1','m2','m3'];p.at=[74,88];}
 if(method.recipe==='materials'){p.aliases=['m1','m2','m3'];if(method.defaults.captionPosition)p.caption='一片颜色，一段小记。';}
 if(method.id==='magazine-offset'){p.aliases=['m1','m2','m5'];p.caption='示意图注';}
 if(method.recipe==='tape'){
  p.aliases=['m4'];
  if(method.id==='tape-fix')before.push({op:'material.add',id:'photo',asset:'m1',place:{reference:'page',at:[72,107],unit:'mm'}});
  if(method.id==='tape-corners'){
   p.widthMm=42;p.heightMm=32;
   p.segments=[{at:[2,2],rotationDeg:-35,lengthMm:15},{at:[40,30],rotationDeg:145,lengthMm:20}];
   before.push({op:'material.add',id:'paper',asset:'m3',place:{reference:'page',at:[72,88],unit:'mm'}});
  }
  if(method.id==='tape-divider')before.push({op:'material.add',id:'card',asset:'m2',place:{reference:'page',at:[72,72],unit:'mm'}},{op:'material.add',id:'note',asset:'m6',place:{reference:'page',at:[72,106],unit:'mm'}});
 }
 if(method.recipe==='record')p.items=['留下一片颜色','写下一句短记','收好今天的小物'];
 if(method.recipe==='write'){
  delete p.at;p.target='note';p.box=[.12,.16,.76,.68];p.text='留一片颜色，\n记一件小事。';p.fontSizePt=11;
  before.push({op:'material.add',id:'note',asset:'m6',place:{reference:'page',at:[70,80],unit:'mm',rotationDeg:-8}});
 }
 if(['relate','tear','window','split'].includes(method.recipe)){
  delete p.at;p.target='paper';before.push({op:'material.add',id:'paper',asset:'m3',place:{reference:'page',at:[70,80],unit:'mm'}});
  if(method.recipe==='relate'){p.referenceTarget='card';before.push({op:'material.add',id:'card',asset:'m2',place:{reference:'page',at:[70,80],unit:'mm'}});}
  if(method.recipe==='tear')p.path={points:[[0,.4],[.3,.5],[.7,.35],[1,.5]],unit:'ratio'};
  if(method.recipe==='window')p.box=[.2,.2,.6,.6];
 }
 if(method.recipe==='weave'){
  delete p.at;p.strip='strip';p.through=[{target:'frame',region:{shape:'rect',space:'local',unit:'ratio',box:[.18,.2,.1,.6]},sideAfter:'front'},{target:'frame',region:{shape:'rect',space:'local',unit:'ratio',box:[.72,.2,.1,.6]},sideAfter:'back'}];
  before.push({op:'material.add',id:'strip',asset:'m7',place:{reference:'page',at:[70,80],unit:'mm'}},{op:'material.add',id:'frame',asset:'m3',place:{reference:'page',at:[70,80],unit:'mm'}});
 }
 return {parameters:{...p,...method.example},before};
}
